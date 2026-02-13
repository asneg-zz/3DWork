//! 3D Fillet/Chamfer geometry builder
//!
//! - Chamfer: flat 45° bevel (triangular prism)
//! - Fillet: rounded edge (arc profile)

use glam::Vec3;
use manifold_rs::Mesh;
use std::f32::consts::FRAC_PI_2;
use vcad::Part;

/// Edge data for fillet/chamfer creation
pub struct FilletEdge {
    pub start: [f64; 3],
    pub end: [f64; 3],
    pub normal1: [f64; 3],
    pub normal2: Option<[f64; 3]>,
}

impl FilletEdge {
    pub fn length(&self) -> f64 {
        let dx = self.end[0] - self.start[0];
        let dy = self.end[1] - self.start[1];
        let dz = self.end[2] - self.start[2];
        (dx * dx + dy * dy + dz * dz).sqrt()
    }

    pub fn direction(&self) -> Vec3 {
        let d = Vec3::new(
            (self.end[0] - self.start[0]) as f32,
            (self.end[1] - self.start[1]) as f32,
            (self.end[2] - self.start[2]) as f32,
        );
        d.normalize()
    }

    pub fn start_vec3(&self) -> Vec3 {
        Vec3::new(self.start[0] as f32, self.start[1] as f32, self.start[2] as f32)
    }

    pub fn end_vec3(&self) -> Vec3 {
        Vec3::new(self.end[0] as f32, self.end[1] as f32, self.end[2] as f32)
    }

    pub fn normals(&self) -> Option<(Vec3, Vec3)> {
        let n1 = Vec3::new(self.normal1[0] as f32, self.normal1[1] as f32, self.normal1[2] as f32);
        let n2 = self.normal2.map(|n| Vec3::new(n[0] as f32, n[1] as f32, n[2] as f32))?;
        Some((n1.normalize(), n2.normalize()))
    }
}

/// Create chamfer tool (triangular prism) for a single edge
fn create_chamfer_tool(edge: &FilletEdge, size: f64) -> Option<Part> {
    let (n1, n2) = edge.normals()?;

    if edge.length() < 0.001 {
        return None;
    }

    let r = size as f32;
    let start = edge.start_vec3();
    let end = edge.end_vec3();
    let edge_dir = edge.direction();

    // Check angle between faces
    if n1.dot(n2) > 0.99 {
        return None;
    }

    // Small extension for clean boolean
    let eps = 0.01f32;
    let start_ext = start - edge_dir * eps;
    let end_ext = end + edge_dir * eps;
    let corner_ext = (n1 + n2).normalize() * eps;

    // 6 vertices of triangular prism
    let v0 = start_ext + corner_ext;
    let v1 = start_ext - n1 * r;
    let v2 = start_ext - n2 * r;
    let v3 = end_ext + corner_ext;
    let v4 = end_ext - n1 * r;
    let v5 = end_ext - n2 * r;

    let vertices: Vec<f32> = vec![
        v0.x, v0.y, v0.z,
        v1.x, v1.y, v1.z,
        v2.x, v2.y, v2.z,
        v3.x, v3.y, v3.z,
        v4.x, v4.y, v4.z,
        v5.x, v5.y, v5.z,
    ];

    let indices: Vec<u32> = vec![
        0, 2, 1,        // Start cap
        3, 4, 5,        // End cap
        0, 1, 4, 0, 4, 3,  // Side 1
        0, 3, 5, 0, 5, 2,  // Side 2
        1, 2, 5, 1, 5, 4,  // Chamfer surface
    ];

    let mesh = Mesh::new(&vertices, &indices);
    let manifold = mesh.to_manifold();

    if manifold.is_empty() {
        return None;
    }

    Some(Part::new("chamfer_tool", manifold))
}

