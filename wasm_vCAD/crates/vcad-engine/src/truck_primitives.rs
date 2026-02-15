use truck_polymesh::*;
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

/// Mesh data that can be serialized to JavaScript
#[derive(Serialize, Deserialize)]
pub struct MeshData {
    pub vertices: Vec<f32>,  // [x, y, z, x, y, z, ...]
    pub indices: Vec<u32>,   // Triangle indices
    pub normals: Vec<f32>,   // [nx, ny, nz, nx, ny, nz, ...]
}

/// Create a cube mesh (simple parametric generation)
pub fn create_cube_mesh(width: f64, height: f64, depth: f64) -> Result<MeshData, JsValue> {
    let w = (width / 2.0) as f32;
    let h = (height / 2.0) as f32;
    let d = (depth / 2.0) as f32;

    let vertices = vec![
        // Front face
        -w, -h,  d,  // 0
         w, -h,  d,  // 1
         w,  h,  d,  // 2
        -w,  h,  d,  // 3
        // Back face
        -w, -h, -d,  // 4
         w, -h, -d,  // 5
         w,  h, -d,  // 6
        -w,  h, -d,  // 7
    ];

    let indices = vec![
        // Front
        0, 1, 2,  0, 2, 3,
        // Right
        1, 5, 6,  1, 6, 2,
        // Back
        5, 4, 7,  5, 7, 6,
        // Left
        4, 0, 3,  4, 3, 7,
        // Top
        3, 2, 6,  3, 6, 7,
        // Bottom
        4, 5, 1,  4, 1, 0,
    ];

    let normals = vec![
        // Front face normals
         0.0,  0.0,  1.0,
         0.0,  0.0,  1.0,
         0.0,  0.0,  1.0,
         0.0,  0.0,  1.0,
        // Back face normals
         0.0,  0.0, -1.0,
         0.0,  0.0, -1.0,
         0.0,  0.0, -1.0,
         0.0,  0.0, -1.0,
    ];

    Ok(MeshData {
        vertices,
        indices,
        normals,
    })
}

/// Create a cylinder mesh using parametric generation
pub fn create_cylinder_mesh(radius: f64, height: f64) -> Result<MeshData, JsValue> {
    let r = radius as f32;
    let h = (height / 2.0) as f32;
    let segments = 32;

    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut normals = Vec::new();

    // Bottom center
    vertices.extend_from_slice(&[0.0, -h, 0.0]);
    normals.extend_from_slice(&[0.0, -1.0, 0.0]);

    // Top center
    vertices.extend_from_slice(&[0.0, h, 0.0]);
    normals.extend_from_slice(&[0.0, 1.0, 0.0]);

    // Generate vertices for bottom and top circles
    for i in 0..=segments {
        let angle = 2.0 * std::f32::consts::PI * (i as f32) / (segments as f32);
        let x = r * angle.cos();
        let z = r * angle.sin();

        // Bottom vertex
        vertices.extend_from_slice(&[x, -h, z]);
        normals.extend_from_slice(&[x / r, 0.0, z / r]);

        // Top vertex
        vertices.extend_from_slice(&[x, h, z]);
        normals.extend_from_slice(&[x / r, 0.0, z / r]);
    }

    // Bottom cap indices
    for i in 0..segments {
        let base = 2 + i * 2;
        indices.extend_from_slice(&[0, base + 2, base]);
    }

    // Top cap indices
    for i in 0..segments {
        let base = 2 + i * 2;
        indices.extend_from_slice(&[1, base + 1, base + 3]);
    }

    // Side indices
    for i in 0..segments {
        let base = 2 + i * 2;
        let next_base = base + 2;

        // Two triangles per segment
        indices.extend_from_slice(&[base, next_base, base + 1]);
        indices.extend_from_slice(&[base + 1, next_base, next_base + 1]);
    }

    Ok(MeshData {
        vertices,
        indices,
        normals,
    })
}

/// Create a sphere mesh using UV parametric generation
pub fn create_sphere_mesh(radius: f64) -> Result<MeshData, JsValue> {
    let r = radius as f32;
    let segments = 32;
    let rings = 16;

    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut normals = Vec::new();

    // Generate vertices
    for ring in 0..=rings {
        let phi = std::f32::consts::PI * (ring as f32) / (rings as f32);
        let y = r * phi.cos();
        let ring_radius = r * phi.sin();

        for seg in 0..=segments {
            let theta = 2.0 * std::f32::consts::PI * (seg as f32) / (segments as f32);
            let x = ring_radius * theta.cos();
            let z = ring_radius * theta.sin();

            vertices.extend_from_slice(&[x, y, z]);

            // Normal is just normalized position for sphere
            let len = (x * x + y * y + z * z).sqrt();
            normals.extend_from_slice(&[x / len, y / len, z / len]);
        }
    }

    // Generate indices
    for ring in 0..rings {
        for seg in 0..segments {
            let current = ring * (segments + 1) + seg;
            let next = current + segments + 1;

            indices.extend_from_slice(&[
                current as u32,
                next as u32,
                (current + 1) as u32,
            ]);

            indices.extend_from_slice(&[
                (current + 1) as u32,
                next as u32,
                (next + 1) as u32,
            ]);
        }
    }

    Ok(MeshData {
        vertices,
        indices,
        normals,
    })
}

/// Create a cone mesh
pub fn create_cone_mesh(radius: f64, height: f64) -> Result<MeshData, JsValue> {
    let r = radius as f32;
    let h = (height / 2.0) as f32;
    let segments = 32;

    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut normals = Vec::new();

    // Bottom center
    vertices.extend_from_slice(&[0.0, -h, 0.0]);
    normals.extend_from_slice(&[0.0, -1.0, 0.0]);

    // Top apex
    vertices.extend_from_slice(&[0.0, h, 0.0]);
    normals.extend_from_slice(&[0.0, 1.0, 0.0]);

    // Bottom circle vertices
    for i in 0..=segments {
        let angle = 2.0 * std::f32::consts::PI * (i as f32) / (segments as f32);
        let x = r * angle.cos();
        let z = r * angle.sin();

        vertices.extend_from_slice(&[x, -h, z]);

        // Cone side normal (approximated)
        let len = (x * x + (height as f32) * (height as f32) + z * z).sqrt();
        normals.extend_from_slice(&[x / len, (height as f32) / len, z / len]);
    }

    // Bottom cap
    for i in 0..segments {
        indices.extend_from_slice(&[0, (i + 2) as u32, (i + 3) as u32]);
    }

    // Cone sides
    for i in 0..segments {
        indices.extend_from_slice(&[1, (i + 3) as u32, (i + 2) as u32]);
    }

    Ok(MeshData {
        vertices,
        indices,
        normals,
    })
}
