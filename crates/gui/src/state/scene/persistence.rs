//! Autosave/load functionality

use shared::SceneDescriptionV2;

use super::SceneState;

impl SceneState {
    /// Get autosave file path
    fn autosave_path() -> Option<std::path::PathBuf> {
        directories::ProjectDirs::from("com", "vcad", "vcad")
            .map(|dirs| dirs.data_dir().join("autosave_v2.json"))
    }

    /// Save scene to autosave file
    pub fn autosave(&self) {
        if let Some(path) = Self::autosave_path() {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(json) = serde_json::to_string_pretty(&self.scene) {
                let _ = std::fs::write(&path, json);
            }
        }
    }

    /// Load scene from autosave file
    pub fn load_autosave() -> Option<SceneDescriptionV2> {
        let path = Self::autosave_path()?;
        let json = std::fs::read_to_string(&path).ok()?;
        serde_json::from_str(&json).ok()
    }

    /// Check if autosave file exists
    pub fn has_autosave() -> bool {
        Self::autosave_path()
            .map(|p| p.exists())
            .unwrap_or(false)
    }
}
