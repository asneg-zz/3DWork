//! Body CRUD operations

use std::collections::HashMap;
use shared::{
    Body, BodyId, BodyOperation, BooleanOp, BooleanResult, Feature, Primitive,
    SceneDescriptionV2, Sketch, Transform,
};

use super::SceneState;

impl SceneState {
    /// Create a new empty body (no features yet)
    pub fn create_empty_body(&mut self, name: String) -> BodyId {
        self.save_undo();
        self.redo_stack.clear();

        let body_id = uuid::Uuid::new_v4().to_string();

        self.scene.bodies.push(Body {
            id: body_id.clone(),
            name,
            features: vec![],
            visible: true,
            parameters: HashMap::new(),
        });

        self.version += 1;
        body_id
    }

    /// Create a new body with a base primitive
    pub fn create_body_with_primitive(
        &mut self,
        name: String,
        primitive: Primitive,
        transform: Transform,
    ) -> BodyId {
        self.save_undo();
        self.redo_stack.clear();

        let body_id = uuid::Uuid::new_v4().to_string();
        let feature_id = uuid::Uuid::new_v4().to_string();

        self.scene.bodies.push(Body {
            id: body_id.clone(),
            name,
            features: vec![Feature::BasePrimitive {
                id: feature_id,
                primitive,
                transform,
            }],
            visible: true,
            parameters: HashMap::new(),
        });

        self.version += 1;
        body_id
    }

    /// Create a new body from sketch extrusion
    pub fn create_body_with_extrude(
        &mut self,
        name: String,
        sketch: Sketch,
        transform: Transform,
        height: f64,
    ) -> BodyId {
        self.save_undo();
        self.redo_stack.clear();

        let body_id = uuid::Uuid::new_v4().to_string();
        let feature_id = uuid::Uuid::new_v4().to_string();

        self.scene.bodies.push(Body {
            id: body_id.clone(),
            name,
            features: vec![Feature::BaseExtrude {
                id: feature_id,
                sketch,
                sketch_transform: transform,
                height,
                height_backward: 0.0,
                draft_angle: 0.0,
            }],
            visible: true,
            parameters: HashMap::new(),
        });

        self.version += 1;
        body_id
    }

    /// Create a new body from sketch revolution
    pub fn create_body_with_revolve(
        &mut self,
        name: String,
        sketch: Sketch,
        transform: Transform,
        angle: f64,
        segments: u32,
    ) -> BodyId {
        self.save_undo();
        self.redo_stack.clear();

        let body_id = uuid::Uuid::new_v4().to_string();
        let feature_id = uuid::Uuid::new_v4().to_string();

        self.scene.bodies.push(Body {
            id: body_id.clone(),
            name,
            features: vec![Feature::BaseRevolve {
                id: feature_id,
                sketch,
                sketch_transform: transform,
                angle,
                segments,
            }],
            visible: true,
            parameters: HashMap::new(),
        });

        self.version += 1;
        body_id
    }

    /// Create a new body with a sketch (for editing)
    pub fn create_body_with_sketch(
        &mut self,
        name: String,
        sketch: Sketch,
        transform: Transform,
    ) -> BodyId {
        self.save_undo();
        self.redo_stack.clear();

        let body_id = uuid::Uuid::new_v4().to_string();
        let feature_id = uuid::Uuid::new_v4().to_string();

        self.scene.bodies.push(Body {
            id: body_id.clone(),
            name,
            features: vec![Feature::Sketch {
                id: feature_id,
                sketch,
                transform,
            }],
            visible: true,
            parameters: HashMap::new(),
        });

        self.version += 1;
        body_id
    }

    /// Remove a body by ID
    pub fn remove_body(&mut self, body_id: &BodyId) -> Vec<String> {
        if !self.scene.bodies.iter().any(|b| b.id == *body_id) {
            return Vec::new();
        }

        self.save_undo();
        self.redo_stack.clear();

        // Collect IDs of features that will be removed
        let mut removed = vec![body_id.clone()];
        if let Some(body) = self.scene.bodies.iter().find(|b| b.id == *body_id) {
            for feature in &body.features {
                removed.push(feature.id().clone());
            }
        }

        // Remove body operations that reference this body
        self.scene.body_operations.retain(|op| match op {
            BodyOperation::Boolean {
                left_body_id,
                right_body_id,
                ..
            } => left_body_id != body_id && right_body_id != body_id,
        });

        // Remove the body
        self.scene.bodies.retain(|b| b.id != *body_id);

        self.version += 1;
        removed
    }

    /// Rename a body
    pub fn rename_body(&mut self, body_id: &BodyId, new_name: String) -> bool {
        if self.get_body(body_id).is_none() {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.get_body_mut(body_id) {
            body.name = new_name;
            self.version += 1;
            true
        } else {
            false
        }
    }

    /// Toggle body visibility
    pub fn toggle_body_visibility(&mut self, body_id: &BodyId) {
        if let Some(body) = self.get_body_mut(body_id) {
            body.visible = !body.visible;
            self.version += 1;
        }
    }

    /// Set body visibility
    pub fn set_body_visible(&mut self, body_id: &BodyId, visible: bool) {
        if let Some(body) = self.get_body_mut(body_id) {
            if body.visible != visible {
                body.visible = visible;
                self.version += 1;
            }
        }
    }

    /// Perform boolean between bodies
    pub fn boolean_bodies(
        &mut self,
        op: BooleanOp,
        left_body_id: BodyId,
        right_body_id: BodyId,
        result: BooleanResult,
    ) -> Option<BodyId> {
        self.save_undo();
        self.redo_stack.clear();

        let op_id = uuid::Uuid::new_v4().to_string();

        match &result {
            BooleanResult::MergeIntoLeft => {
                if let Some(body) = self.get_body_mut(&left_body_id) {
                    body.features.push(Feature::BooleanModify {
                        id: op_id.clone(),
                        op: op.clone(),
                        tool_body_id: right_body_id.clone(),
                    });
                }
                if let Some(body) = self.get_body_mut(&right_body_id) {
                    body.visible = false;
                }
                self.version += 1;
                Some(left_body_id)
            }
            BooleanResult::MergeIntoRight => {
                if let Some(body) = self.get_body_mut(&right_body_id) {
                    body.features.push(Feature::BooleanModify {
                        id: op_id.clone(),
                        op: op.clone(),
                        tool_body_id: left_body_id.clone(),
                    });
                }
                if let Some(body) = self.get_body_mut(&left_body_id) {
                    body.visible = false;
                }
                self.version += 1;
                Some(right_body_id)
            }
            BooleanResult::CreateNewBody {
                new_body_id,
                new_body_name: _,
            } => {
                self.scene.body_operations.push(BodyOperation::Boolean {
                    id: op_id,
                    op,
                    left_body_id: left_body_id.clone(),
                    right_body_id: right_body_id.clone(),
                    result: result.clone(),
                });

                for body in &mut self.scene.bodies {
                    if body.id == left_body_id || body.id == right_body_id {
                        body.visible = false;
                    }
                }

                self.version += 1;
                Some(new_body_id.clone())
            }
        }
    }

    /// Clear the scene
    pub fn clear(&mut self) {
        self.save_undo();
        self.redo_stack.clear();
        self.scene = SceneDescriptionV2::default();
        self.version += 1;
    }

    /// Set scene from loaded data
    pub fn set_scene(&mut self, scene: SceneDescriptionV2) {
        self.save_undo();
        self.redo_stack.clear();
        self.scene = scene;
        self.version += 1;
    }
}
