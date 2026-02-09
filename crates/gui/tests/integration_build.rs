//! Integration tests for the build pipeline (V2 Body-based).
//!
//! Tests end-to-end: SceneDescriptionV2 -> build_scene_meshes_v2 -> validate mesh output.

use vcad_gui_lib::build::build_scene_meshes_v2;
use vcad_gui_lib::fixtures::*;
use vcad_gui_lib::validation::MeshValidator;

#[test]
fn test_cube_end_to_end() {
    let scene = scene_single_cube_v2();
    let (meshes, errors) = build_scene_meshes_v2(&scene, &no_selection());

    assert!(errors.is_empty(), "Build errors: {:?}", errors);
    assert_eq!(meshes.len(), 1);

    let mesh = meshes.get("cube1").unwrap();
    let v = MeshValidator::new(mesh);
    let validation_errors = v.validate_all();
    assert!(
        validation_errors.is_empty(),
        "Validation errors: {:?}",
        validation_errors
    );
    assert!(v.vertex_count() > 0);
    assert!(v.triangle_count() > 0);
}

#[test]
fn test_hidden_bodies_excluded() {
    let mut scene = scene_v2(vec![unit_cube_body("a"), unit_cube_body("b")]);
    scene.bodies[0].visible = false;

    let (meshes, _) = build_scene_meshes_v2(&scene, &no_selection());
    assert!(!meshes.contains_key("a"));
    assert!(meshes.contains_key("b"));
}

#[test]
fn test_selection_color_in_mesh() {
    let scene = scene_single_cube_v2();
    let selected = vec!["cube1".to_string()];
    let (meshes, _) = build_scene_meshes_v2(&scene, &selected);

    let mesh = meshes.get("cube1").unwrap();
    let v = MeshValidator::new(mesh);
    assert!(v.has_selection_color());
}

#[test]
fn test_multiple_primitives() {
    let scene = scene_multiple_primitives_v2();
    let (meshes, errors) = build_scene_meshes_v2(&scene, &no_selection());

    assert!(errors.is_empty());
    assert_eq!(meshes.len(), 4);

    for (id, mesh) in &meshes {
        let v = MeshValidator::new(mesh);
        let errors = v.validate_all();
        assert!(errors.is_empty(), "{} validation errors: {:?}", id, errors);
    }
}

#[test]
fn test_empty_scene() {
    let scene = empty_scene_v2();
    let (meshes, errors) = build_scene_meshes_v2(&scene, &no_selection());

    assert!(meshes.is_empty());
    assert!(errors.is_empty());
}

#[test]
fn test_cube_dimensions() {
    let scene = scene_v2(vec![cube_body("c1", "Cube", 2.0, 3.0, 4.0)]);
    let (meshes, errors) = build_scene_meshes_v2(&scene, &no_selection());

    assert!(errors.is_empty());
    let mesh = meshes.get("c1").unwrap();
    let v = MeshValidator::new(mesh);

    let dims = v.dimensions();
    assert!((dims[0] - 2.0).abs() < 0.1, "width: {}", dims[0]);
    assert!((dims[1] - 3.0).abs() < 0.1, "height: {}", dims[1]);
    assert!((dims[2] - 4.0).abs() < 0.1, "depth: {}", dims[2]);
}

#[test]
fn test_cylinder_mesh() {
    let scene = scene_v2(vec![cylinder_body("cy1", "Cylinder", 0.5, 2.0)]);
    let (meshes, errors) = build_scene_meshes_v2(&scene, &no_selection());

    assert!(errors.is_empty());
    let mesh = meshes.get("cy1").unwrap();
    let v = MeshValidator::new(mesh);

    let errors = v.validate_all();
    assert!(errors.is_empty(), "Validation errors: {:?}", errors);
    assert!(v.vertex_count() > 0);
    assert!(v.triangle_count() > 0);
}

#[test]
fn test_sphere_mesh() {
    let scene = scene_v2(vec![sphere_body("sp1", "Sphere", 0.5)]);
    let (meshes, errors) = build_scene_meshes_v2(&scene, &no_selection());

    assert!(errors.is_empty());
    let mesh = meshes.get("sp1").unwrap();
    let v = MeshValidator::new(mesh);

    let errors = v.validate_all();
    assert!(errors.is_empty(), "Validation errors: {:?}", errors);
    assert!(v.vertex_count() > 0);
}

#[test]
fn test_cone_mesh() {
    let scene = scene_v2(vec![cone_body("co1", "Cone", 0.5, 1.0)]);
    let (meshes, errors) = build_scene_meshes_v2(&scene, &no_selection());

    assert!(errors.is_empty());
    let mesh = meshes.get("co1").unwrap();
    let v = MeshValidator::new(mesh);

    let errors = v.validate_all();
    assert!(errors.is_empty(), "Validation errors: {:?}", errors);
    assert!(v.vertex_count() > 0);
}
