//! CSG mesh cache management

use std::collections::{HashMap, HashSet};

use shared::SceneDescriptionV2;

use super::{build_scene_meshes_v2, mesh_extraction::apply_face_highlight};
use crate::state::selection::FaceSelection;
use crate::viewport::mesh::MeshData;
use crate::viewport::picking::Aabb;

/// Cached CSG mesh data, rebuilt when scene or selection changes
pub struct CsgCache {
    meshes: HashMap<String, MeshData>,
    aabbs: HashMap<String, Aabb>,
    errors: HashMap<String, String>,
    version: u64,
    rebuild_count: u64,
    selected_snapshot: Vec<String>,
    face_selection_version: u64,
}

impl Default for CsgCache {
    fn default() -> Self {
        Self::new()
    }
}

impl CsgCache {
    pub fn new() -> Self {
        Self {
            meshes: HashMap::new(),
            aabbs: HashMap::new(),
            errors: HashMap::new(),
            version: u64::MAX, // force first rebuild
            rebuild_count: 0,
            selected_snapshot: Vec::new(),
            face_selection_version: u64::MAX,
        }
    }

    /// Check if cache is still valid
    pub fn is_valid(
        &self,
        scene_version: u64,
        selected: &[String],
        _hidden: &HashSet<String>,
        face_selection_version: u64,
    ) -> bool {
        self.version == scene_version
            && self.selected_snapshot == selected
            && self.face_selection_version == face_selection_version
    }

    /// Rebuild cached meshes from the V2 scene
    pub fn rebuild(
        &mut self,
        scene: &SceneDescriptionV2,
        selected: &[String],
        _hidden: &HashSet<String>,
        version: u64,
        face_selection: Option<&FaceSelection>,
        face_selection_version: u64,
    ) {
        let (mut meshes, errors) = build_scene_meshes_v2(scene, selected);

        // Apply face highlight color if a face is selected
        if let Some(face) = face_selection {
            if let Some(mesh) = meshes.get_mut(&face.object_id) {
                apply_face_highlight(mesh, &face.triangle_indices);
            }
        }

        self.meshes = meshes;
        self.errors = errors;
        self.aabbs = self
            .meshes
            .iter()
            .map(|(id, mesh)| (id.clone(), Aabb::from_mesh(mesh)))
            .collect();
        self.version = version;
        self.rebuild_count += 1;
        self.selected_snapshot = selected.to_vec();
        self.face_selection_version = face_selection_version;
    }

    /// Clone the cached mesh map (for passing into PaintCallback)
    pub fn meshes_clone(&self) -> HashMap<String, MeshData> {
        self.meshes.clone()
    }

    /// Rebuild counter
    pub fn rebuild_count(&self) -> u64 {
        self.rebuild_count
    }

    /// Get the cached AABBs
    pub fn aabbs(&self) -> &HashMap<String, Aabb> {
        &self.aabbs
    }

    /// Get CSG build errors
    pub fn errors(&self) -> &HashMap<String, String> {
        &self.errors
    }
}
