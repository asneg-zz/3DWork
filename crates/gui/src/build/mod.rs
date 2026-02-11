//! CSG mesh building for V2 Body-based architecture.
//!
//! Simplified for Body/Feature model - focuses on primitive-based bodies for now.

mod body_builder;
mod cache;
mod extrude_builder;
mod mesh_extraction;
mod primitives;
mod sketch_geometry;

pub use cache::CsgCache;
pub use mesh_extraction::{apply_face_highlight, extract_mesh_data};
pub use primitives::{apply_transform, create_primitive};

use std::collections::HashMap;

use shared::SceneDescriptionV2;

use crate::viewport::mesh::MeshData;

/// Build meshes from V2 scene (body-based)
pub fn build_scene_meshes_v2(
    scene: &SceneDescriptionV2,
    selected_ids: &[String],
) -> (HashMap<String, MeshData>, HashMap<String, String>) {
    let mut meshes: HashMap<String, MeshData> = HashMap::new();
    let mut errors: HashMap<String, String> = HashMap::new();

    for body in &scene.bodies {
        if !body.visible {
            continue;
        }

        let is_selected = selected_ids.contains(&body.id);

        match body_builder::build_body_mesh_data(body, is_selected, &scene.bodies) {
            Ok(Some(mesh_data)) => {
                meshes.insert(body.id.clone(), mesh_data);
            }
            Ok(None) => {
                // Body doesn't produce 3D geometry (e.g., sketch-only body)
            }
            Err(msg) => {
                errors.insert(body.id.clone(), msg);
            }
        }
    }

    (meshes, errors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared::*;
    use std::collections::HashSet;

    fn empty_scene() -> SceneDescriptionV2 {
        SceneDescriptionV2 {
            version: 2,
            bodies: vec![],
            body_operations: vec![],
        }
    }

    fn scene_with_cube() -> SceneDescriptionV2 {
        SceneDescriptionV2 {
            version: 2,
            bodies: vec![Body {
                id: "body1".to_string(),
                name: "Cube".to_string(),
                features: vec![Feature::BasePrimitive {
                    id: "feat1".to_string(),
                    primitive: Primitive::Cube {
                        width: 1.0,
                        height: 1.0,
                        depth: 1.0,
                    },
                    transform: Transform::new(),
                }],
                visible: true,
            }],
            body_operations: vec![],
        }
    }

    #[test]
    fn test_build_empty_scene() {
        let scene = empty_scene();
        let (meshes, errors) = build_scene_meshes_v2(&scene, &[]);
        assert!(meshes.is_empty());
        assert!(errors.is_empty());
    }

    #[test]
    fn test_build_single_body() {
        let scene = scene_with_cube();
        let (meshes, errors) = build_scene_meshes_v2(&scene, &[]);
        assert!(errors.is_empty());
        assert_eq!(meshes.len(), 1);
        assert!(meshes.contains_key("body1"));
    }

    #[test]
    fn test_build_hidden_body_excluded() {
        let mut scene = scene_with_cube();
        scene.bodies[0].visible = false;
        let (meshes, _) = build_scene_meshes_v2(&scene, &[]);
        assert!(meshes.is_empty());
    }

    #[test]
    fn test_cache_forces_first_rebuild() {
        let cache = CsgCache::new();
        assert!(!cache.is_valid(0, &[], &HashSet::new(), 0));
    }

    #[test]
    fn test_cache_valid_after_rebuild() {
        let mut cache = CsgCache::new();
        let scene = scene_with_cube();
        cache.rebuild(&scene, &[], &HashSet::new(), 1, None, 0);
        assert!(cache.is_valid(1, &[], &HashSet::new(), 0));
    }

    #[test]
    fn test_extract_mesh_data_cube() {
        let part = primitives::create_primitive(
            "c",
            &Primitive::Cube {
                width: 1.0,
                height: 1.0,
                depth: 1.0,
            },
        );
        let mesh = mesh_extraction::extract_mesh_data(&part, false).unwrap();
        assert_eq!(mesh.vertices.len() % 9, 0);
        assert_eq!(mesh.indices.len() % 3, 0);
    }
}
