//! Mesh extraction and coloring utilities

use vcad::Part;

use crate::viewport::mesh::MeshData;

const FACE_HIGHLIGHT_COLOR: [f32; 3] = [1.0, 0.6, 0.0];

/// Extract MeshData from a vcad Part
pub fn extract_mesh_data(part: &Part, selected: bool) -> Option<MeshData> {
    let mesh = part.to_mesh();
    let positions = mesh.vertices();
    let indices = mesh.indices();

    tracing::info!(
        "extract_mesh_data: {} vertices, {} indices ({} tris)",
        positions.len() / 3,
        indices.len(),
        indices.len() / 3
    );

    if positions.is_empty() || indices.is_empty() {
        tracing::warn!("extract_mesh_data: empty mesh!");
        return None;
    }

    let color = if selected {
        [0.3_f32, 0.7, 0.9]
    } else {
        [0.6, 0.6, 0.65]
    };

    let tri_count = indices.len() / 3;
    let mut vertices = Vec::with_capacity(tri_count * 3 * 9);
    let mut new_indices = Vec::with_capacity(tri_count * 3);

    for tri in 0..tri_count {
        let i0 = indices[tri * 3] as usize;
        let i1 = indices[tri * 3 + 1] as usize;
        let i2 = indices[tri * 3 + 2] as usize;

        let p0 = glam::Vec3::new(
            positions[i0 * 3],
            positions[i0 * 3 + 1],
            positions[i0 * 3 + 2],
        );
        let p1 = glam::Vec3::new(
            positions[i1 * 3],
            positions[i1 * 3 + 1],
            positions[i1 * 3 + 2],
        );
        let p2 = glam::Vec3::new(
            positions[i2 * 3],
            positions[i2 * 3 + 1],
            positions[i2 * 3 + 2],
        );

        let edge1 = p1 - p0;
        let edge2 = p2 - p0;
        let normal = edge1.cross(edge2).normalize_or_zero();

        let base = (tri * 3) as u32;
        for p in [p0, p1, p2] {
            vertices.extend_from_slice(&[
                p.x, p.y, p.z, normal.x, normal.y, normal.z, color[0], color[1], color[2],
            ]);
        }
        new_indices.extend_from_slice(&[base, base + 1, base + 2]);
    }

    Some(MeshData {
        vertices,
        indices: new_indices,
    })
}

/// Apply selection highlight color to mesh
pub fn apply_selection_color(mesh: &mut MeshData) {
    let stride = 9;
    let selection_color = [0.3_f32, 0.7, 0.9];

    for i in 0..(mesh.vertices.len() / stride) {
        let color_offset = i * stride + 6;
        if color_offset + 2 < mesh.vertices.len() {
            mesh.vertices[color_offset] = selection_color[0];
            mesh.vertices[color_offset + 1] = selection_color[1];
            mesh.vertices[color_offset + 2] = selection_color[2];
        }
    }
}

/// Apply face highlight color to specific triangles
pub fn apply_face_highlight(mesh: &mut MeshData, triangle_indices: &[usize]) {
    let stride = 9;

    for &tri_idx in triangle_indices {
        let base_idx = tri_idx * 3;
        if base_idx + 2 >= mesh.indices.len() {
            continue;
        }

        for v in 0..3 {
            let vertex_idx = mesh.indices[base_idx + v] as usize;
            let color_offset = vertex_idx * stride + 6;

            if color_offset + 2 < mesh.vertices.len() {
                mesh.vertices[color_offset] = FACE_HIGHLIGHT_COLOR[0];
                mesh.vertices[color_offset + 1] = FACE_HIGHLIGHT_COLOR[1];
                mesh.vertices[color_offset + 2] = FACE_HIGHLIGHT_COLOR[2];
            }
        }
    }
}
