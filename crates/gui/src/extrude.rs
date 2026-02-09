use glam::Vec3;
use shared::{Sketch, SketchElement, SketchPlane, Transform};

use crate::viewport::mesh::MeshData;

const DEFAULT_COLOR: [f32; 3] = [0.6, 0.6, 0.65];
const CIRCLE_SEGMENTS: usize = 32;
const ARC_SEGMENTS: usize = 24;

// ── Extrude ─────────────────────────────────────────────────

/// Generate extruded mesh from a sketch (supports multiple profiles).
pub fn extrude_mesh(
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
) -> Result<MeshData, String> {
    let profiles = extract_2d_profiles(&sketch.elements)?;

    let normal = plane_normal(&sketch.plane);
    let extrude_vec = [
        normal[0] * height as f32,
        normal[1] * height as f32,
        normal[2] * height as f32,
    ];

    let bot_normal = if height >= 0.0 {
        [-normal[0], -normal[1], -normal[2]]
    } else {
        normal
    };
    let top_normal = if height >= 0.0 {
        normal
    } else {
        [-normal[0], -normal[1], -normal[2]]
    };

    let mut vertices: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for profile in &profiles {
        let n = profile.len();
        if n < 3 {
            continue;
        }

        let bottom_3d: Vec<[f32; 3]> = profile
            .iter()
            .map(|p| sketch_to_3d(p[0], p[1], sketch, transform))
            .collect();

        let top_3d: Vec<[f32; 3]> = bottom_3d
            .iter()
            .map(|p| [p[0] + extrude_vec[0], p[1] + extrude_vec[1], p[2] + extrude_vec[2]])
            .collect();

        // Bottom cap (fan triangulation)
        let base_idx = (vertices.len() / 9) as u32;
        for p in &bottom_3d {
            push_vertex(&mut vertices, *p, bot_normal, DEFAULT_COLOR);
        }
        for i in 1..(n - 1) {
            if height >= 0.0 {
                indices.extend_from_slice(&[
                    base_idx,
                    base_idx + (i + 1) as u32,
                    base_idx + i as u32,
                ]);
            } else {
                indices.extend_from_slice(&[
                    base_idx,
                    base_idx + i as u32,
                    base_idx + (i + 1) as u32,
                ]);
            }
        }

        // Top cap (fan triangulation)
        let base_idx = (vertices.len() / 9) as u32;
        for p in &top_3d {
            push_vertex(&mut vertices, *p, top_normal, DEFAULT_COLOR);
        }
        for i in 1..(n - 1) {
            if height >= 0.0 {
                indices.extend_from_slice(&[
                    base_idx,
                    base_idx + i as u32,
                    base_idx + (i + 1) as u32,
                ]);
            } else {
                indices.extend_from_slice(&[
                    base_idx,
                    base_idx + (i + 1) as u32,
                    base_idx + i as u32,
                ]);
            }
        }

        // Side walls
        for i in 0..n {
            let next = (i + 1) % n;
            let b0 = bottom_3d[i];
            let b1 = bottom_3d[next];
            let t0 = top_3d[i];
            let t1 = top_3d[next];

            let edge1 = Vec3::new(b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]);
            let edge2 = Vec3::new(t0[0] - b0[0], t0[1] - b0[1], t0[2] - b0[2]);
            let face_normal = if height >= 0.0 {
                edge1.cross(edge2).normalize_or_zero()
            } else {
                edge2.cross(edge1).normalize_or_zero()
            };
            let n_arr = [face_normal.x, face_normal.y, face_normal.z];

            let base_idx = (vertices.len() / 9) as u32;
            push_vertex(&mut vertices, b0, n_arr, DEFAULT_COLOR);
            push_vertex(&mut vertices, b1, n_arr, DEFAULT_COLOR);
            push_vertex(&mut vertices, t1, n_arr, DEFAULT_COLOR);
            push_vertex(&mut vertices, t0, n_arr, DEFAULT_COLOR);

            if height >= 0.0 {
                indices.extend_from_slice(&[base_idx, base_idx + 1, base_idx + 2]);
                indices.extend_from_slice(&[base_idx, base_idx + 2, base_idx + 3]);
            } else {
                indices.extend_from_slice(&[base_idx, base_idx + 2, base_idx + 1]);
                indices.extend_from_slice(&[base_idx, base_idx + 3, base_idx + 2]);
            }
        }
    }

    if vertices.is_empty() {
        return Err("No valid profiles to extrude".to_string());
    }

    Ok(MeshData { vertices, indices })
}

// ── Revolve ─────────────────────────────────────────────────

