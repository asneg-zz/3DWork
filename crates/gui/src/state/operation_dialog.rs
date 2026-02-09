//! Operation dialog state (data only)
//!
//! This module contains only the data structures for the operation dialog.
//! The UI rendering is in ui/operation_dialog.rs in the binary crate.

/// Extrude operation parameters
#[derive(Clone, Debug)]
pub struct ExtrudeParams {
    pub height: f64,
    pub symmetric: bool,
    pub draft_angle: f64,
}

impl Default for ExtrudeParams {
    fn default() -> Self {
        Self {
            height: 1.0,
            symmetric: false,
            draft_angle: 0.0,
        }
    }
}

/// Type of operation being configured
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum OperationType {
    #[default]
    Extrude,
    Cut,
}

/// Dialog state for operation configuration (data only)
#[derive(Default)]
pub struct OperationDialog {
    /// Is the dialog open?
    pub open: bool,
    /// Type of operation being configured
    pub operation_type: OperationType,
    /// Current parameters
    pub params: ExtrudeParams,
    /// Body ID for the operation
    pub body_id: Option<String>,
    /// Sketch ID for the operation
    pub sketch_id: Option<String>,
    /// Is this a cut operation?
    pub is_cut: bool,
    /// Edit mode - if true, update existing feature instead of creating new
    pub edit_mode: bool,
    /// Feature ID to edit (when in edit mode)
    pub feature_id: Option<String>,
}

impl OperationDialog {
    /// Open the dialog for extrude operation
    pub fn open_extrude(&mut self, body_id: String, sketch_id: String) {
        self.open = true;
        self.operation_type = OperationType::Extrude;
        self.body_id = Some(body_id);
        self.sketch_id = Some(sketch_id);
        self.is_cut = false;
        self.edit_mode = false;
        self.feature_id = None;
        self.params = ExtrudeParams::default();
    }

    /// Open the dialog for cut operation
    pub fn open_cut(&mut self, body_id: String, sketch_id: String) {
        self.open = true;
        self.operation_type = OperationType::Cut;
        self.body_id = Some(body_id);
        self.sketch_id = Some(sketch_id);
        self.is_cut = true;
        self.edit_mode = false;
        self.feature_id = None;
        self.params = ExtrudeParams::default();
    }

    /// Open the dialog to edit an existing extrude/cut feature
    pub fn open_edit(
        &mut self,
        body_id: String,
        feature_id: String,
        sketch_id: String,
        is_cut: bool,
        params: ExtrudeParams,
    ) {
        self.open = true;
        self.operation_type = if is_cut { OperationType::Cut } else { OperationType::Extrude };
        self.body_id = Some(body_id);
        self.sketch_id = Some(sketch_id);
        self.is_cut = is_cut;
        self.edit_mode = true;
        self.feature_id = Some(feature_id);
        self.params = params;
    }

    /// Close the dialog
    pub fn close(&mut self) {
        self.open = false;
        self.body_id = None;
        self.sketch_id = None;
        self.edit_mode = false;
        self.feature_id = None;
    }
}
