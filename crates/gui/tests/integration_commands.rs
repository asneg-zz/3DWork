//! Integration tests for the AgentCommand JSON protocol (V2 Body-based).
//!
//! Tests the full command pipeline: JSON string -> parse -> execute -> response.

use vcad_gui_lib::command::{execute_json, execute_json_batch};
use vcad_gui_lib::harness::TestHarness;

#[test]
fn test_command_create_body() {
    let mut h = TestHarness::new();

    let json = r#"{"command": "create_body", "name": "Box1", "primitive": {"type": "cube", "width": 2.0, "height": 3.0, "depth": 4.0}}"#;

    let resp = execute_json(&mut h, json).unwrap();
    assert!(resp.success);
    assert!(resp.data.as_ref().unwrap()["id"].as_str().is_some());
    assert_eq!(h.body_count(), 1);
}

#[test]
fn test_command_create_body_with_transform() {
    let mut h = TestHarness::new();

    let json = r#"{"command": "create_body", "name": "Box1", "primitive": {"type": "cube", "width": 1.0, "height": 1.0, "depth": 1.0}, "transform": {"position": [1.0, 2.0, 3.0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}}"#;

    let resp = execute_json(&mut h, json).unwrap();
    assert!(resp.success);
    assert_eq!(h.body_count(), 1);
}

#[test]
fn test_command_inspect() {
    let mut h = TestHarness::new();
    h.create_cube("c1", 1.0, 1.0, 1.0);
    h.create_cube("c2", 2.0, 2.0, 2.0);

    let resp = execute_json(&mut h, r#"{"command": "inspect"}"#).unwrap();
    assert!(resp.success);
    let data = resp.data.unwrap();
    assert_eq!(data["body_count"], 2);

    let bodies = data["bodies"].as_array().unwrap();
    assert_eq!(bodies.len(), 2);
}

#[test]
fn test_command_full_workflow_via_json_batch() {
    let mut h = TestHarness::new();

    let json = r#"[
        {"command": "create_body", "name": "A", "primitive": {"type": "cube", "width": 1, "height": 1, "depth": 1}},
        {"command": "create_body", "name": "B", "primitive": {"type": "cylinder", "radius": 0.5, "height": 2.0}},
        {"command": "inspect"}
    ]"#;

    let responses = execute_json_batch(&mut h, json).unwrap();
    assert_eq!(responses.len(), 3);
    for resp in &responses {
        assert!(resp.success, "Failed: {:?}", resp.error);
    }

    // Inspect should show 2 bodies
    let inspect_data = responses[2].data.as_ref().unwrap();
    assert_eq!(inspect_data["body_count"], 2);
}

#[test]
fn test_command_invalid_json_error() {
    let mut h = TestHarness::new();
    let result = execute_json(&mut h, "not valid json");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Invalid command JSON"));
}

#[test]
fn test_command_undo_redo_via_json() {
    let mut h = TestHarness::new();
    h.create_cube("c1", 1.0, 1.0, 1.0);
    assert_eq!(h.body_count(), 1);

    let resp = execute_json(&mut h, r#"{"command": "undo"}"#).unwrap();
    assert!(resp.success);
    assert_eq!(resp.data.as_ref().unwrap()["undone"], true);
    assert_eq!(h.body_count(), 0);

    let resp = execute_json(&mut h, r#"{"command": "redo"}"#).unwrap();
    assert!(resp.success);
    assert_eq!(resp.data.as_ref().unwrap()["redone"], true);
    assert_eq!(h.body_count(), 1);

    // Undo again, then try undo on empty
    execute_json(&mut h, r#"{"command": "undo"}"#).unwrap();
    let resp = execute_json(&mut h, r#"{"command": "undo"}"#).unwrap();
    assert!(resp.success);
    assert_eq!(resp.data.as_ref().unwrap()["undone"], false);
}

#[test]
fn test_command_delete_body() {
    let mut h = TestHarness::new();
    let id_a = h.create_cube("a", 1.0, 1.0, 1.0);
    h.create_cube("b", 1.0, 1.0, 1.0);
    assert_eq!(h.body_count(), 2);

    let delete_json = format!(r#"{{"command": "delete_body", "id": "{}"}}"#, id_a);
    let resp = execute_json(&mut h, &delete_json).unwrap();
    assert!(resp.success);
    let removed = resp.data.unwrap()["removed"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect::<Vec<_>>();
    assert!(removed.contains(&id_a));
    assert_eq!(h.body_count(), 1);
}

#[test]
fn test_command_select_and_clear_selection() {
    let mut h = TestHarness::new();
    let id1 = h.create_cube("c1", 1.0, 1.0, 1.0);
    let id2 = h.create_cube("c2", 1.0, 1.0, 1.0);

    let select_json = format!(r#"{{"command": "select", "ids": ["{}", "{}"]}}"#, id1, id2);
    let resp = execute_json(&mut h, &select_json).unwrap();
    assert!(resp.success);
    assert_eq!(h.selection.count(), 2);

    let resp = execute_json(&mut h, r#"{"command": "clear_selection"}"#).unwrap();
    assert!(resp.success);
    assert_eq!(h.selection.count(), 0);
}

#[test]
fn test_command_export_and_reload() {
    let mut h = TestHarness::new();
    h.create_cube("c1", 1.0, 2.0, 3.0);
    h.create_cylinder("cy1", 0.5, 1.0);

    let resp = execute_json(&mut h, r#"{"command": "export_scene"}"#).unwrap();
    assert!(resp.success);
    let scene_json = resp.data.unwrap()["scene_json"].as_str().unwrap().to_string();
    assert!(scene_json.contains("bodies"));

    // Reload into a new harness
    let mut h2 = TestHarness::new();
    h2.load_scene_json(&scene_json).unwrap();
    assert_eq!(h2.body_count(), 2);
    h2.build();
    assert_eq!(h2.visible_mesh_count(), 2);
}

#[test]
fn test_command_clear() {
    let mut h = TestHarness::new();
    h.create_cube("c1", 1.0, 1.0, 1.0);
    h.create_cube("c2", 2.0, 2.0, 2.0);
    assert_eq!(h.body_count(), 2);

    let resp = execute_json(&mut h, r#"{"command": "clear"}"#).unwrap();
    assert!(resp.success);
    assert_eq!(h.body_count(), 0);
}

#[test]
fn test_command_create_all_primitives() {
    let mut h = TestHarness::new();

    let cmds = r#"[
        {"command": "create_body", "name": "Cube", "primitive": {"type": "cube", "width": 1, "height": 1, "depth": 1}},
        {"command": "create_body", "name": "Cylinder", "primitive": {"type": "cylinder", "radius": 0.5, "height": 2}},
        {"command": "create_body", "name": "Sphere", "primitive": {"type": "sphere", "radius": 0.5}},
        {"command": "create_body", "name": "Cone", "primitive": {"type": "cone", "radius": 0.5, "height": 1}},
        {"command": "inspect"}
    ]"#;

    let responses = execute_json_batch(&mut h, cmds).unwrap();
    for (i, resp) in responses.iter().enumerate() {
        assert!(resp.success, "Command {} failed: {:?}", i, resp.error);
    }

    let inspect_data = responses[4].data.as_ref().unwrap();
    assert_eq!(inspect_data["body_count"], 4);

    // Build and verify all meshes are valid
    h.build();
    assert_eq!(h.visible_mesh_count(), 4);
}