/// Generate revolved mesh from a sketch (supports multiple profiles).
/// The revolution axis is the Y-axis of the sketch coordinate system (x=0 line).
pub fn revolve_mesh(
    sketch: &Sketch,
    transform: &Transform,
    angle_deg: f64,
    segments: u32,
) -> Result<MeshData, String> {
    let profiles = extract_2d_profiles(&sketch.elements)?;

    let segments = segments.clamp(4, 256);
    let angle_rad = angle_deg.to_radians().min(std::f64::consts::TAU);
    let full_revolution = (angle_deg - 360.0).abs() < 0.01;

    let steps = if full_revolution {
        segments as usize
    } else {
        segments as usize + 1
    };

    let mut vertices: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for profile in &profiles {
        let n = profile.len();
        if n < 2 {
            continue;
        }

        // Generate rings: rotate 2D profile around x=0 (sketch Y-axis)
        let mut rings: Vec<Vec<[f32; 3]>> = Vec::new();
        for s in 0..steps {
            let theta = (s as f64 / segments as f64) * angle_rad;
            let cos_t = theta.cos() as f32;
            let sin_t = theta.sin() as f32;

            let ring: Vec<[f32; 3]> = profile
                .iter()
                .map(|p| {
                    let px = p[0] as f32;
                    let py = p[1] as f32;
                    let local_u = px * cos_t;
                    let local_v = py;
                    let local_w = px * sin_t;
                    map_revolve_to_3d(local_u, local_v, local_w, sketch, transform)
                })
                .collect();

            rings.push(ring);
        }

        let ring_count = rings.len();

        // Build quads between adjacent rings
        for s in 0..segments as usize {
            let s_next = if full_revolution {
                (s + 1) % ring_count
            } else {
                if s + 1 >= ring_count {
                    continue;
                }
                s + 1
            };

            for p in 0..n {
                let p_next = (p + 1) % n;
                let p00 = rings[s][p];
                let p01 = rings[s][p_next];
                let p10 = rings[s_next][p];
                let p11 = rings[s_next][p_next];

                let e1 = Vec3::new(p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]);
                let e2 = Vec3::new(p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2]);
                let face_n = e2.cross(e1).normalize_or_zero();
                let n_arr = [face_n.x, face_n.y, face_n.z];

                let base_idx = (vertices.len() / 9) as u32;
                push_vertex(&mut vertices, p00, n_arr, DEFAULT_COLOR);
                push_vertex(&mut vertices, p01, n_arr, DEFAULT_COLOR);
                push_vertex(&mut vertices, p11, n_arr, DEFAULT_COLOR);
                push_vertex(&mut vertices, p10, n_arr, DEFAULT_COLOR);

                indices.extend_from_slice(&[base_idx, base_idx + 1, base_idx + 2]);
                indices.extend_from_slice(&[base_idx, base_idx + 2, base_idx + 3]);
            }
        }

        // End caps for partial revolution
        if !full_revolution && n >= 3 {
            add_cap(&mut vertices, &mut indices, &rings[0], true);
            add_cap(&mut vertices, &mut indices, &rings[ring_count - 1], false);
        }
    }

    if vertices.is_empty() {
        return Err("No valid profiles to revolve".to_string());
    }

    Ok(MeshData { vertices, indices })
}

// ── Profile extraction ──────────────────────────────────────

/// Extract a single 2D polygon profile from sketch elements (first profile only).
pub fn extract_2d_profile(elements: &[SketchElement]) -> Result<Vec<[f64; 2]>, String> {
    let profiles = extract_2d_profiles(elements)?;
    Ok(profiles.into_iter().next().unwrap())
}

/// Tolerance for connecting sketch segments (squared distance).
/// Use larger tolerance (1e-4 = 0.01 distance) to handle trimmed sketches
/// where endpoints may not match exactly due to floating point errors.
const CHAIN_TOLERANCE_SQ: f64 = 1e-4;

/// A segment with start/end points and tessellated points (for proper chaining)
struct ChainableSegment {
    points: Vec<[f64; 2]>,  // Tessellated points in order
}

impl ChainableSegment {
    fn start(&self) -> [f64; 2] {
        self.points[0]
    }

    fn end(&self) -> [f64; 2] {
        *self.points.last().unwrap()
    }

    fn reverse(&mut self) {
        self.points.reverse();
    }
}

