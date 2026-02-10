//! Operation dialog state (data only)
//!
//! This module contains only the data structures for the operation dialog.
//! The UI rendering is in ui/operation_dialog.rs in the binary crate.

/// Extrude operation parameters
#[derive(Clone, Debug)]
pub struct ExtrudeParams {
    /// Высота в прямом направлении
    pub height: f64,
    /// Высота в обратном направлении
    pub height_backward: f64,
    pub draft_angle: f64,
}

impl Default for ExtrudeParams {
    fn default() -> Self {
        Self {
            height: 1.0,
            height_backward: 0.0,
            draft_angle: 0.0,
        }
    }
}

/// Axis definition for revolve operation
#[derive(Clone, Debug, PartialEq)]
pub struct RevolveAxis {
    /// Start point in sketch coordinates
    pub start: [f64; 2],
    /// End point in sketch coordinates
    pub end: [f64; 2],
    /// Name for display (e.g., "Line 1", "X=0")
    pub name: String,
    /// Index of construction element (-1 for default X=0 axis)
    pub element_index: i32,
}

impl Default for RevolveAxis {
    fn default() -> Self {
        Self {
            start: [0.0, -10.0],
            end: [0.0, 10.0],
            name: "X=0".to_string(),
            element_index: -1,
        }
    }
}

/// Revolve operation parameters
#[derive(Clone, Debug)]
pub struct RevolveParams {
    /// Угол вращения в градусах (0-360)
    pub angle: f64,
    /// Количество сегментов
    pub segments: u32,
    /// Selected axis for rotation
    pub axis: RevolveAxis,
    /// Available axes (construction lines + default)
    pub available_axes: Vec<RevolveAxis>,
    /// Selected axis index in available_axes
    pub selected_axis_index: usize,
}

impl Default for RevolveParams {
    fn default() -> Self {
        let default_axis = RevolveAxis::default();
        Self {
            angle: 360.0,
            segments: 32,
            axis: default_axis.clone(),
            available_axes: vec![default_axis],
            selected_axis_index: 0,
        }
    }
}

/// Type of operation being configured
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum OperationType {
    #[default]
    Extrude,
    Cut,
    Revolve,
    CutRevolve,
}

/// Dialog state for operation configuration (data only)
#[derive(Default)]
pub struct OperationDialog {
    /// Is the dialog open?
    pub open: bool,
    /// Type of operation being configured
    pub operation_type: OperationType,
    /// Extrude/Cut parameters
    pub params: ExtrudeParams,
    /// Revolve parameters
    pub revolve_params: RevolveParams,
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

    /// Open the dialog for revolve operation
    pub fn open_revolve(&mut self, body_id: String, sketch_id: String) {
        self.open = true;
        self.operation_type = OperationType::Revolve;
        self.body_id = Some(body_id);
        self.sketch_id = Some(sketch_id);
        self.is_cut = false;
        self.edit_mode = false;
        self.feature_id = None;
        self.revolve_params = RevolveParams::default();
    }

    /// Open the dialog for revolve operation with available axes
    /// If designated_axis is Some, auto-select that axis in the dropdown
    pub fn open_revolve_with_axes(&mut self, body_id: String, sketch_id: String, axes: Vec<RevolveAxis>, designated_axis: Option<usize>) {
        self.open = true;
        self.operation_type = OperationType::Revolve;
        self.body_id = Some(body_id);
        self.sketch_id = Some(sketch_id);
        self.is_cut = false;
        self.edit_mode = false;
        self.feature_id = None;

        let default_axis = RevolveAxis::default();
        let mut available = vec![default_axis.clone()];
        available.extend(axes);

        // Find index of designated axis (offset by 1 due to default axis at position 0)
        let selected_index = designated_axis
            .and_then(|idx| available.iter().position(|a| a.element_index == idx as i32))
            .unwrap_or(0);

        self.revolve_params = RevolveParams {
            angle: 360.0,
            segments: 32,
            axis: available.get(selected_index).cloned().unwrap_or_default(),
            available_axes: available,
            selected_axis_index: selected_index,
        };
    }

    /// Open the dialog for cut revolve operation
    pub fn open_cut_revolve(&mut self, body_id: String, sketch_id: String) {
        self.open = true;
        self.operation_type = OperationType::CutRevolve;
        self.body_id = Some(body_id);
        self.sketch_id = Some(sketch_id);
        self.is_cut = true;
        self.edit_mode = false;
        self.feature_id = None;
        self.revolve_params = RevolveParams::default();
    }

    /// Open the dialog for cut revolve operation with available axes
    /// If designated_axis is Some, auto-select that axis in the dropdown
    pub fn open_cut_revolve_with_axes(&mut self, body_id: String, sketch_id: String, axes: Vec<RevolveAxis>, designated_axis: Option<usize>) {
        self.open = true;
        self.operation_type = OperationType::CutRevolve;
        self.body_id = Some(body_id);
        self.sketch_id = Some(sketch_id);
        self.is_cut = true;
        self.edit_mode = false;
        self.feature_id = None;

        let default_axis = RevolveAxis::default();
        let mut available = vec![default_axis.clone()];
        available.extend(axes);

        // Find index of designated axis (offset by 1 due to default axis at position 0)
        let selected_index = designated_axis
            .and_then(|idx| available.iter().position(|a| a.element_index == idx as i32))
            .unwrap_or(0);

        self.revolve_params = RevolveParams {
            angle: 360.0,
            segments: 32,
            axis: available.get(selected_index).cloned().unwrap_or_default(),
            available_axes: available,
            selected_axis_index: selected_index,
        };
    }

    /// Update selected axis
    pub fn select_axis(&mut self, index: usize) {
        if index < self.revolve_params.available_axes.len() {
            self.revolve_params.selected_axis_index = index;
            self.revolve_params.axis = self.revolve_params.available_axes[index].clone();
        }
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
