//! Mesh validation utilities.
//!
//! `MeshValidator` provides methods to check mesh data integrity:
//! correct stride, in-range indices, normalized normals, AABB dimensions, etc.

use crate::viewport::mesh::MeshData;
use crate::viewport::picking::Aabb;

/// Validator for `MeshData` integrity checks.
pub struct MeshValidator<'a> {
    mesh: &'a MeshData,
}

impl<'a> MeshValidator<'a> {
    /// Create a new validator for the given mesh.
    pub fn new(mesh: &'a MeshData) -> Self {
        Self { mesh }
    }

    /// Number of vertices (vertices buffer length / 9).
    pub fn vertex_count(&self) -> usize {
        self.mesh.vertices.len() / 9
    }

    /// Number of triangles (indices buffer length / 3).
    pub fn triangle_count(&self) -> usize {
        self.mesh.indices.len() / 3
    }

    /// Check that the vertex buffer length is a multiple of 9 (the stride).
    pub fn is_stride_valid(&self) -> bool {
        self.mesh.vertices.len() % 9 == 0
    }

    /// Check that the index buffer length is a multiple of 3.
    pub fn is_index_stride_valid(&self) -> bool {
        self.mesh.indices.len() % 3 == 0
    }

    /// Check that all indices are within the valid vertex range.
    pub fn are_indices_in_range(&self) -> bool {
        let max_idx = self.vertex_count() as u32;
        self.mesh.indices.iter().all(|&i| i < max_idx)
    }

    /// Check that all vertex normals have unit length (within epsilon).
    pub fn are_normals_normalized(&self, epsilon: f32) -> bool {
        let count = self.vertex_count();
        for i in 0..count {
            let base = i * 9;
            let nx = self.mesh.vertices[base + 3];
            let ny = self.mesh.vertices[base + 4];
            let nz = self.mesh.vertices[base + 5];
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            if (len - 1.0).abs() > epsilon {
                return false;
            }
        }
        true
    }

    /// Compute the axis-aligned bounding box of the mesh.
    pub fn aabb(&self) -> Aabb {
        Aabb::from_mesh(self.mesh)
    }

    /// Compute the dimensions (width, height, depth) of the bounding box.
    pub fn dimensions(&self) -> [f32; 3] {
        let aabb = self.aabb();
        [
            aabb.max.x - aabb.min.x,
            aabb.max.y - aabb.min.y,
            aabb.max.z - aabb.min.z,
        ]
    }

    /// Check that the AABB dimensions are approximately equal to `expected`.
    pub fn assert_dimensions_approx(&self, expected: [f32; 3], tolerance: f32) -> bool {
        let dims = self.dimensions();
        (dims[0] - expected[0]).abs() < tolerance
            && (dims[1] - expected[1]).abs() < tolerance
            && (dims[2] - expected[2]).abs() < tolerance
    }

    /// Check if the mesh uses selection color (0.3, 0.7, 0.9).
    pub fn has_selection_color(&self) -> bool {
        if self.vertex_count() == 0 {
            return false;
        }
        let r = self.mesh.vertices[6];
        let g = self.mesh.vertices[7];
        let b = self.mesh.vertices[8];
        (r - 0.3).abs() < 0.05 && (g - 0.7).abs() < 0.05 && (b - 0.9).abs() < 0.05
    }