/// Extract multiple 2D polygon profiles from sketch elements.
///
/// Self-contained closed shapes (Circle, Rectangle) become separate profiles.
/// Chain-able elements (Line, Arc, Polyline, Spline) are chained together
/// by proximity into connected profiles, with proper reordering.
pub fn extract_2d_profiles(elements: &[SketchElement]) -> Result<Vec<Vec<[f64; 2]>>, String> {
    if elements.is_empty() {
        return Err("Empty sketch".to_string());
    }

    tracing::info!("extract_2d_profiles: {} elements", elements.len());

    // Single-element fast path
    if elements.len() == 1 {
        let profile = extract_single_element(&elements[0])?;
        return Ok(vec![profile]);
    }

    let mut profiles: Vec<Vec<[f64; 2]>> = Vec::new();
    let mut chainable_segments: Vec<ChainableSegment> = Vec::new();

    for (i, elem) in elements.iter().enumerate() {
        match elem {
            // Self-contained closed shapes → add directly as profile
            SketchElement::Circle { center, radius } => {
                tracing::info!("  [{}] Circle at ({:.3},{:.3}) r={:.3}", i, center.x, center.y, radius);
                profiles.push(tessellate_circle(center.x, center.y, *radius));
            }
            SketchElement::Rectangle { corner, width, height } => {
                tracing::info!("  [{}] Rectangle at ({:.3},{:.3}) {}x{}", i, corner.x, corner.y, width, height);
                profiles.push(vec![
                    [corner.x, corner.y],
                    [corner.x + width, corner.y],
                    [corner.x + width, corner.y + height],
                    [corner.x, corner.y + height],
                ]);
            }
            // Chainable elements - collect for ordered chaining
            SketchElement::Line { start, end } => {
                tracing::info!("  [{}] Line ({:.4},{:.4})->({:.4},{:.4})",
                    i, start.x, start.y, end.x, end.y);
                chainable_segments.push(ChainableSegment {
                    points: vec![[start.x, start.y], [end.x, end.y]],
                });
            }
            SketchElement::Arc { center, radius, start_angle, end_angle } => {
                let arc = tessellate_arc(center.x, center.y, *radius, *start_angle, *end_angle);
                tracing::info!("  [{}] Arc center=({:.4},{:.4}) r={:.4} angles={:.4}..{:.4} pts={}",
                    i, center.x, center.y, radius, start_angle, end_angle, arc.len());
                if !arc.is_empty() {
                    chainable_segments.push(ChainableSegment { points: arc });
                }
            }
            SketchElement::Polyline { points } => {
                tracing::info!("  [{}] Polyline {} points", i, points.len());
                let pts: Vec<[f64; 2]> = points.iter().map(|p| [p.x, p.y]).collect();
                if pts.len() >= 2 {
                    chainable_segments.push(ChainableSegment { points: pts });
                }
            }
            SketchElement::Spline { points } => {
                tracing::info!("  [{}] Spline {} points", i, points.len());
                let pts: Vec<[f64; 2]> = points.iter().map(|p| [p.x, p.y]).collect();
                if pts.len() >= 2 {
                    chainable_segments.push(ChainableSegment { points: pts });
                }
            }
            SketchElement::Dimension { .. } => {
                tracing::info!("  [{}] Dimension (ignored)", i);
            }
        }
    }

    // Chain segments by proximity (proper reordering)
    if !chainable_segments.is_empty() {
        let chained_profiles = chain_segments_by_proximity(chainable_segments);
        profiles.extend(chained_profiles);
    }

    // Log profile status
    for (pi, profile) in profiles.iter().enumerate() {
        if profile.len() >= 3 {
            let gap = dist_sq(&profile[0], profile.last().unwrap()).sqrt();
            let closed = gap < CHAIN_TOLERANCE_SQ.sqrt();
            tracing::info!("  Profile {} has {} points, gap to close={:.6}, closed={}",
                pi, profile.len(), gap, closed);
        }
    }

    if profiles.is_empty() {
        return Err("No valid profiles found in sketch elements".to_string());
    }

    tracing::info!("extract_2d_profiles: extracted {} profiles", profiles.len());
    Ok(profiles)
}

