//! JSON command protocol for the AI agent.
//!
//! Simplified for V2 Body-based architecture.

use serde::{Deserialize, Serialize};
use shared::{Primitive, Transform};

use crate::harness::TestHarness;

/// A command the AI agent can execute (V2 body-based).
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum AgentCommand {
    /// Create a new body with a primitive
    CreateBody {
        name: String,
        primitive: Primitive,
        #[serde(default)]
        transform: Transform,
    },
    /// Delete a body by ID
    DeleteBody {
        id: String,
    },
    /// Undo the last operation.
    Undo,
    /// Redo the last undone operation.
    Redo,
    /// Clear the entire scene.
    Clear,
    /// Select bodies by IDs.
    Select {
        ids: Vec<String>,
    },
    /// Clear selection.
    ClearSelection,
    /// Inspect the scene: list all bodies.
    Inspect,
    /// Export the scene as JSON.
    ExportScene,
}

/// Response from executing a command.
#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl CommandResponse {
    fn ok() -> Self {
        Self {
            success: true,
            error: None,
            data: None,
        }
    }

    fn ok_with_data(data: serde_json::Value) -> Self {
        Self {
            success: true,
            error: None,
            data: Some(data),
        }
    }

    #[allow(dead_code)]
    fn err(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            error: Some(msg.into()),
            data: None,
        }
    }
}

/// Execute a single command on the harness.
pub fn execute_command(harness: &mut TestHarness, cmd: AgentCommand) -> CommandResponse {
    match cmd {
        AgentCommand::CreateBody {
            name,
            primitive,
            transform,
        } => {
            let id = harness
                .scene
                .create_body_with_primitive(name, primitive, transform);
            CommandResponse::ok_with_data(serde_json::json!({ "id": id }))
        }

        AgentCommand::DeleteBody { id } => {
            let removed = harness.delete_body(&id);
            CommandResponse::ok_with_data(serde_json::json!({ "removed": removed }))
        }

        AgentCommand::Undo => {
            let success = harness.undo();
            CommandResponse::ok_with_data(serde_json::json!({ "undone": success }))
        }

        AgentCommand::Redo => {
            let success = harness.redo();
            CommandResponse::ok_with_data(serde_json::json!({ "redone": success }))
        }

        AgentCommand::Clear => {
            harness.clear();
            CommandResponse::ok()
        }

        AgentCommand::Select { ids } => {
            harness.clear_selection();
            for id in &ids {
                // Use toggle to add to selection without clearing
                harness.selection.toggle(id.clone());
            }
            CommandResponse::ok_with_data(serde_json::json!({ "selected": ids }))
        }

        AgentCommand::ClearSelection => {
            harness.clear_selection();
            CommandResponse::ok()
        }

        AgentCommand::Inspect => {
            let bodies: Vec<serde_json::Value> = harness
                .scene
                .scene
                .bodies
                .iter()
                .map(|body| {
                    serde_json::json!({
                        "id": body.id,
                        "name": body.name,
                        "visible": body.visible,
                        "feature_count": body.features.len(),
                    })
                })
                .collect();
            CommandResponse::ok_with_data(serde_json::json!({
                "body_count": bodies.len(),
                "bodies": bodies,
            }))
        }

        AgentCommand::ExportScene => {
            let json = harness.export_scene_json();
            CommandResponse::ok_with_data(serde_json::json!({ "scene_json": json }))
        }
    }
}

/// Parse and execute a single JSON command string.
pub fn execute_json(harness: &mut TestHarness, json: &str) -> Result<CommandResponse, String> {
    let cmd: AgentCommand =
        serde_json::from_str(json).map_err(|e| format!("Invalid command JSON: {e}"))?;
    Ok(execute_command(harness, cmd))
}

/// Parse and execute multiple JSON commands (array).
pub fn execute_json_batch(
    harness: &mut TestHarness,
    json: &str,
) -> Result<Vec<CommandResponse>, String> {
    let cmds: Vec<AgentCommand> =
        serde_json::from_str(json).map_err(|e| format!("Invalid commands JSON: {e}"))?;
    Ok(cmds
        .into_iter()
        .map(|cmd| execute_command(harness, cmd))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_serde_undo() {
        let json = r#"{"command": "undo"}"#;
        let cmd: AgentCommand = serde_json::from_str(json).unwrap();
        assert!(matches!(cmd, AgentCommand::Undo));
    }

    #[test]
    fn test_command_serde_create_body() {
        let json = r#"{"command": "create_body", "name": "Cube1", "primitive": {"type": "cube", "width": 1.0, "height": 1.0, "depth": 1.0}}"#;
        let cmd: AgentCommand = serde_json::from_str(json).unwrap();
        match cmd {
            AgentCommand::CreateBody { name, .. } => assert_eq!(name, "Cube1"),
            _ => panic!("Expected CreateBody"),
        }
    }

    #[test]
    fn test_command_serde_delete_body() {
        let json = r#"{"command": "delete_body", "id": "body1"}"#;
        let cmd: AgentCommand = serde_json::from_str(json).unwrap();
        match cmd {
            AgentCommand::DeleteBody { id } => assert_eq!(id, "body1"),
            _ => panic!("Expected DeleteBody"),
        }
    }

    #[test]
    fn test_command_serde_select() {
        let json = r#"{"command": "select", "ids": ["a", "b"]}"#;
        let cmd: AgentCommand = serde_json::from_str(json).unwrap();
        match cmd {
            AgentCommand::Select { ids } => assert_eq!(ids, vec!["a", "b"]),
            _ => panic!("Expected Select"),
        }
    }

    #[test]
    fn test_execute_create_body() {
        let mut h = TestHarness::new();
        let json = r#"{"command": "create_body", "name": "Cube1", "primitive": {"type": "cube", "width": 2.0, "height": 2.0, "depth": 2.0}}"#;

        let resp = execute_json(&mut h, json).unwrap();
        assert!(resp.success);
        assert_eq!(h.body_count(), 1);
    }

    #[test]
    fn test_execute_inspect() {
        let mut h = TestHarness::new();
        h.create_cube("c1", 1.0, 1.0, 1.0);
        h.create_cube("c2", 2.0, 2.0, 2.0);

        let resp = execute_json(&mut h, r#"{"command": "inspect"}"#).unwrap();
        assert!(resp.success);
        let data = resp.data.unwrap();
        assert_eq!(data["body_count"], 2);
    }

    #[test]
    fn test_execute_undo_redo() {
        let mut h = TestHarness::new();
        h.create_cube("c1", 1.0, 1.0, 1.0);

        let resp = execute_json(&mut h, r#"{"command": "undo"}"#).unwrap();
        assert!(resp.success);
        assert_eq!(resp.data.unwrap()["undone"], true);
        assert_eq!(h.body_count(), 0);

        let resp = execute_json(&mut h, r#"{"command": "redo"}"#).unwrap();
        assert!(resp.success);
        assert_eq!(resp.data.unwrap()["redone"], true);
        assert_eq!(h.body_count(), 1);
    }

    #[test]
    fn test_execute_export_scene() {
        let mut h = TestHarness::new();
        h.create_cube("c1", 1.0, 1.0, 1.0);

        let resp = execute_json(&mut h, r#"{"command": "export_scene"}"#).unwrap();
        assert!(resp.success);
        let data = resp.data.unwrap();
        let scene_json = data["scene_json"].as_str().unwrap();
        assert!(scene_json.contains("bodies"));
    }

    #[test]
    fn test_execute_invalid_json() {
        let mut h = TestHarness::new();
        let result = execute_json(&mut h, "not valid json");
        assert!(result.is_err());
    }
}