    /// Run all validation checks and return a list of error messages.
    /// An empty list means the mesh is valid.
    pub fn validate_all(&self) -> Vec<String> {
        let mut errors = Vec::new();

        if !self.is_stride_valid() {
            errors.push(format!(
                "Vertex buffer length {} is not a multiple of 9",
                self.mesh.vertices.len()
            ));
        }

        if !self.is_index_stride_valid() {
            errors.push(format!(
                "Index buffer length {} is not a multiple of 3",
                self.mesh.indices.len()
            ));
        }

        if !self.are_indices_in_range() {
            let max_idx = self.vertex_count() as u32;
            let out_of_range: Vec<_> = self
                .mesh
                .indices
                .iter()
                .filter(|&&i| i >= max_idx)
                .take(5)
                .collect();
            errors.push(format!(
                "Indices out of range (vertex_count={}): {:?}",
                max_idx, out_of_range
            ));
        }

        if self.vertex_count() > 0 && !self.are_normals_normalized(0.1) {
            errors.push("Some normals are not unit-length (epsilon=0.1)".to_string());
        }

        errors
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn simple_triangle() -> MeshData {
        MeshData {
            vertices: vec![
                // vertex 0: pos(0,0,0) normal(0,0,1) color(0.5,0.5,0.5)
                0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.5, 0.5, 0.5,
                // vertex 1: pos(1,0,0) normal(0,0,1) color(0.5,0.5,0.5)
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.5, 0.5, 0.5,
                // vertex 2: pos(0,1,0) normal(0,0,1) color(0.5,0.5,0.5)
                0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.5, 0.5, 0.5,
            ],
            indices: vec![0, 1, 2],
        }
    }

    fn selected_triangle() -> MeshData {
        MeshData {
            vertices: vec![
                0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.3, 0.7, 0.9,
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.3, 0.7, 0.9,
                0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.3, 0.7, 0.9,
            ],
            indices: vec![0, 1, 2],
        }
    }

    #[test]
    fn test_vertex_count() {
        let mesh = simple_triangle();
        let v = MeshValidator::new(&mesh);
        assert_eq!(v.vertex_count(), 3);
    }

    #[test]
    fn test_triangle_count() {
        let mesh = simple_triangle();
        let v = MeshValidator::new(&mesh);
        assert_eq!(v.triangle_count(), 1);
    }

    #[test]
    fn test_stride_valid() {
        let mesh = simple_triangle();
        let v = MeshValidator::new(&mesh);
        assert!(v.is_stride_valid());
    }

    #[test]
    fn test_stride_invalid() {
        let bad = MeshData {
            vertices: vec![0.0; 10], // not multiple of 9
            indices: vec![],
        };
        let v = MeshValidator::new(&bad);
        assert!(!v.is_stride_valid());
    }

    #[test]
    fn test_indices_in_range() {
        let mesh = simple_triangle();
        let v = MeshValidator::new(&mesh);
        assert!(v.are_indices_in_range());
    }

    #[test]
    fn test_indices_out_of_range() {
        let bad = MeshData {
            vertices: vec![0.0; 9], // 1 vertex
            indices: vec![0, 1, 2], // indices 1,2 are out of range
        };
        let v = MeshValidator::new(&bad);
        assert!(!v.are_indices_in_range());
    }

    #[test]
    fn test_normals_normalized() {
        let mesh = simple_triangle();
        let v = MeshValidator::new(&mesh);
        assert!(v.are_normals_normalized(0.01));
    }

    #[test]
    fn test_normals_not_normalized() {
        let bad = MeshData {
            vertices: vec![
                0.0, 0.0, 0.0, 0.0, 0.0, 5.0, 0.5, 0.5, 0.5, // normal length = 5
            ],
            indices: vec![0],
        };
        let v = MeshValidator::new(&bad);
        assert!(!v.are_normals_normalized(0.01));
    }

    #[test]
    fn test_dimensions() {
        let mesh = simple_triangle();
        let v = MeshValidator::new(&mesh);
        let dims = v.dimensions();
        assert!((dims[0] - 1.0).abs() < 0.001);
        assert!((dims[1] - 1.0).abs() < 0.001);
        assert!((dims[2] - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_assert_dimensions_approx() {
        let mesh = simple_triangle();
        let v = MeshValidator::new(&mesh);
        assert!(v.assert_dimensions_approx([1.0, 1.0, 0.0], 0.01));
        assert!(!v.assert_dimensions_approx([2.0, 1.0, 0.0], 0.01));
    }

    #[test]
    fn test_has_selection_color_false() {
        let mesh = simple_triangle();
        let v = MeshValidator::new(&mesh);
        assert!(!v.has_selection_color());
    }

    #[test]
    fn test_has_selection_color_true() {
        let mesh = selected_triangle();
        let v = MeshValidator::new(&mesh);
        assert!(v.has_selection_color());
    }

    #[test]
    fn test_validate_all_ok() {
        let mesh = simple_triangle();
        let v = MeshValidator::new(&mesh);
        let errors = v.validate_all();
        assert!(errors.is_empty(), "Expected no errors, got: {:?}", errors);
    }

    #[test]
    fn test_validate_all_catches_bad_stride() {
        let bad = MeshData {
            vertices: vec![0.0; 10],
            indices: vec![0, 1, 2],
        };
        let v = MeshValidator::new(&bad);
        let errors = v.validate_all();
        assert!(errors.iter().any(|e| e.contains("multiple of 9")));
    }

    #[test]
    fn test_validate_all_catches_bad_indices() {
        let bad = MeshData {
            vertices: vec![0.0; 9],
            indices: vec![0, 5, 2],
        };
        let v = MeshValidator::new(&bad);
        let errors = v.validate_all();
        assert!(errors.iter().any(|e| e.contains("out of range")));
    }
}
