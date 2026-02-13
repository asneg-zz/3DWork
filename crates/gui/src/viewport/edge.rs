//! Edge detection and picking for 3D meshes
//!
//! Extracts edges from triangle meshes and provides 2D screen-space picking
//! for edge selection (used for fillet/chamfer operations).

use std::collections::HashMap;
use glam::Vec3;
use vcad_gui_lib::viewport::mesh::MeshData;

/// Represents an edge in a mesh
#[derive(Debug, Clone)]
pub struct MeshEdge {
    pub start: Vec3,
    pub end: Vec3,
    pub normal1: Vec3,
    pub normal2: Option<Vec3>,
}

impl MeshEdge {
    /// Calculate the angle between adjacent faces (in radians)
    pub fn dihedral_angle(&self) -> f32 {
        if let Some(n2) = self.normal2 {
            let dot = self.normal1.dot(n2).clamp(-1.0, 1.0).abs();
            dot.acos()
        } else {
            0.0
        }
    }

    /// Check if this is a "sharp" edge (faces meet at angle)
    pub fn is_sharp(&self, threshold_degrees: f32) -> bool {
        let angle = self.dihedral_angle().to_degrees();
        angle > threshold_degrees && angle < (360.0 - threshold_degrees)
    }
}

/// Result of edge picking
#[derive(Debug, Clone)]
pub struct EdgeHit {
    pub edge_index: usize,
    pub distance: f32,
}

type QuantizedPos = (i64, i64, i64);

fn quantize_position(pos: Vec3) -> QuantizedPos {
    let scale = 10000.0;
    (
        (pos.x * scale).round() as i64,
        (pos.y * scale).round() as i64,
        (pos.z * scale).round() as i64,
    )
}

fn edge_key(p1: QuantizedPos, p2: QuantizedPos) -> (QuantizedPos, QuantizedPos) {
    if p1 < p2 { (p1, p2) } else { (p2, p1) }
}

/// Extract all edges from a mesh
pub fn extract_edges(mesh: &MeshData) -> Vec<MeshEdge> {
    let stride = 9;
    let indices = &mesh.indices;
    let verts = &mesh.vertices;
    let tri_count = indices.len() / 3;

    let mut edge_map: HashMap<(QuantizedPos, QuantizedPos), (Vec3, Vec3, Vec3, Option<Vec3>)> = HashMap::new();

    for tri_idx in 0..tri_count {
        let i0 = indices[tri_idx * 3] as usize;
        let i1 = indices[tri_idx * 3 + 1] as usize;
        let i2 = indices[tri_idx * 3 + 2] as usize;

        let v0 = Vec3::new(verts[i0 * stride], verts[i0 * stride + 1], verts[i0 * stride + 2]);
        let v1 = Vec3::new(verts[i1 * stride], verts[i1 * stride + 1], verts[i1 * stride + 2]);
        let v2 = Vec3::new(verts[i2 * stride], verts[i2 * stride + 1], verts[i2 * stride + 2]);

        let normal = Vec3::new(
            verts[i0 * stride + 3],
            verts[i0 * stride + 4],
            verts[i0 * stride + 5],
        ).normalize();

        let q0 = quantize_position(v0);
        let q1 = quantize_position(v1);
        let q2 = quantize_position(v2);

        for (qa, qb, va, vb) in [(q0, q1, v0, v1), (q1, q2, v1, v2), (q2, q0, v2, v0)] {
            let key = edge_key(qa, qb);
            edge_map.entry(key)
                .and_modify(|(_, _, _, n2)| {
                    if n2.is_none() {
                        *n2 = Some(normal);
                    }
                })
                .or_insert((va, vb, normal, None));
        }
    }

    edge_map.into_values()
        .map(|(start, end, n1, n2)| MeshEdge { start, end, normal1: n1, normal2: n2 })
        .collect()
}

/// Extract only sharp edges (edges where faces meet at an angle)
pub fn extract_sharp_edges(mesh: &MeshData, threshold_degrees: f32) -> Vec<MeshEdge> {
    extract_edges(mesh)
        .into_iter()
        .filter(|e| e.is_sharp(threshold_degrees))
        .collect()
}

