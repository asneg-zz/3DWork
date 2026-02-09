//! Integration tests for TestHarness (V2 Body-based).
//!
//! Tests the headless harness API for programmatic scene manipulation.

use vcad_gui_lib::harness::TestHarness;

#[test]
fn test_harness_create_and_build() {
    let mut h = TestHarness::new();
    let id = h.create_cube("c1", 2.0, 3.0, 4.0);
    h.build();

    assert_eq!(h.visible_mesh_count(), 1);
    assert!(h.errors().is_empty());

    let v = h.validate_mesh(&id).unwrap();
    let errors = v.validate_all();
    assert!(errors.is_empty(), "Validation errors: {:?}", errors);
    assert!(v.vertex_count() > 0);
}

#[test]
fn test_harness_undo_redo_cycle() {
    let mut h = TestHarness::new();
    h.create_cube("c1", 1.0, 1.0, 1.0);
    h.create_cube("c2", 2.0, 2.0, 2.0);
    assert_eq!(h.body_count(), 2);

    assert!(h.undo());
    assert_eq!(h.body_count(), 1);

    assert!(h.undo());
    assert_eq!(h.body_count(), 0);

    assert!(!h.undo()); // nothing to undo
    assert_eq!(h.body_count(), 0);

    assert!(h.redo());
    assert_eq!(h.body_count(), 1);

    assert!(h.redo());
    assert_eq!(h.body_count(), 2);

    assert!(!h.redo()); // nothing to redo
}

#[test]
fn test_harness_delete_body() {
    let mut h = TestHarness::new();
    let id_a = h.create_cube("a", 1.0, 1.0, 1.0);
    h.create_cube("b", 1.0, 1.0, 1.0);
    assert_eq!(h.body_count(), 2);

    let removed = h.delete(&id_a);
    assert!(removed.contains(&id_a));
    assert_eq!(h.body_count(), 1);
}

#[test]
fn test_harness_load_export_json() {
    let mut h1 = TestHarness::new();
    h1.create_cube("c1", 1.0, 2.0, 3.0);
    h1.create_cylinder("cy1", 0.5, 1.0);
    let json = h1.export_scene_json();

    let mut h2 = TestHarness::new();
    h2.load_scene_json(&json).unwrap();
    assert_eq!(h2.body_count(), 2);

    h2.build();
    assert_eq!(h2.visible_mesh_count(), 2);
}

#[test]
fn test_harness_complex_scene() {
    let mut h = TestHarness::new();

    // Build a simple table-like structure
    let top = h.create_cube("top", 2.0, 0.1, 1.0);
    let leg1 = h.create_cube("leg1", 0.1, 1.0, 0.1);
    let leg2 = h.create_cube("leg2", 0.1, 1.0, 0.1);
    let leg3 = h.create_cube("leg3", 0.1, 1.0, 0.1);
    let leg4 = h.create_cube("leg4", 0.1, 1.0, 0.1);

    assert_eq!(h.body_count(), 5);

    h.build();
    assert_eq!(h.visible_mesh_count(), 5);

    // Validate all meshes
    for id in [&top, &leg1, &leg2, &leg3, &leg4] {
        let v = h.validate_mesh(id).unwrap();
        let errors = v.validate_all();
        assert!(errors.is_empty(), "{} errors: {:?}", id, errors);
    }
}

#[test]
fn test_harness_visibility() {
    let mut h = TestHarness::new();
    let a = h.create_cube("a", 1.0, 1.0, 1.0);
    let b = h.create_cube("b", 1.0, 1.0, 1.0);

    h.hide(&a);
    h.build();
    assert!(h.mesh_of(&a).is_none());
    assert!(h.mesh_of(&b).is_some());

    h.show(&a);
    h.build();
    assert!(h.mesh_of(&a).is_some());
    assert!(h.mesh_of(&b).is_some());
}

#[test]
fn test_harness_all_primitives() {
    let mut h = TestHarness::new();

    let cube = h.create_cube("cube", 1.0, 1.0, 1.0);
    let cyl = h.create_cylinder("cyl", 0.5, 2.0);
    let sph = h.create_sphere("sph", 0.5);
    let cone = h.create_cone("cone", 0.5, 1.0);

    assert_eq!(h.body_count(), 4);

    h.build();
    assert_eq!(h.visible_mesh_count(), 4);

    // Validate all meshes
    for id in [&cube, &cyl, &sph, &cone] {
        let v = h.validate_mesh(id).unwrap();
        let errors = v.validate_all();
        assert!(errors.is_empty(), "{} errors: {:?}", id, errors);
        assert!(v.vertex_count() > 0);
        assert!(v.triangle_count() > 0);
    }
}
