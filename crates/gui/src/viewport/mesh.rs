#![allow(dead_code)]

use glam::Vec3;

/// CPU-side mesh data: interleaved [pos.x, pos.y, pos.z, norm.x, norm.y, norm.z, r, g, b]
#[derive(Clone)]
pub struct MeshData {
    /// 9 floats per vertex: position(3) + normal(3) + color(3)
    pub vertices: Vec<f32>,
    pub indices: Vec<u32>,
}

impl MeshData {
    pub fn vertex_count(&self) -> usize {
        self.vertices.len() / 9
    }
}

/// Lines mesh: interleaved [pos.x, pos.y, pos.z, r, g, b, a]
pub struct LineMeshData {
    /// 7 floats per vertex: position(3) + color(4)
    pub vertices: Vec<f32>,
}

// ── Primitive generation (kept for software wireframe fallback) ──

pub fn cube(w: f32, h: f32, d: f32, color: [f32; 3]) -> MeshData {
    let hw = w * 0.5;
    let hh = h * 0.5;
    let hd = d * 0.5;

    let faces: [([Vec3; 4], Vec3); 6] = [
        // Front (+Z)
        ([Vec3::new(-hw, -hh, hd), Vec3::new(hw, -hh, hd), Vec3::new(hw, hh, hd), Vec3::new(-hw, hh, hd)], Vec3::Z),
        // Back (-Z)
        ([Vec3::new(hw, -hh, -hd), Vec3::new(-hw, -hh, -hd), Vec3::new(-hw, hh, -hd), Vec3::new(hw, hh, -hd)], Vec3::NEG_Z),
        // Right (+X)
        ([Vec3::new(hw, -hh, hd), Vec3::new(hw, -hh, -hd), Vec3::new(hw, hh, -hd), Vec3::new(hw, hh, hd)], Vec3::X),
        // Left (-X)
        ([Vec3::new(-hw, -hh, -hd), Vec3::new(-hw, -hh, hd), Vec3::new(-hw, hh, hd), Vec3::new(-hw, hh, -hd)], Vec3::NEG_X),
        // Top (+Y)
        ([Vec3::new(-hw, hh, hd), Vec3::new(hw, hh, hd), Vec3::new(hw, hh, -hd), Vec3::new(-hw, hh, -hd)], Vec3::Y),
        // Bottom (-Y)
        ([Vec3::new(-hw, -hh, -hd), Vec3::new(hw, -hh, -hd), Vec3::new(hw, -hh, hd), Vec3::new(-hw, -hh, hd)], Vec3::NEG_Y),
    ];

    let mut vertices = Vec::with_capacity(24 * 9);
    let mut indices = Vec::with_capacity(36);

    for (quad, normal) in &faces {
        let base = (vertices.len() / 9) as u32;
        for v in quad {
            vertices.extend_from_slice(&[v.x, v.y, v.z, normal.x, normal.y, normal.z, color[0], color[1], color[2]]);
        }
        indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    MeshData { vertices, indices }
}

pub fn cylinder(radius: f32, height: f32, segments: u32, color: [f32; 3]) -> MeshData {
    let hh = height * 0.5;
    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    // Side faces
    for i in 0..segments {
        let a0 = (i as f32) * std::f32::consts::TAU / segments as f32;
        let a1 = ((i + 1) as f32) * std::f32::consts::TAU / segments as f32;

        let c0 = a0.cos();
        let s0 = a0.sin();
        let c1 = a1.cos();
        let s1 = a1.sin();

        let n0 = Vec3::new(c0, 0.0, s0).normalize();
        let n1 = Vec3::new(c1, 0.0, s1).normalize();

        let base = (vertices.len() / 9) as u32;

        // 4 vertices for this quad
        push_vert(&mut vertices, radius * c0, -hh, radius * s0, n0, color);
        push_vert(&mut vertices, radius * c1, -hh, radius * s1, n1, color);
        push_vert(&mut vertices, radius * c1, hh, radius * s1, n1, color);
        push_vert(&mut vertices, radius * c0, hh, radius * s0, n0, color);

        indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    // Top cap
    add_cap(&mut vertices, &mut indices, radius, hh, segments, Vec3::Y, color);
    // Bottom cap
    add_cap_reversed(&mut vertices, &mut indices, radius, -hh, segments, Vec3::NEG_Y, color);

    MeshData { vertices, indices }
}

pub fn sphere(radius: f32, rings: u32, sectors: u32, color: [f32; 3]) -> MeshData {
    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    for r in 0..=rings {
        let phi = std::f32::consts::PI * r as f32 / rings as f32;
        let sp = phi.sin();
        let cp = phi.cos();

        for s in 0..=sectors {
            let theta = std::f32::consts::TAU * s as f32 / sectors as f32;
            let st = theta.sin();
            let ct = theta.cos();

            let x = sp * ct;
            let y = cp;
            let z = sp * st;

            let n = Vec3::new(x, y, z);
            push_vert(&mut vertices, radius * x, radius * y, radius * z, n, color);
        }
    }

    for r in 0..rings {
        for s in 0..sectors {
            let i0 = r * (sectors + 1) + s;
            let i1 = i0 + 1;
            let i2 = i0 + sectors + 1;
            let i3 = i2 + 1;
            indices.extend_from_slice(&[i0, i2, i1, i1, i2, i3]);
        }
    }

    MeshData { vertices, indices }
}

pub fn cone(radius: f32, height: f32, segments: u32, color: [f32; 3]) -> MeshData {
    let hh = height * 0.5;
    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    // Side faces
    let slope = radius / height;
    for i in 0..segments {
        let a0 = (i as f32) * std::f32::consts::TAU / segments as f32;
        let a1 = ((i + 1) as f32) * std::f32::consts::TAU / segments as f32;

        let c0 = a0.cos();
        let s0 = a0.sin();
        let c1 = a1.cos();
        let s1 = a1.sin();

        // Normal for cone side
        let n0 = Vec3::new(c0, slope, s0).normalize();
        let n1 = Vec3::new(c1, slope, s1).normalize();
        let n_top = (n0 + n1).normalize();

        let base = (vertices.len() / 9) as u32;

        push_vert(&mut vertices, 0.0, hh, 0.0, n_top, color); // apex
        push_vert(&mut vertices, radius * c0, -hh, radius * s0, n0, color);
        push_vert(&mut vertices, radius * c1, -hh, radius * s1, n1, color);

        indices.extend_from_slice(&[base, base + 1, base + 2]);
    }

    // Bottom cap
    add_cap_reversed(&mut vertices, &mut indices, radius, -hh, segments, Vec3::NEG_Y, color);

    MeshData { vertices, indices }
}

// ── Grid and axes ────────────────────────────────────────────

pub fn grid(range: i32, cell_size: f32, opacity: f32) -> LineMeshData {
    let mut vertices = Vec::new();
    let grid_color = [0.25_f32, 0.25, 0.25, opacity];
    let origin_color_x = [0.5_f32, 0.2, 0.2, opacity * 0.7];
    let origin_color_z = [0.2_f32, 0.2, 0.5, opacity * 0.7];

    let extent = range as f32 * cell_size;

    for i in -range..=range {
        let f = i as f32 * cell_size;
        let color = if i == 0 {
            origin_color_z
        } else {
            grid_color
        };
        // Line along Z
        push_line_vert(&mut vertices, f, 0.0, -extent, color);
        push_line_vert(&mut vertices, f, 0.0, extent, color);

        let color = if i == 0 {
            origin_color_x
        } else {
            grid_color
        };
        // Line along X
        push_line_vert(&mut vertices, -extent, 0.0, f, color);
        push_line_vert(&mut vertices, extent, 0.0, f, color);
    }

    LineMeshData { vertices }
}

pub fn axes(length: f32) -> LineMeshData {
    let mut vertices = Vec::new();
    let r = [0.9_f32, 0.2, 0.2, 1.0];
    let g = [0.2_f32, 0.8, 0.2, 1.0];
    let b = [0.2_f32, 0.3, 0.9, 1.0];

    // X axis
    push_line_vert(&mut vertices, 0.0, 0.0, 0.0, r);
    push_line_vert(&mut vertices, length, 0.0, 0.0, r);
    // Y axis
    push_line_vert(&mut vertices, 0.0, 0.0, 0.0, g);
    push_line_vert(&mut vertices, 0.0, length, 0.0, g);
    // Z axis
    push_line_vert(&mut vertices, 0.0, 0.0, 0.0, b);
    push_line_vert(&mut vertices, 0.0, 0.0, length, b);

    LineMeshData { vertices }
}

// ── Helpers ──────────────────────────────────────────────────

fn push_vert(v: &mut Vec<f32>, px: f32, py: f32, pz: f32, n: Vec3, c: [f32; 3]) {
    v.extend_from_slice(&[px, py, pz, n.x, n.y, n.z, c[0], c[1], c[2]]);
}

fn push_line_vert(v: &mut Vec<f32>, px: f32, py: f32, pz: f32, c: [f32; 4]) {
    v.extend_from_slice(&[px, py, pz, c[0], c[1], c[2], c[3]]);
}

fn add_cap(
    vertices: &mut Vec<f32>,
    indices: &mut Vec<u32>,
    radius: f32,
    y: f32,
    segments: u32,
    normal: Vec3,
    color: [f32; 3],
) {
    let center_idx = (vertices.len() / 9) as u32;
    push_vert(vertices, 0.0, y, 0.0, normal, color);

    for i in 0..segments {
        let angle = (i as f32) * std::f32::consts::TAU / segments as f32;
        push_vert(vertices, radius * angle.cos(), y, radius * angle.sin(), normal, color);
    }

    for i in 0..segments {
        let next = (i + 1) % segments;
        indices.extend_from_slice(&[center_idx, center_idx + 1 + i, center_idx + 1 + next]);
    }
}

fn add_cap_reversed(
    vertices: &mut Vec<f32>,
    indices: &mut Vec<u32>,
    radius: f32,
    y: f32,
    segments: u32,
    normal: Vec3,
    color: [f32; 3],
) {
    let center_idx = (vertices.len() / 9) as u32;
    push_vert(vertices, 0.0, y, 0.0, normal, color);

    for i in 0..segments {
        let angle = (i as f32) * std::f32::consts::TAU / segments as f32;
        push_vert(vertices, radius * angle.cos(), y, radius * angle.sin(), normal, color);
    }

    for i in 0..segments {
        let next = (i + 1) % segments;
        indices.extend_from_slice(&[center_idx, center_idx + 1 + next, center_idx + 1 + i]);
    }
}
