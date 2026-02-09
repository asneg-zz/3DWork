use std::collections::HashMap;

use glam::Vec3;

use super::mesh::MeshData;

/// A ray in world space
pub struct Ray {
    pub origin: Vec3,
    pub direction: Vec3,
}

/// Axis-aligned bounding box
#[derive(Clone, Copy)]
pub struct Aabb {
    pub min: Vec3,
    pub max: Vec3,
}

impl Aabb {
    /// Compute AABB from MeshData (9 floats per vertex: pos+normal+color)
    pub fn from_mesh(data: &MeshData) -> Self {
        let mut min = Vec3::splat(f32::MAX);
        let mut max = Vec3::splat(f32::MIN);

        let verts = &data.vertices;
        let stride = 9;
        let count = verts.len() / stride;

        for i in 0..count {
            let base = i * stride;
            let x = verts[base];
            let y = verts[base + 1];
            let z = verts[base + 2];
            min.x = min.x.min(x);
            min.y = min.y.min(y);
            min.z = min.z.min(z);
            max.x = max.x.max(x);
            max.y = max.y.max(y);
            max.z = max.z.max(z);
        }

        Self { min, max }
    }

    /// Center of the bounding box
    pub fn center(&self) -> Vec3 {
        (self.min + self.max) * 0.5
    }
}

/// Ray-AABB intersection using the slab method.
/// Returns the distance along the ray to the nearest hit, or None.
pub fn ray_aabb(ray: &Ray, aabb: &Aabb) -> Option<f32> {
    let inv_dir = Vec3::new(
        1.0 / ray.direction.x,
        1.0 / ray.direction.y,
        1.0 / ray.direction.z,
    );

    let t1 = (aabb.min.x - ray.origin.x) * inv_dir.x;
    let t2 = (aabb.max.x - ray.origin.x) * inv_dir.x;
    let t3 = (aabb.min.y - ray.origin.y) * inv_dir.y;
    let t4 = (aabb.max.y - ray.origin.y) * inv_dir.y;
    let t5 = (aabb.min.z - ray.origin.z) * inv_dir.z;
    let t6 = (aabb.max.z - ray.origin.z) * inv_dir.z;

    let tmin = t1.min(t2).max(t3.min(t4)).max(t5.min(t6));
    let tmax = t1.max(t2).min(t3.max(t4)).min(t5.max(t6));

    if tmax < 0.0 || tmin > tmax {
        return None;
    }

    Some(if tmin < 0.0 { tmax } else { tmin })
}

/// Pick the nearest object whose AABB is intersected by the ray.
pub fn pick_nearest(ray: &Ray, aabbs: &HashMap<String, Aabb>) -> Option<String> {
    let mut best: Option<(String, f32)> = None;

    for (id, aabb) in aabbs {
        if let Some(dist) = ray_aabb(ray, aabb) {
            if best.as_ref().is_none_or(|(_, d)| dist < *d) {
                best = Some((id.clone(), dist));
            }
        }
    }

    best.map(|(id, _)| id)
}

/// Möller-Trumbore ray-triangle intersection algorithm.
/// Returns the distance along the ray if hit, or None if no intersection.
pub fn ray_triangle_intersect(ray: &Ray, v0: Vec3, v1: Vec3, v2: Vec3) -> Option<f32> {
    const EPSILON: f32 = 1e-7;

    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    let h = ray.direction.cross(edge2);
    let a = edge1.dot(h);

    // Ray is parallel to triangle
    if a.abs() < EPSILON {
        return None;
    }

    let f = 1.0 / a;
    let s = ray.origin - v0;
    let u = f * s.dot(h);

    // Outside triangle (u)
    if !(0.0..=1.0).contains(&u) {
        return None;
    }

    let q = s.cross(edge1);
    let v = f * ray.direction.dot(q);

    // Outside triangle (v)
    if v < 0.0 || u + v > 1.0 {
        return None;
    }

    let t = f * edge2.dot(q);

    // Intersection is behind ray origin
    if t > EPSILON {
        Some(t)
    } else {
        None
    }
}

/// Result of picking a triangle in a mesh
#[derive(Clone, Debug)]
pub struct TriangleHit {
    /// Index of the triangle (into mesh.indices / 3)
    pub triangle_index: usize,
    /// Distance from ray origin to hit point
    pub distance: f32,
    /// Normal of the hit triangle
    pub normal: Vec3,
}