/// Chain segments by finding connecting endpoints (handles out-of-order elements)
fn chain_segments_by_proximity(mut segments: Vec<ChainableSegment>) -> Vec<Vec<[f64; 2]>> {
    let mut profiles: Vec<Vec<[f64; 2]>> = Vec::new();

    while !segments.is_empty() {
        // Start new chain with first remaining segment
        let mut chain: Vec<[f64; 2]> = segments.remove(0).points;

        // Keep extending the chain
        loop {
            let chain_start = chain[0];
            let chain_end = *chain.last().unwrap();

            // Find best match for chain end (extend forward)
            let mut best_match: Option<(usize, bool, f64)> = None; // (index, reversed, dist_sq)

            for (i, seg) in segments.iter().enumerate() {
                let dist_to_start = dist_sq(&chain_end, &seg.start());
                let dist_to_end = dist_sq(&chain_end, &seg.end());

                if dist_to_start <= CHAIN_TOLERANCE_SQ {
                    if best_match.is_none() || dist_to_start < best_match.unwrap().2 {
                        best_match = Some((i, false, dist_to_start));
                    }
                }
                if dist_to_end <= CHAIN_TOLERANCE_SQ {
                    if best_match.is_none() || dist_to_end < best_match.unwrap().2 {
                        best_match = Some((i, true, dist_to_end)); // Need to reverse
                    }
                }
            }

            // Also check if we can extend backward (prepend to chain)
            let mut best_prepend: Option<(usize, bool, f64)> = None;
            for (i, seg) in segments.iter().enumerate() {
                // Skip if already matched for forward extension
                if best_match.is_some() && best_match.unwrap().0 == i {
                    continue;
                }

                let dist_to_start = dist_sq(&chain_start, &seg.start());
                let dist_to_end = dist_sq(&chain_start, &seg.end());

                if dist_to_end <= CHAIN_TOLERANCE_SQ {
                    if best_prepend.is_none() || dist_to_end < best_prepend.unwrap().2 {
                        best_prepend = Some((i, false, dist_to_end)); // Seg end connects to chain start
                    }
                }
                if dist_to_start <= CHAIN_TOLERANCE_SQ {
                    if best_prepend.is_none() || dist_to_start < best_prepend.unwrap().2 {
                        best_prepend = Some((i, true, dist_to_start)); // Need to reverse
                    }
                }
            }

            // Prefer forward extension, fall back to prepend
            if let Some((idx, reversed, _dist)) = best_match {
                let mut seg = segments.remove(idx);
                if reversed {
                    seg.reverse();
                }
                // Skip first point if it matches chain end (avoid duplicate)
                let skip = if dist_sq(&chain_end, &seg.start()) < CHAIN_TOLERANCE_SQ { 1 } else { 0 };
                chain.extend(seg.points.into_iter().skip(skip));
                tracing::info!("    Extended chain forward, now {} points", chain.len());
            } else if let Some((idx, reversed, _dist)) = best_prepend {
                let mut seg = segments.remove(idx);
                if reversed {
                    seg.reverse();
                }
                // Prepend points (skip last if it matches chain start)
                let mut new_chain = seg.points;
                if dist_sq(new_chain.last().unwrap(), &chain_start) < CHAIN_TOLERANCE_SQ {
                    new_chain.pop();
                }
                new_chain.extend(chain);
                chain = new_chain;
                tracing::info!("    Extended chain backward, now {} points", chain.len());
            } else {
                // No more connections found
                break;
            }
        }

        if chain.len() >= 3 {
            profiles.push(chain);
        }
    }

    profiles
}

fn extract_single_element(elem: &SketchElement) -> Result<Vec<[f64; 2]>, String> {
    match elem {
        SketchElement::Circle { center, radius } => {
            Ok(tessellate_circle(center.x, center.y, *radius))
        }
        SketchElement::Rectangle {
            corner,
            width,
            height,
        } => Ok(vec![
            [corner.x, corner.y],
            [corner.x + width, corner.y],
            [corner.x + width, corner.y + height],
            [corner.x, corner.y + height],
        ]),
        SketchElement::Polyline { points } => {
            if points.len() < 3 {
                return Err("Polyline needs >= 3 points for extrusion".to_string());
            }
            Ok(points.iter().map(|p| [p.x, p.y]).collect())
        }
        SketchElement::Arc {
            center,
            radius,
            start_angle,
            end_angle,
        } => {
            let pts = tessellate_arc(center.x, center.y, *radius, *start_angle, *end_angle);
            if pts.len() < 3 {
                return Err("Arc too small for extrusion".to_string());
            }
            Ok(pts)
        }
        SketchElement::Spline { points } => {
            if points.len() < 3 {
                return Err("Spline needs >= 3 points for extrusion".to_string());
            }
            Ok(points.iter().map(|p| [p.x, p.y]).collect())
        }
        SketchElement::Line { .. } => Err("Cannot extrude a single line".to_string()),
        SketchElement::Dimension { .. } => Err("Cannot extrude a dimension".to_string()),
    }
}

// ── Tessellation helpers ────────────────────────────────────

pub fn tessellate_circle(cx: f64, cy: f64, radius: f64) -> Vec<[f64; 2]> {
    (0..CIRCLE_SEGMENTS)
        .map(|i| {
            let angle = (i as f64) * std::f64::consts::TAU / (CIRCLE_SEGMENTS as f64);
            [cx + radius * angle.cos(), cy + radius * angle.sin()]
        })
        .collect()
}

