//! Scene state management
//!
//! This module provides scene state with bodies, features, and undo/redo history.

mod body_ops;
mod display;
mod feature_ops;
mod history;
mod persistence;
mod sketch_ops;
mod transform_ops;

pub use display::{body_display_name, feature_display_name, feature_icon, short_id};

use shared::{Body, BodyId, Feature, ObjectId, SceneDescriptionV2};

/// Scene state with bodies and undo/redo history
#[derive(Default)]
pub struct SceneState {
    /// Current scene with bodies
    pub scene: SceneDescriptionV2,
    /// Undo stack - previous states
    pub(crate) undo_stack: Vec<SceneDescriptionV2>,
    /// Redo stack - undone states
    pub(crate) redo_stack: Vec<SceneDescriptionV2>,
    /// Monotonically increasing version counter for cache invalidation
    pub(crate) version: u64,
}

impl SceneState {
    /// Current scene version (increments on every mutation)
    pub fn version(&self) -> u64 {
        self.version
    }

    /// Get a body by ID
    pub fn get_body(&self, body_id: &BodyId) -> Option<&Body> {
        self.scene.bodies.iter().find(|b| b.id == *body_id)
    }

    /// Get mutable body by ID
    pub fn get_body_mut(&mut self, body_id: &BodyId) -> Option<&mut Body> {
        self.scene.bodies.iter_mut().find(|b| b.id == *body_id)
    }

    /// Get a feature from a body
    pub fn get_feature(&self, body_id: &BodyId, feature_id: &ObjectId) -> Option<&Feature> {
        self.get_body(body_id)?
            .features
            .iter()
            .find(|f| f.id() == feature_id)
    }

    /// Get mutable feature from a body
    pub fn get_feature_mut(
        &mut self,
        body_id: &BodyId,
        feature_id: &ObjectId,
    ) -> Option<&mut Feature> {
        self.get_body_mut(body_id)?
            .features
            .iter_mut()
            .find(|f| f.id() == feature_id)
    }

    /// Bump version without saving undo
    pub fn notify_mutated(&mut self) {
        self.version += 1;
    }

    /// Save current state to undo stack
    pub(crate) fn save_undo(&mut self) {
        self.undo_stack.push(self.scene.clone());
        if self.undo_stack.len() > 100 {
            self.undo_stack.remove(0);
        }
    }
}
