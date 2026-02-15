//! Factory functions for creating test data (V2 Body-based).
//!
//! Provides convenient helpers to construct `Body`, `Feature`, `SceneDescriptionV2`,
//! and other types used in tests and by the AI agent interface.

use shared::*;
use std::collections::{HashMap, HashSet};

// ── Body factories ──────────────────────────────────────────────

/// Create a body with a cube primitive.
pub fn cube_body(id: &str, name: &str, w: f64, h: f64, d: f64) -> Body {
    Body {
        id: id.to_string(),
        name: name.to_string(),
        features: vec![Feature::BasePrimitive {
            id: format!("{}_feat", id),
            primitive: Primitive::Cube {
                width: w,
                height: h,
                depth: d,
            },
            transform: Transform::new(),
        }],
        visible: true,
        parameters: HashMap::new(),
    }
}

/// Create a unit cube body (1x1x1).
pub fn unit_cube_body(id: &str) -> Body {
    cube_body(id, "Cube", 1.0, 1.0, 1.0)
}

/// Create a cube body at a specific position.
pub fn cube_body_at(id: &str, name: &str, w: f64, h: f64, d: f64, pos: [f64; 3]) -> Body {
    Body {
        id: id.to_string(),
        name: name.to_string(),
        features: vec![Feature::BasePrimitive {
            id: format!("{}_feat", id),
            primitive: Primitive::Cube {
                width: w,
                height: h,
                depth: d,
            },
            transform: Transform {
                position: pos,
                rotation: [0.0; 3],
                scale: [1.0; 3],
            },
        }],
        visible: true,
        parameters: HashMap::new(),
    }
}

/// Create a cylinder body.
pub fn cylinder_body(id: &str, name: &str, r: f64, h: f64) -> Body {
    Body {
        id: id.to_string(),
        name: name.to_string(),
        features: vec![Feature::BasePrimitive {
            id: format!("{}_feat", id),
            primitive: Primitive::Cylinder { radius: r, height: h },
            transform: Transform::new(),
        }],
        visible: true,
        parameters: HashMap::new(),
    }
}

/// Create a sphere body.
pub fn sphere_body(id: &str, name: &str, r: f64) -> Body {
    Body {
        id: id.to_string(),
        name: name.to_string(),
        features: vec![Feature::BasePrimitive {
            id: format!("{}_feat", id),
            primitive: Primitive::Sphere { radius: r },
            transform: Transform::new(),
        }],
        visible: true,
        parameters: HashMap::new(),
    }
}

/// Create a cone body.
pub fn cone_body(id: &str, name: &str, r: f64, h: f64) -> Body {
    Body {
        id: id.to_string(),
        name: name.to_string(),
        features: vec![Feature::BasePrimitive {
            id: format!("{}_feat", id),
            primitive: Primitive::Cone { radius: r, height: h },
            transform: Transform::new(),
        }],
        visible: true,
        parameters: HashMap::new(),
    }
}

// ── SceneDescriptionV2 factories ────────────────────────────────

/// Wrap bodies into a SceneDescriptionV2.
pub fn scene_v2(bodies: Vec<Body>) -> SceneDescriptionV2 {
    SceneDescriptionV2 {
        version: 2,
        bodies,
        body_operations: vec![],
    }
}

/// Empty scene.
pub fn empty_scene_v2() -> SceneDescriptionV2 {
    SceneDescriptionV2 {
        version: 2,
        bodies: vec![],
        body_operations: vec![],
    }
}

/// Scene with a single unit cube.
pub fn scene_single_cube_v2() -> SceneDescriptionV2 {
    scene_v2(vec![unit_cube_body("cube1")])
}

/// Scene with multiple primitives.
pub fn scene_multiple_primitives_v2() -> SceneDescriptionV2 {
    scene_v2(vec![
        cube_body("c1", "Cube", 1.0, 1.0, 1.0),
        cylinder_body("cy1", "Cylinder", 0.5, 2.0),
        sphere_body("sp1", "Sphere", 0.5),
        cone_body("co1", "Cone", 0.5, 1.0),
    ])
}

// ── Convenience helpers ───────────────────────────────────────

/// Empty selection list.
pub fn no_selection() -> Vec<String> {
    vec![]
}

/// Empty hidden set.
pub fn no_hidden() -> HashSet<String> {
    HashSet::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unit_cube_body_factory() {
        let body = unit_cube_body("c1");
        assert_eq!(body.id, "c1");
        assert_eq!(body.name, "Cube");
        assert!(body.visible);
        assert_eq!(body.features.len(), 1);

        match &body.features[0] {
            Feature::BasePrimitive { primitive, .. } => {
                match primitive {
                    Primitive::Cube { width, height, depth } => {
                        assert_eq!(*width, 1.0);
                        assert_eq!(*height, 1.0);
                        assert_eq!(*depth, 1.0);
                    }
                    _ => panic!("Expected Cube"),
                }
            }
            _ => panic!("Expected BasePrimitive"),
        }
    }

    #[test]
    fn test_cube_body_at_factory() {
        let body = cube_body_at("c1", "Cube", 2.0, 3.0, 4.0, [1.0, 2.0, 3.0]);
        match &body.features[0] {
            Feature::BasePrimitive { transform, .. } => {
                assert_eq!(transform.position, [1.0, 2.0, 3.0]);
            }
            _ => panic!("Expected BasePrimitive"),
        }
    }

    #[test]
    fn test_scene_v2_factories() {
        assert!(empty_scene_v2().bodies.is_empty());
        assert_eq!(scene_single_cube_v2().bodies.len(), 1);
        assert_eq!(scene_multiple_primitives_v2().bodies.len(), 4);
    }

    #[test]
    fn test_all_primitives() {
        let cube = cube_body("c", "Cube", 1.0, 1.0, 1.0);
        let cyl = cylinder_body("cy", "Cylinder", 0.5, 2.0);
        let sph = sphere_body("sp", "Sphere", 0.5);
        let con = cone_body("co", "Cone", 0.5, 1.0);

        assert!(!cube.features.is_empty());
        assert!(!cyl.features.is_empty());
        assert!(!sph.features.is_empty());
        assert!(!con.features.is_empty());
    }
}
