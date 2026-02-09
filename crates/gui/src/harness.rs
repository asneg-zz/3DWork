//! Headless test harness for programmatic scene manipulation (V2 Body-based).
//!
//! Provides a test harness for the V2 body-based architecture.

use std::collections::{HashMap, HashSet};

use shared::{Primitive, SceneDescriptionV2, Transform};

use crate::build::{build_scene_meshes_v2, CsgCache};
use crate::state::scene::SceneState;
use crate::state::selection::SelectionState;
use crate::state::sketch::SketchState;
use crate::validation::MeshValidator;
use crate::viewport::mesh::MeshData;

/// Headless test harness — manages scene, selection, sketch, and build cache
#[allow(dead_code)]
pub struct TestHarness {
    pub scene: SceneState,
    pub selection: SelectionState,
    pub sketch: SketchState,
    pub hidden: HashSet<String>,
    cache: CsgCache,
    last_meshes: HashMap<String, MeshData>,
    last_errors: HashMap<String, String>,
}

impl TestHarness {
    /// Create a new empty harness.
    pub fn new() -> Self {
        Self {
            scene: SceneState::default(),
            selection: SelectionState::default(),
            sketch: SketchState::default(),
            hidden: HashSet::new(),
            cache: CsgCache::new(),
            last_meshes: HashMap::new(),
            last_errors: HashMap::new(),
        }
    }

    // ── Scene manipulation ────────────────────────────────────

    /// Create a body with a primitive and return body ID
    pub fn create_body_with_primitive(
        &mut self,
        name: &str,
        primitive: Primitive,
    ) -> String {
        self.scene.create_body_with_primitive(
            name.to_string(),
            primitive,
            Transform::new(),
        )
    }

    /// Create a cube body and return its ID
    pub fn create_cube(&mut self, name: &str, w: f64, h: f64, d: f64) -> String {
        self.create_body_with_primitive(
            name,
            Primitive::Cube {
                width: w,
                height: h,
                depth: d,
            },
        )
    }

    /// Create a cylinder body and return its ID
    pub fn create_cylinder(&mut self, name: &str, r: f64, h: f64) -> String {
        self.create_body_with_primitive(
            name,
            Primitive::Cylinder { radius: r, height: h },
        )
    }

    /// Create a sphere body and return its ID
    pub fn create_sphere(&mut self, name: &str, r: f64) -> String {
        self.create_body_with_primitive(
            name,
            Primitive::Sphere { radius: r },
        )
    }

    /// Create a cone body and return its ID
    pub fn create_cone(&mut self, name: &str, r: f64, h: f64) -> String {
        self.create_body_with_primitive(
            name,
            Primitive::Cone { radius: r, height: h },
        )
    }

    /// Load a scene (replaces current)
    pub fn load_scene(&mut self, scene: SceneDescriptionV2) {
        self.scene.set_scene(scene);
        self.selection.clear();
        self.sketch.exit_edit();
        self.hidden.clear();
    }

    /// Load a scene from JSON string
    pub fn load_scene_json(&mut self, json: &str) -> Result<(), String> {
        let scene: SceneDescriptionV2 =
            serde_json::from_str(json).map_err(|e| format!("JSON parse error: {e}"))?;
        self.load_scene(scene);
        Ok(())
    }

    /// Export the current scene as JSON
    pub fn export_scene_json(&self) -> String {
        serde_json::to_string_pretty(&self.scene.scene).unwrap_or_default()
    }

    /// Delete a body by ID
    pub fn delete_body(&mut self, body_id: &str) -> Vec<String> {
        self.scene.remove_body(&body_id.to_string())
    }

    /// Delete a body by ID (alias for backward compatibility)
    pub fn delete(&mut self, id: &str) -> Vec<String> {
        self.delete_body(id)
    }

    /// Undo the last operation
    pub fn undo(&mut self) -> bool {
        if self.scene.can_undo() {
            self.scene.undo();
            true
        } else {
            false
        }
    }

    /// Redo the last undone operation
    pub fn redo(&mut self) -> bool {
        if self.scene.can_redo() {
            self.scene.redo();
            true
        } else {
            false
        }
    }

    /// Clear the entire scene
    pub fn clear(&mut self) {
        self.scene.clear();
        self.selection.clear();
        self.sketch.exit_edit();
        self.hidden.clear();
        self.last_meshes.clear();
        self.last_errors.clear();
    }

    // ── Selection ─────────────────────────────────────────────

    /// Select a body
    pub fn select_body(&mut self, body_id: &str) {
        self.selection.select_body(body_id.to_string());
    }

