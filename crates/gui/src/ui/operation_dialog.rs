//! Operation dialog UI rendering
//!
//! Shows a popup dialog for configuring extrusion and revolve parameters.
//! Data structures are in state/operation_dialog.rs.

use crate::i18n::t;
use crate::state::{OperationDialog, OperationType};

/// Extension trait for OperationDialog to add UI rendering
pub trait OperationDialogUi {
    /// Show the dialog UI, returns Some(true) if OK clicked, Some(false) if cancelled
    fn show(&mut self, ctx: &egui::Context) -> Option<bool>;
}

impl OperationDialogUi for OperationDialog {
    fn show(&mut self, ctx: &egui::Context) -> Option<bool> {
        if !self.open {
            return None;
        }

        let mut result = None;
        let title = match self.operation_type {
            OperationType::Extrude => t("dialog.extrude_title"),
            OperationType::Cut => t("dialog.cut_title"),
            OperationType::Revolve => t("dialog.revolve_title"),
            OperationType::CutRevolve => t("dialog.cut_revolve_title"),
        };

        egui::Window::new(title)
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .show(ctx, |ui| {
                ui.set_min_width(280.0);

                match self.operation_type {
                    OperationType::Extrude | OperationType::Cut => {
                        show_extrude_params(ui, self);
                    }
                    OperationType::Revolve | OperationType::CutRevolve => {
                        show_revolve_params(ui, self);
                    }
                }

                ui.add_space(12.0);
                ui.separator();
                ui.add_space(8.0);

                // OK / Cancel buttons
                ui.horizontal(|ui| {
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button(t("dialog.cancel")).clicked() {
                            result = Some(false);
                            self.close();
                        }
                        if ui.button(t("dialog.ok")).clicked() {
                            result = Some(true);
                        }
                    });
                });
            });

        result
    }
}

/// Show extrude/cut parameters
fn show_extrude_params(ui: &mut egui::Ui, dialog: &mut OperationDialog) {
    egui::Grid::new("extrude_params_grid")
        .num_columns(2)
        .spacing([10.0, 8.0])
        .show(ui, |ui| {
            // Height forward
            ui.label(t("dialog.height_forward"));
            let mut height = dialog.params.height as f32;
            ui.add(egui::DragValue::new(&mut height)
                .speed(0.1)
                .range(0.0..=1000.0)
                .suffix(" mm"));
            dialog.params.height = height as f64;
            ui.end_row();

            // Height backward
            ui.label(t("dialog.height_backward"));
            let mut height_back = dialog.params.height_backward as f32;
            ui.add(egui::DragValue::new(&mut height_back)
                .speed(0.1)
                .range(0.0..=1000.0)
                .suffix(" mm"));
            dialog.params.height_backward = height_back as f64;
            ui.end_row();

            // Draft angle
            ui.label(t("dialog.draft_angle"));
            let mut angle = dialog.params.draft_angle as f32;
            ui.add(egui::DragValue::new(&mut angle)
                .speed(0.5)
                .range(-45.0..=45.0)
                .suffix("°"));
            dialog.params.draft_angle = angle as f64;
            ui.end_row();
        });

    // Info about draft angle
    ui.add_space(4.0);
    ui.label(
        egui::RichText::new(t("dialog.draft_hint"))
            .small()
            .color(egui::Color32::from_rgb(140, 140, 150))
    );
}

/// Show revolve parameters
fn show_revolve_params(ui: &mut egui::Ui, dialog: &mut OperationDialog) {
    // Clone data needed for axis selection to avoid borrow issues
    let axes: Vec<(usize, String)> = dialog.revolve_params.available_axes
        .iter()
        .enumerate()
        .map(|(i, a)| (i, a.name.clone()))
        .collect();
    let selected_idx = dialog.revolve_params.selected_axis_index;
    let current_name = dialog.revolve_params.axis.name.clone();

    let mut new_axis_selection: Option<usize> = None;

    egui::Grid::new("revolve_params_grid")
        .num_columns(2)
        .spacing([10.0, 8.0])
        .show(ui, |ui| {
            // Axis selection
            ui.label(t("dialog.axis"));
            egui::ComboBox::from_id_salt("axis_combo")
                .selected_text(&current_name)
                .show_ui(ui, |ui| {
                    for (i, name) in &axes {
                        let is_selected = *i == selected_idx;
                        if ui.selectable_label(is_selected, name).clicked() {
                            new_axis_selection = Some(*i);
                        }
                    }
                });
            ui.end_row();

            // Angle
            ui.label(t("dialog.angle"));
            let mut angle = dialog.revolve_params.angle as f32;
            ui.add(egui::DragValue::new(&mut angle)
                .speed(1.0)
                .range(1.0..=360.0)
                .suffix("°"));
            dialog.revolve_params.angle = angle as f64;
            ui.end_row();

            // Segments
            ui.label(t("dialog.segments"));
            let mut segments = dialog.revolve_params.segments as i32;
            ui.add(egui::DragValue::new(&mut segments)
                .speed(1.0)
                .range(4..=256));
            dialog.revolve_params.segments = segments as u32;
            ui.end_row();
        });

    // Apply axis selection after the grid
    if let Some(idx) = new_axis_selection {
        dialog.select_axis(idx);
    }

    // Info about revolve axis
    ui.add_space(4.0);
    let hint = if axes.len() > 1 {
        t("dialog.revolve_axis_hint_select")
    } else {
        t("dialog.revolve_axis_hint_construction")
    };
    ui.label(
        egui::RichText::new(hint)
            .small()
            .color(egui::Color32::from_rgb(140, 140, 150))
    );
}