/// Find the nearest triangle in a mesh intersected by the ray.
/// Returns triangle index, hit distance, and triangle normal.
pub fn pick_triangle(ray: &Ray, mesh: &MeshData) -> Option<TriangleHit> {
    let stride = 9;
    let indices = &mesh.indices;
    let verts = &mesh.vertices;
    let tri_count = indices.len() / 3;

    let mut best: Option<TriangleHit> = None;

    for tri_idx in 0..tri_count {
        let i0 = indices[tri_idx * 3] as usize;
        let i1 = indices[tri_idx * 3 + 1] as usize;
        let i2 = indices[tri_idx * 3 + 2] as usize;

        let v0 = Vec3::new(
            verts[i0 * stride],
            verts[i0 * stride + 1],
            verts[i0 * stride + 2],
        );
        let v1 = Vec3::new(
            verts[i1 * stride],
            verts[i1 * stride + 1],
            verts[i1 * stride + 2],
        );
        let v2 = Vec3::new(
            verts[i2 * stride],
            verts[i2 * stride + 1],
            verts[i2 * stride + 2],
        );

        if let Some(dist) = ray_triangle_intersect(ray, v0, v1, v2) {
            if best.as_ref().is_none_or(|b| dist < b.distance) {
                // Compute triangle normal (use stored normal from first vertex)
                let normal = Vec3::new(
                    verts[i0 * stride + 3],
                    verts[i0 * stride + 4],
                    verts[i0 * stride + 5],
                );
                best = Some(TriangleHit {
                    triangle_index: tri_idx,
                    distance: dist,
                    normal,
                });
            }
        }
    }

    best
}

/// Get the normal of a triangle by index
fn get_triangle_normal(mesh: &MeshData, tri_idx: usize) -> Vec3 {
    let stride = 9;
    let i0 = mesh.indices[tri_idx * 3] as usize;
    Vec3::new(
        mesh.vertices[i0 * stride + 3],
        mesh.vertices[i0 * stride + 4],
        mesh.vertices[i0 * stride + 5],
    )
}

/// Group coplanar triangles starting from a seed triangle.
/// Uses flood-fill to find all triangles that share edges and have similar normals.
/// Returns indices of all triangles in the face group.
pub fn group_coplanar_triangles(
    mesh: &MeshData,
    seed_tri: usize,
    normal_threshold: f32,
) -> Vec<usize> {
    let stride = 9;
    let indices = &mesh.indices;
    let verts = &mesh.vertices;
    let tri_count = indices.len() / 3;

    let seed_normal = get_triangle_normal(mesh, seed_tri);
    let mut result = vec![seed_tri];
    let mut visited = vec![false; tri_count];
    visited[seed_tri] = true;

    // Build edge-to-triangle adjacency map
    // Edge is represented as (min_vertex_idx, max_vertex_idx)
    let mut edge_to_tris: HashMap<(u32, u32), Vec<usize>> = HashMap::new();

    for tri_idx in 0..tri_count {
        let i0 = indices[tri_idx * 3];
        let i1 = indices[tri_idx * 3 + 1];
        let i2 = indices[tri_idx * 3 + 2];

        // Get vertex positions for comparison (since indices may be unique per triangle)
        let v0 = (
            (verts[i0 as usize * stride] * 1000.0) as i32,
            (verts[i0 as usize * stride + 1] * 1000.0) as i32,
            (verts[i0 as usize * stride + 2] * 1000.0) as i32,
        );
        let v1 = (
            (verts[i1 as usize * stride] * 1000.0) as i32,
            (verts[i1 as usize * stride + 1] * 1000.0) as i32,
            (verts[i1 as usize * stride + 2] * 1000.0) as i32,
        );
        let v2 = (
            (verts[i2 as usize * stride] * 1000.0) as i32,
            (verts[i2 as usize * stride + 1] * 1000.0) as i32,
            (verts[i2 as usize * stride + 2] * 1000.0) as i32,
        );

        // Hash positions instead of indices (since flat shading uses unique vertices)
        let hash = |p: (i32, i32, i32)| -> u32 {
            ((p.0.wrapping_mul(73856093)) ^ (p.1.wrapping_mul(19349663)) ^ (p.2.wrapping_mul(83492791))) as u32
        };

        let h0 = hash(v0);
        let h1 = hash(v1);
        let h2 = hash(v2);

        let edges = [
            (h0.min(h1), h0.max(h1)),
            (h1.min(h2), h1.max(h2)),
            (h2.min(h0), h2.max(h0)),
        ];

        for edge in edges {
            edge_to_tris.entry(edge).or_default().push(tri_idx);
        }
    }

    // Flood fill from seed
    let mut stack = vec![seed_tri];

    while let Some(current) = stack.pop() {
        let i0 = indices[current * 3];
        let i1 = indices[current * 3 + 1];
        let i2 = indices[current * 3 + 2];

        let v0 = (
            (verts[i0 as usize * stride] * 1000.0) as i32,
            (verts[i0 as usize * stride + 1] * 1000.0) as i32,
            (verts[i0 as usize * stride + 2] * 1000.0) as i32,
        );
        let v1 = (
            (verts[i1 as usize * stride] * 1000.0) as i32,
            (verts[i1 as usize * stride + 1] * 1000.0) as i32,
            (verts[i1 as usize * stride + 2] * 1000.0) as i32,
        );
        let v2 = (
            (verts[i2 as usize * stride] * 1000.0) as i32,
            (verts[i2 as usize * stride + 1] * 1000.0) as i32,
            (verts[i2 as usize * stride + 2] * 1000.0) as i32,
        );

        let hash = |p: (i32, i32, i32)| -> u32 {
            ((p.0.wrapping_mul(73856093)) ^ (p.1.wrapping_mul(19349663)) ^ (p.2.wrapping_mul(83492791))) as u32
        };

        let h0 = hash(v0);
        let h1 = hash(v1);
        let h2 = hash(v2);

        let edges = [
            (h0.min(h1), h0.max(h1)),
            (h1.min(h2), h1.max(h2)),
            (h2.min(h0), h2.max(h0)),
        ];

        for edge in edges {
            if let Some(neighbors) = edge_to_tris.get(&edge) {
                for &neighbor in neighbors {
                    if visited[neighbor] {
                        continue;
                    }

                    let neighbor_normal = get_triangle_normal(mesh, neighbor);
                    let dot = seed_normal.dot(neighbor_normal);

                    if dot > normal_threshold {
                        visited[neighbor] = true;
                        result.push(neighbor);
                        stack.push(neighbor);
                    }
                }
            }
        }
    }

    result
}

