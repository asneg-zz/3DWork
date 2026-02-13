pub mod chamfer3d;
pub mod chat;
pub mod fillet3d;
pub mod operation_dialog;
pub mod scene;
pub mod selection;
pub mod settings;
pub mod sketch;

use std::collections::{HashMap, HashSet};

pub use chamfer3d::Chamfer3DState;
use chat::ChatState;
pub use fillet3d::Fillet3DState;
pub use operation_dialog::{ExtrudeParams, OperationDialog, OperationType};
pub use scene::{body_display_name, feature_display_name, feature_icon, short_id, SceneState};
use selection::SelectionState;
pub use settings::{AppSettings, DimensionSettings, Units};
use sketch::SketchState;

/// Panel visibility flags
pub struct PanelVisibility {
    pub scene_tree: bool,
    pub properties: bool,
    pub parameters: bool,
    pub chat: bool,
}

impl Default for PanelVisibility {
    fn default() -> Self {
        Self {
            scene_tree: true,
            properties: true,
            parameters: false,
            chat: true,
        }
    }
}

/// Combined application state
pub struct AppState {
    pub scene: SceneState,
    pub selection: SelectionState,
    pub sketch: SketchState,
    pub chat: ChatState,
    pub panels: PanelVisibility,
    pub settings: AppSettings,
    /// Object IDs that are hidden from the viewport
    pub hidden: HashSet<String>,
    /// CSG build errors (object ID → error message)
    pub csg_errors: HashMap<String, String>,
    /// Show settings window
    pub show_settings_window: bool,
    /// Operation dialog state
    pub operation_dialog: OperationDialog,
    /// 3D Fillet tool state
    pub fillet3d: Fillet3DState,
    /// 3D Chamfer tool state
    pub chamfer3d: Chamfer3DState,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            scene: SceneState::default(),
            selection: SelectionState::default(),
            sketch: SketchState::default(),
            chat: ChatState::default(),
            panels: PanelVisibility::default(),
            settings: AppSettings::load(),
            hidden: HashSet::new(),
            csg_errors: HashMap::new(),
            show_settings_window: false,
            operation_dialog: OperationDialog::default(),
            fillet3d: Fillet3DState::default(),
            chamfer3d: Chamfer3DState::default(),
        }
    }
}