/// Calculate distance from a 2D point to a 2D line segment
fn point_to_segment_2d(point: [f32; 2], p0: [f32; 2], p1: [f32; 2]) -> f32 {
    let dx = p1[0] - p0[0];
    let dy = p1[1] - p0[1];
    let len_sq = dx * dx + dy * dy;

    if len_sq < 1e-8 {
        let ddx = point[0] - p0[0];
        let ddy = point[1] - p0[1];
        return (ddx * ddx + ddy * ddy).sqrt();
    }

    let t = ((point[0] - p0[0]) * dx + (point[1] - p0[1]) * dy) / len_sq;
    let t = t.clamp(0.0, 1.0);

    let ddx = point[0] - (p0[0] + t * dx);
    let ddy = point[1] - (p0[1] + t * dy);
    (ddx * ddx + ddy * ddy).sqrt()
}

/// Project a 3D point to 2D screen coordinates
fn project_point(point: Vec3, ray_origin: Vec3, view_proj: &glam::Mat4, screen_size: [f32; 2]) -> Option<[f32; 2]> {
    if (point - ray_origin).length() < 0.01 {
        return None;
    }

    let p = *view_proj * glam::Vec4::new(point.x, point.y, point.z, 1.0);
    if p.w <= 0.0 {
        return None;
    }

    let ndc = p.truncate() / p.w;
    Some([
        (ndc.x + 1.0) * 0.5 * screen_size[0],
        (1.0 - ndc.y) * 0.5 * screen_size[1],
    ])
}

/// Pick edge using 2D screen-space distance
pub fn pick_edge_2d(
    cursor_screen: [f32; 2],
    edges: &[MeshEdge],
    ray_origin: Vec3,
    view_proj: &glam::Mat4,
    screen_size: [f32; 2],
    pixel_tolerance: f32,
) -> Option<EdgeHit> {
    let mut best: Option<(usize, f32, f32)> = None; // (index, screen_dist, depth)

    for (idx, edge) in edges.iter().enumerate() {
        let Some(p0) = project_point(edge.start, ray_origin, view_proj, screen_size) else { continue };
        let Some(p1) = project_point(edge.end, ray_origin, view_proj, screen_size) else { continue };

        let screen_dist = point_to_segment_2d(cursor_screen, p0, p1);
        if screen_dist > pixel_tolerance {
            continue;
        }

        let depth = ((edge.start + edge.end) * 0.5 - ray_origin).length();

        let dominated = best.map_or(false, |(_, bd, _)| {
            // Prefer closer to camera, then closer to cursor
            depth > bd + 0.01 || (depth > bd - 0.01 && screen_dist > bd)
        });

        if !dominated {
            best = Some((idx, screen_dist, depth));
        }
    }

    best.map(|(idx, dist, _)| EdgeHit { edge_index: idx, distance: dist })
}

/// Find edges adjacent to a given edge (share a vertex)
pub fn find_adjacent_edges(edges: &[MeshEdge], edge_index: usize) -> Vec<usize> {
    let edge = &edges[edge_index];
    let start_q = quantize_position(edge.start);
    let end_q = quantize_position(edge.end);

    edges.iter()
        .enumerate()
        .filter(|(idx, e)| {
            *idx != edge_index && {
                let es = quantize_position(e.start);
                let ee = quantize_position(e.end);
                es == start_q || es == end_q || ee == start_q || ee == end_q
            }
        })
        .map(|(idx, _)| idx)
        .collect()
}

/// Find chain of connected sharp edges
pub fn find_edge_chain(edges: &[MeshEdge], start_index: usize, threshold_degrees: f32) -> Vec<usize> {
    let mut chain = vec![start_index];
    let mut visited = vec![false; edges.len()];
    visited[start_index] = true;
    let mut stack = vec![start_index];

    while let Some(current) = stack.pop() {
        for adj_idx in find_adjacent_edges(edges, current) {
            if !visited[adj_idx] && edges[adj_idx].is_sharp(threshold_degrees) {
                visited[adj_idx] = true;
                chain.push(adj_idx);
                stack.push(adj_idx);
            }
        }
    }

    chain
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quantize_position() {
        let p1 = Vec3::new(1.0, 2.0, 3.0);
        let p2 = Vec3::new(1.0, 2.0, 3.0);
        assert_eq!(quantize_position(p1), quantize_position(p2));
    }

    #[test]
    fn test_dihedral_angle() {
        let edge = MeshEdge {
            start: Vec3::ZERO,
            end: Vec3::X,
            normal1: Vec3::Y,
            normal2: Some(Vec3::Z),
        };
        let angle = edge.dihedral_angle().to_degrees();
        assert!((angle - 90.0).abs() < 0.1);
    }
}