/// Calculate the total area of a group of triangles
pub fn calculate_face_area(mesh: &MeshData, triangle_indices: &[usize]) -> f32 {
    let stride = 9;
    let indices = &mesh.indices;
    let verts = &mesh.vertices;

    let mut total_area = 0.0;

    for &tri_idx in triangle_indices {
        let i0 = indices[tri_idx * 3] as usize;
        let i1 = indices[tri_idx * 3 + 1] as usize;
        let i2 = indices[tri_idx * 3 + 2] as usize;

        let v0 = Vec3::new(
            verts[i0 * stride],
            verts[i0 * stride + 1],
            verts[i0 * stride + 2],
        );
        let v1 = Vec3::new(
            verts[i1 * stride],
            verts[i1 * stride + 1],
            verts[i1 * stride + 2],
        );
        let v2 = Vec3::new(
            verts[i2 * stride],
            verts[i2 * stride + 1],
            verts[i2 * stride + 2],
        );

        // Triangle area = |cross(v1-v0, v2-v0)| / 2
        let edge1 = v1 - v0;
        let edge2 = v2 - v0;
        let cross = edge1.cross(edge2);
        total_area += cross.length() * 0.5;
    }

    total_area
}

/// Calculate the centroid (center point) of a face
pub fn calculate_face_centroid(mesh: &MeshData, triangle_indices: &[usize]) -> Vec3 {
    let stride = 9;
    let indices = &mesh.indices;
    let verts = &mesh.vertices;

    let mut sum = Vec3::ZERO;
    let mut count = 0;

    for &tri_idx in triangle_indices {
        let i0 = indices[tri_idx * 3] as usize;
        let i1 = indices[tri_idx * 3 + 1] as usize;
        let i2 = indices[tri_idx * 3 + 2] as usize;

        for idx in [i0, i1, i2] {
            sum += Vec3::new(
                verts[idx * stride],
                verts[idx * stride + 1],
                verts[idx * stride + 2],
            );
            count += 1;
        }
    }

    if count > 0 {
        sum / count as f32
    } else {
        Vec3::ZERO
    }
}

/// Determine the best sketch plane based on face normal
/// Returns (SketchPlane, offset along that plane's normal)
pub fn face_to_sketch_plane(normal: [f32; 3], centroid: Vec3) -> (shared::SketchPlane, f64) {
    let n = Vec3::from(normal).normalize();

    // Find which axis the normal is most aligned with
    let abs_x = n.x.abs();
    let abs_y = n.y.abs();
    let abs_z = n.z.abs();

    if abs_z >= abs_x && abs_z >= abs_y {
        // Normal mostly points in Z direction → XY plane
        (shared::SketchPlane::Xy, centroid.z as f64)
    } else if abs_y >= abs_x && abs_y >= abs_z {
        // Normal mostly points in Y direction → XZ plane
        (shared::SketchPlane::Xz, centroid.y as f64)
    } else {
        // Normal mostly points in X direction → YZ plane
        (shared::SketchPlane::Yz, centroid.x as f64)
    }
}