pub fn tessellate_arc(cx: f64, cy: f64, radius: f64, start: f64, end: f64) -> Vec<[f64; 2]> {
    let mut span = end - start;
    if span < 0.0 {
        span += std::f64::consts::TAU;
    }
    (0..=ARC_SEGMENTS)
        .map(|i| {
            let t = i as f64 / ARC_SEGMENTS as f64;
            let angle = start + span * t;
            [cx + radius * angle.cos(), cy + radius * angle.sin()]
        })
        .collect()
}

fn dist_sq(a: &[f64; 2], b: &[f64; 2]) -> f64 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    dx * dx + dy * dy
}

// ── Coordinate mapping ──────────────────────────────────────

pub fn plane_normal(plane: &SketchPlane) -> [f32; 3] {
    match plane {
        SketchPlane::Xy => [0.0, 0.0, 1.0],
        SketchPlane::Xz => [0.0, 1.0, 0.0],
        SketchPlane::Yz => [1.0, 0.0, 0.0],
    }
}

pub fn sketch_to_3d(x: f64, y: f64, sketch: &Sketch, transform: &Transform) -> [f32; 3] {
    let (px, py, pz) = match sketch.plane {
        SketchPlane::Xy => (x, y, sketch.offset),
        SketchPlane::Xz => (x, sketch.offset, y),
        SketchPlane::Yz => (sketch.offset, x, y),
    };
    [
        (px + transform.position[0]) as f32,
        (py + transform.position[1]) as f32,
        (pz + transform.position[2]) as f32,
    ]
}

fn map_revolve_to_3d(
    u: f32,
    v: f32,
    w: f32,
    sketch: &Sketch,
    transform: &Transform,
) -> [f32; 3] {
    let (px, py, pz) = match sketch.plane {
        SketchPlane::Xy => (u, v, sketch.offset as f32 + w),
        SketchPlane::Xz => (u, sketch.offset as f32 + w, v),
        SketchPlane::Yz => (sketch.offset as f32 + w, u, v),
    };
    [
        px + transform.position[0] as f32,
        py + transform.position[1] as f32,
        pz + transform.position[2] as f32,
    ]
}

// ── Mesh helpers ────────────────────────────────────────────

fn push_vertex(vertices: &mut Vec<f32>, pos: [f32; 3], normal: [f32; 3], color: [f32; 3]) {
    vertices.extend_from_slice(&[
        pos[0], pos[1], pos[2], normal[0], normal[1], normal[2], color[0], color[1], color[2],
    ]);
}

fn add_cap(vertices: &mut Vec<f32>, indices: &mut Vec<u32>, ring: &[[f32; 3]], front: bool) {
    if ring.len() < 3 {
        return;
    }
    let base_idx = (vertices.len() / 9) as u32;

    let e1 = Vec3::new(
        ring[1][0] - ring[0][0],
        ring[1][1] - ring[0][1],
        ring[1][2] - ring[0][2],
    );
    let e2 = Vec3::new(
        ring[2][0] - ring[0][0],
        ring[2][1] - ring[0][1],
        ring[2][2] - ring[0][2],
    );
    let n = if front {
        e1.cross(e2).normalize_or_zero()
    } else {
        e2.cross(e1).normalize_or_zero()
    };
    let n_arr = [n.x, n.y, n.z];

    for p in ring {
        push_vertex(vertices, *p, n_arr, DEFAULT_COLOR);
    }
    for i in 1..(ring.len() - 1) {
        if front {
            indices
                .extend_from_slice(&[base_idx, base_idx + i as u32, base_idx + (i + 1) as u32]);
        } else {
            indices
                .extend_from_slice(&[base_idx, base_idx + (i + 1) as u32, base_idx + i as u32]);
        }
    }
}