/// Create rounded fillet tool (arc profile) for a single edge
fn create_fillet_tool(edge: &FilletEdge, radius: f64, segments: u32) -> Option<Part> {
    let (n1, n2) = edge.normals()?;

    if edge.length() < 0.001 {
        return None;
    }

    let r = radius as f32;
    let start = edge.start_vec3();
    let end = edge.end_vec3();
    let edge_dir = edge.direction();
    let seg = segments.max(3) as usize;

    // Check angle between faces
    if n1.dot(n2) > 0.99 {
        return None;
    }

    // Small extension for clean boolean
    let eps = 0.01f32;
    let start_ext = start - edge_dir * eps;
    let end_ext = end + edge_dir * eps;
    let corner_ext = (n1 + n2).normalize() * eps;

    // Build profile vertices
    let mut start_profile: Vec<Vec3> = Vec::with_capacity(seg + 2);
    let mut end_profile: Vec<Vec3> = Vec::with_capacity(seg + 2);

    // Corner vertex
    start_profile.push(start_ext + corner_ext);
    end_profile.push(end_ext + corner_ext);

    // Arc center (corner of removed material)
    let center_start = start_ext - n1 * r - n2 * r;
    let center_end = end_ext - n1 * r - n2 * r;

    // Arc points (concave - curving inward)
    for i in 0..=seg {
        let t = i as f32 / seg as f32;
        let angle = t * FRAC_PI_2;
        let cos_a = angle.cos();
        let sin_a = angle.sin();

        start_profile.push(center_start + n2 * (r * cos_a) + n1 * (r * sin_a));
        end_profile.push(center_end + n2 * (r * cos_a) + n1 * (r * sin_a));
    }

    let profile_size = seg + 2;
    let mut vertices: Vec<f32> = Vec::with_capacity(profile_size * 2 * 3);

    for v in &start_profile {
        vertices.extend_from_slice(&[v.x, v.y, v.z]);
    }
    for v in &end_profile {
        vertices.extend_from_slice(&[v.x, v.y, v.z]);
    }

    let mut indices: Vec<u32> = Vec::new();
    let ps = profile_size as u32;

    // Start cap (fan)
    for i in 0..seg {
        indices.extend_from_slice(&[0, (i + 2) as u32, (i + 1) as u32]);
    }

    // End cap (fan)
    for i in 0..seg {
        indices.extend_from_slice(&[ps, ps + (i + 1) as u32, ps + (i + 2) as u32]);
    }

    // Side faces
    indices.extend_from_slice(&[0, 1, ps + 1, 0, ps + 1, ps]);

    let last_arc = (seg + 1) as u32;
    indices.extend_from_slice(&[last_arc, 0, ps, last_arc, ps, ps + last_arc]);

    // Arc surface
    for i in 0..seg {
        let s0 = (i + 1) as u32;
        let s1 = (i + 2) as u32;
        let e0 = ps + (i + 1) as u32;
        let e1 = ps + (i + 2) as u32;
        indices.extend_from_slice(&[s0, s1, e1, s0, e1, e0]);
    }

    let mesh = Mesh::new(&vertices, &indices);
    let manifold = mesh.to_manifold();

    if manifold.is_empty() {
        return None;
    }

    Some(Part::new("fillet_tool", manifold))
}

/// Apply chamfer to multiple edges
pub fn apply_chamfer(base: &Part, edges: &[FilletEdge], size: f64, _segments: u32) -> Option<Part> {
    let mut tool: Option<Part> = None;

    for edge in edges {
        if let Some(t) = create_chamfer_tool(edge, size) {
            tool = Some(match tool {
                Some(existing) => existing.union(&t),
                None => t,
            });
        }
    }

    let tool = tool?;
    Some(base.difference(&tool))
}

/// Apply rounded fillet to multiple edges
pub fn apply_rounded_fillet(base: &Part, edges: &[FilletEdge], radius: f64, segments: u32) -> Option<Part> {
    let mut tool: Option<Part> = None;

    for edge in edges {
        if let Some(t) = create_fillet_tool(edge, radius, segments) {
            tool = Some(match tool {
                Some(existing) => existing.union(&t),
                None => t,
            });
        }
    }

    let tool = tool?;
    Some(base.difference(&tool))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_edge_length() {
        let edge = FilletEdge {
            start: [0.0, 0.0, 0.0],
            end: [1.0, 0.0, 0.0],
            normal1: [0.0, 1.0, 0.0],
            normal2: Some([0.0, 0.0, 1.0]),
        };
        assert!((edge.length() - 1.0).abs() < 0.001);
    }
}