    /// Clear selection
    pub fn clear_selection(&mut self) {
        self.selection.clear();
    }

    // ── Visibility ────────────────────────────────────────────

    /// Hide a body
    pub fn hide(&mut self, body_id: &str) {
        self.scene.set_body_visible(&body_id.to_string(), false);
    }

    /// Show a body
    pub fn show(&mut self, body_id: &str) {
        self.scene.set_body_visible(&body_id.to_string(), true);
    }

    // ── Build + inspection ────────────────────────────────────

    /// Build meshes from the current scene
    pub fn build(&mut self) {
        let selected = self.selection.all();
        let (meshes, errors) = build_scene_meshes_v2(&self.scene.scene, &selected);
        self.last_meshes = meshes;
        self.last_errors = errors;
    }

    /// Number of bodies in the scene
    pub fn body_count(&self) -> usize {
        self.scene.scene.bodies.len()
    }

    /// Number of bodies (alias for backward compatibility)
    pub fn operation_count(&self) -> usize {
        self.body_count()
    }

    /// Number of visible bodies
    pub fn visible_body_count(&self) -> usize {
        self.scene.scene.bodies.iter().filter(|b| b.visible).count()
    }

    /// Number of meshes after build
    pub fn visible_mesh_count(&self) -> usize {
        self.last_meshes.len()
    }

    /// Get mesh data for a body ID
    pub fn mesh_of(&self, body_id: &str) -> Option<&MeshData> {
        self.last_meshes.get(body_id)
    }

    /// Create a validator for a body's mesh
    pub fn validate_mesh(&self, body_id: &str) -> Option<MeshValidator> {
        self.last_meshes.get(body_id).map(MeshValidator::new)
    }

    /// Get build errors
    pub fn errors(&self) -> &HashMap<String, String> {
        &self.last_errors
    }
}

impl Default for TestHarness {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_harness_empty() {
        let h = TestHarness::new();
        assert_eq!(h.body_count(), 0);
    }

    #[test]
    fn test_create_cube() {
        let mut h = TestHarness::new();
        let id = h.create_cube("Cube", 1.0, 1.0, 1.0);
        assert!(!id.is_empty());
        assert_eq!(h.body_count(), 1);
    }

    #[test]
    fn test_create_primitives() {
        let mut h = TestHarness::new();
        h.create_cube("Cube", 1.0, 1.0, 1.0);
        h.create_cylinder("Cylinder", 0.5, 2.0);
        h.create_sphere("Sphere", 0.5);
        h.create_cone("Cone", 0.5, 1.0);
        assert_eq!(h.body_count(), 4);
    }

    #[test]
    fn test_undo_redo_cycle() {
        let mut h = TestHarness::new();
        h.create_cube("Cube", 1.0, 1.0, 1.0);
        assert_eq!(h.body_count(), 1);
        assert!(h.undo());
        assert_eq!(h.body_count(), 0);
        assert!(h.redo());
        assert_eq!(h.body_count(), 1);
    }

    #[test]
    fn test_load_export_json() {
        let mut h = TestHarness::new();
        h.create_cube("Cube", 1.0, 1.0, 1.0);
        let json = h.export_scene_json();

        let mut h2 = TestHarness::new();
        h2.load_scene_json(&json).unwrap();
        assert_eq!(h2.body_count(), 1);
    }

    #[test]
    fn test_clear_resets_everything() {
        let mut h = TestHarness::new();
        h.create_cube("Cube", 1.0, 1.0, 1.0);
        h.clear();
        assert_eq!(h.body_count(), 0);
    }

    #[test]
    fn test_build_and_mesh() {
        let mut h = TestHarness::new();
        let id = h.create_cube("c1", 1.0, 1.0, 1.0);
        h.build();
        assert_eq!(h.visible_mesh_count(), 1);
        assert!(h.mesh_of(&id).is_some());
    }

    #[test]
    fn test_hide_show() {
        let mut h = TestHarness::new();
        let id = h.create_cube("c1", 1.0, 1.0, 1.0);

        h.build();
        assert!(h.mesh_of(&id).is_some());

        h.hide(&id);
        h.build();
        assert!(h.mesh_of(&id).is_none());

        h.show(&id);
        h.build();
        assert!(h.mesh_of(&id).is_some());
    }

    #[test]
    fn test_validate_mesh() {
        let mut h = TestHarness::new();
        let id = h.create_cube("c1", 1.0, 1.0, 1.0);
        h.build();

        let v = h.validate_mesh(&id).unwrap();
        assert!(v.vertex_count() > 0);
        assert!(v.triangle_count() > 0);
    }
}