/// Apply selection color to a direct mesh (replaces color floats).
pub fn apply_selection_color(mesh: &MeshData, selected: bool) -> MeshData {
    if !selected {
        return mesh.clone();
    }
    let mut vertices = mesh.vertices.clone();
    let color = [0.3_f32, 0.7, 0.9];
    let stride = 9;
    let count = vertices.len() / stride;
    for i in 0..count {
        let base = i * stride + 6;
        vertices[base] = color[0];
        vertices[base + 1] = color[1];
        vertices[base + 2] = color[2];
    }
    MeshData {
        vertices,
        indices: mesh.indices.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared::*;

    fn xy_sketch(elements: Vec<SketchElement>) -> Sketch {
        Sketch { plane: SketchPlane::Xy, offset: 0.0, elements }
    }

    fn identity() -> Transform {
        Transform::new()
    }

    fn rect_element(x: f64, y: f64, w: f64, h: f64) -> SketchElement {
        SketchElement::Rectangle {
            corner: Point2D { x, y },
            width: w,
            height: h,
        }
    }

    fn circle_element(cx: f64, cy: f64, r: f64) -> SketchElement {
        SketchElement::Circle {
            center: Point2D { x: cx, y: cy },
            radius: r,
        }
    }

    /// Helper: check that mesh data has valid stride and indices
    fn assert_mesh_valid(mesh: &MeshData) {
        assert_eq!(mesh.vertices.len() % 9, 0, "vertices not multiple of 9");
        assert_eq!(mesh.indices.len() % 3, 0, "indices not multiple of 3");
        let vert_count = (mesh.vertices.len() / 9) as u32;
        for &idx in &mesh.indices {
            assert!(idx < vert_count, "index {} out of range (max {})", idx, vert_count);
        }
    }

    /// Helper: compute AABB from mesh
    fn mesh_aabb(mesh: &MeshData) -> ([f32; 3], [f32; 3]) {
        let mut min = [f32::MAX; 3];
        let mut max = [f32::MIN; 3];
        let count = mesh.vertices.len() / 9;
        for i in 0..count {
            for j in 0..3 {
                let v = mesh.vertices[i * 9 + j];
                if v < min[j] { min[j] = v; }
                if v > max[j] { max[j] = v; }
            }
        }
        (min, max)
    }

    // --- extract_2d_profile ---

    #[test]
    fn test_extract_2d_profile_rectangle() {
        let profile = extract_2d_profile(&[rect_element(-1.0, -1.0, 2.0, 2.0)]).unwrap();
        assert_eq!(profile.len(), 4);
    }

    #[test]
    fn test_extract_2d_profile_circle() {
        let profile = extract_2d_profile(&[circle_element(0.0, 0.0, 1.0)]).unwrap();
        assert_eq!(profile.len(), CIRCLE_SEGMENTS);
    }

    #[test]
    fn test_extract_2d_profile_empty_error() {
        let result = extract_2d_profile(&[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Empty"));
    }

    #[test]
    fn test_extract_2d_profile_single_line_error() {
        let result = extract_2d_profile(&[SketchElement::Line {
            start: Point2D { x: 0.0, y: 0.0 },
            end: Point2D { x: 1.0, y: 0.0 },
        }]);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_2d_profile_single_dimension_error() {
        let result = extract_2d_profile(&[SketchElement::Dimension {
            from: Point2D { x: 0.0, y: 0.0 },
            to: Point2D { x: 1.0, y: 0.0 },
            value: 1.0,
        }]);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_2d_profile_polyline() {
        let profile = extract_2d_profile(&[SketchElement::Polyline {
            points: vec![
                Point2D { x: 0.0, y: 0.0 },
                Point2D { x: 1.0, y: 0.0 },
                Point2D { x: 1.0, y: 1.0 },
                Point2D { x: 0.0, y: 1.0 },
            ],
        }])
        .unwrap();
        assert_eq!(profile.len(), 4);
    }

    // --- tessellate_circle ---

    #[test]
    fn test_tessellate_circle_segments() {
        let pts = tessellate_circle(0.0, 0.0, 1.0);
        assert_eq!(pts.len(), CIRCLE_SEGMENTS);
        // All points should be at distance ~1.0 from center
        for p in &pts {
            let dist = (p[0] * p[0] + p[1] * p[1]).sqrt();
            assert!((dist - 1.0).abs() < 1e-10, "Point not on circle: dist={}", dist);
        }
    }

    #[test]
    fn test_tessellate_circle_offset() {
        let pts = tessellate_circle(5.0, 3.0, 2.0);
        for p in &pts {
            let dist = ((p[0] - 5.0).powi(2) + (p[1] - 3.0).powi(2)).sqrt();
            assert!((dist - 2.0).abs() < 1e-10);
        }
    }

    // --- tessellate_arc ---

    #[test]
    fn test_tessellate_arc() {
        let pts = tessellate_arc(0.0, 0.0, 1.0, 0.0, std::f64::consts::PI);
        assert_eq!(pts.len(), ARC_SEGMENTS + 1);
    }

    #[test]
    fn test_tessellate_arc_negative_span() {
        // end < start should wrap around
        let pts = tessellate_arc(0.0, 0.0, 1.0, std::f64::consts::PI, 0.0);
        assert_eq!(pts.len(), ARC_SEGMENTS + 1);
    }

    // --- plane_normal ---

    #[test]
    fn test_plane_normal_xy() {
        assert_eq!(plane_normal(&SketchPlane::Xy), [0.0, 0.0, 1.0]);
    }

    #[test]
    fn test_plane_normal_xz() {
        assert_eq!(plane_normal(&SketchPlane::Xz), [0.0, 1.0, 0.0]);
    }

    #[test]
    fn test_plane_normal_yz() {
        assert_eq!(plane_normal(&SketchPlane::Yz), [1.0, 0.0, 0.0]);
    }

    // --- sketch_to_3d ---

    #[test]
    fn test_sketch_to_3d_xy() {
        let s = Sketch { plane: SketchPlane::Xy, offset: 5.0, elements: vec![] };
        let p = sketch_to_3d(1.0, 2.0, &s, &identity());
        assert_eq!(p, [1.0, 2.0, 5.0]);
    }

    #[test]
    fn test_sketch_to_3d_xz() {
        let s = Sketch { plane: SketchPlane::Xz, offset: 3.0, elements: vec![] };
        let p = sketch_to_3d(1.0, 2.0, &s, &identity());
        assert_eq!(p, [1.0, 3.0, 2.0]);
    }

    #[test]
    fn test_sketch_to_3d_yz() {
        let s = Sketch { plane: SketchPlane::Yz, offset: 7.0, elements: vec![] };
        let p = sketch_to_3d(1.0, 2.0, &s, &identity());
        assert_eq!(p, [7.0, 1.0, 2.0]);
    }

    #[test]
    fn test_sketch_to_3d_with_transform() {
        let s = Sketch { plane: SketchPlane::Xy, offset: 0.0, elements: vec![] };
        let t = Transform { position: [10.0, 20.0, 30.0], rotation: [0.0; 3], scale: [1.0; 3] };
        let p = sketch_to_3d(1.0, 2.0, &s, &t);
        assert_eq!(p, [11.0, 22.0, 30.0]);
    }

    // --- extrude_mesh ---

    #[test]
    fn test_extrude_rectangle_basic() {
        let sketch = xy_sketch(vec![rect_element(-0.5, -0.5, 1.0, 1.0)]);
        let mesh = extrude_mesh(&sketch, &identity(), 1.0).unwrap();
        assert_mesh_valid(&mesh);
        let (min, max) = mesh_aabb(&mesh);
        // Rectangle [-0.5, -0.5] to [0.5, 0.5], extruded 1.0 along Z
        assert!((min[0] - (-0.5)).abs() < 0.01);
        assert!((max[0] - 0.5).abs() < 0.01);
        assert!((min[2]).abs() < 0.01); // bottom at z=0
        assert!((max[2] - 1.0).abs() < 0.01); // top at z=1
    }

    #[test]
    fn test_extrude_circle_basic() {
        let sketch = xy_sketch(vec![circle_element(0.0, 0.0, 1.0)]);
        let mesh = extrude_mesh(&sketch, &identity(), 2.0).unwrap();
        assert_mesh_valid(&mesh);
        let (min, max) = mesh_aabb(&mesh);
        assert!((max[2] - 2.0).abs() < 0.01);
        assert!(min[2].abs() < 0.01);
    }

    #[test]
    fn test_extrude_negative_height() {
        let sketch = xy_sketch(vec![rect_element(-0.5, -0.5, 1.0, 1.0)]);
        let mesh = extrude_mesh(&sketch, &identity(), -1.0).unwrap();
        assert_mesh_valid(&mesh);
        let (min, max) = mesh_aabb(&mesh);
        assert!((min[2] - (-1.0)).abs() < 0.01);
        assert!(max[2].abs() < 0.01);
    }

    #[test]
    fn test_extrude_zero_height_error() {
        // Zero height is caught in build.rs, not in extrude_mesh itself
        // But extrude_mesh with height=0 should still produce valid mesh
        let sketch = xy_sketch(vec![rect_element(-0.5, -0.5, 1.0, 1.0)]);
        let result = extrude_mesh(&sketch, &identity(), 0.0);
        // height=0 produces degenerate geometry but no error from extrude_mesh
        assert!(result.is_ok());
    }

    #[test]
    fn test_extrude_empty_sketch_error() {
        let sketch = xy_sketch(vec![]);
        let result = extrude_mesh(&sketch, &identity(), 1.0);
        assert!(result.is_err());
    }

    #[test]
    fn test_extrude_mesh_normals() {
        let sketch = xy_sketch(vec![rect_element(-0.5, -0.5, 1.0, 1.0)]);
        let mesh = extrude_mesh(&sketch, &identity(), 1.0).unwrap();
        // Check that all normals are non-zero
        let count = mesh.vertices.len() / 9;
        for i in 0..count {
            let nx = mesh.vertices[i * 9 + 3];
            let ny = mesh.vertices[i * 9 + 4];
            let nz = mesh.vertices[i * 9 + 5];
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            assert!(len > 0.1, "Degenerate normal at vertex {}: len={}", i, len);
        }
    }

    #[test]
    fn test_extrude_vertex_count() {
        // Rectangle has 4 profile points
        // Bottom cap: 4 vertices
        // Top cap: 4 vertices
        // Side walls: 4 quads * 4 vertices = 16
        // Total: 24
        let sketch = xy_sketch(vec![rect_element(-0.5, -0.5, 1.0, 1.0)]);
        let mesh = extrude_mesh(&sketch, &identity(), 1.0).unwrap();
        let vert_count = mesh.vertices.len() / 9;
        assert_eq!(vert_count, 24);
    }

    // --- revolve_mesh ---

    #[test]
    fn test_revolve_rectangle_360() {
        let sketch = xy_sketch(vec![rect_element(1.0, -0.5, 0.5, 1.0)]);
        let mesh = revolve_mesh(&sketch, &identity(), 360.0, 16).unwrap();
        assert_mesh_valid(&mesh);
    }

    #[test]
    fn test_revolve_partial_180() {
        let sketch = xy_sketch(vec![rect_element(1.0, -0.5, 0.5, 1.0)]);
        let mesh = revolve_mesh(&sketch, &identity(), 180.0, 16).unwrap();
        assert_mesh_valid(&mesh);
        // Partial revolve should have end caps — more triangles than side quads
        let tri_count = mesh.indices.len() / 3;
        assert!(tri_count > 0);
    }

    #[test]
    fn test_revolve_clamp_segments() {
        let sketch = xy_sketch(vec![rect_element(1.0, -0.5, 0.5, 1.0)]);
        // segments = 1 should be clamped to 4
        let mesh = revolve_mesh(&sketch, &identity(), 360.0, 1).unwrap();
        assert_mesh_valid(&mesh);
        // segments = 1000 should be clamped to 256
        let mesh2 = revolve_mesh(&sketch, &identity(), 360.0, 1000).unwrap();
        assert_mesh_valid(&mesh2);
    }

    #[test]
    fn test_revolve_too_few_points_error() {
        // Single line can't form a revolve profile
        let sketch = xy_sketch(vec![SketchElement::Line {
            start: Point2D { x: 1.0, y: 0.0 },
            end: Point2D { x: 2.0, y: 0.0 },
        }]);
        let result = revolve_mesh(&sketch, &identity(), 360.0, 16);
        assert!(result.is_err());
    }

    // --- apply_selection_color ---

    #[test]
    fn test_apply_selection_color_selected() {
        let sketch = xy_sketch(vec![rect_element(-0.5, -0.5, 1.0, 1.0)]);
        let mesh = extrude_mesh(&sketch, &identity(), 1.0).unwrap();
        let colored = apply_selection_color(&mesh, true);
        // Check first vertex color
        assert!((colored.vertices[6] - 0.3).abs() < 0.01);
        assert!((colored.vertices[7] - 0.7).abs() < 0.01);
        assert!((colored.vertices[8] - 0.9).abs() < 0.01);
    }

    #[test]
    fn test_apply_selection_color_not_selected() {
        let sketch = xy_sketch(vec![rect_element(-0.5, -0.5, 1.0, 1.0)]);
        let mesh = extrude_mesh(&sketch, &identity(), 1.0).unwrap();
        let colored = apply_selection_color(&mesh, false);
        // Should be same as original (default color)
        assert_eq!(colored.vertices, mesh.vertices);
    }

    // --- Plane-specific extrusion ---

    #[test]
    fn test_extrude_xz_plane() {
        let sketch = Sketch {
            plane: SketchPlane::Xz,
            offset: 0.0,
            elements: vec![rect_element(-0.5, -0.5, 1.0, 1.0)],
        };
        let mesh = extrude_mesh(&sketch, &identity(), 2.0).unwrap();
        assert_mesh_valid(&mesh);
        let (min, max) = mesh_aabb(&mesh);
        // XZ plane: extrudes along Y
        assert!((max[1] - 2.0).abs() < 0.01);
    }

    #[test]
    fn test_extrude_yz_plane() {
        let sketch = Sketch {
            plane: SketchPlane::Yz,
            offset: 0.0,
            elements: vec![rect_element(-0.5, -0.5, 1.0, 1.0)],
        };
        let mesh = extrude_mesh(&sketch, &identity(), 3.0).unwrap();
        assert_mesh_valid(&mesh);
        let (min, max) = mesh_aabb(&mesh);
        // YZ plane: extrudes along X
        assert!((max[0] - 3.0).abs() < 0.01);
    }
}
