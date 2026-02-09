//! Operation dialog UI rendering
//!
//! Shows a popup dialog for configuring extrusion parameters.
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
        };

        egui::Window::new(title)
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .show(ctx, |ui| {
                ui.set_min_width(280.0);

                egui::Grid::new("extrude_params_grid")
                    .num_columns(2)
                    .spacing([10.0, 8.0])
                    .show(ui, |ui| {
                        // Height
                        ui.label(t("dialog.height"));
                        let mut height = self.params.height as f32;
                        ui.add(egui::DragValue::new(&mut height)
                            .speed(0.1)
                            .range(0.01..=1000.0)
                            .suffix(" mm"));
                        self.params.height = height as f64;
                        ui.end_row();

                        // Direction (symmetric)
                        ui.label(t("dialog.direction"));
                        ui.horizontal(|ui| {
                            ui.selectable_value(&mut self.params.symmetric, false, t("dialog.one_side"));
                            ui.selectable_value(&mut self.params.symmetric, true, t("dialog.both_sides"));
                        });
                        ui.end_row();

                        // Draft angle
                        ui.label(t("dialog.draft_angle"));
                        let mut angle = self.params.draft_angle as f32;
                        ui.add(egui::DragValue::new(&mut angle)
                            .speed(0.5)
                            .range(-45.0..=45.0)
                            .suffix("°"));
                        self.params.draft_angle = angle as f64;
                        ui.end_row();
                    });

                // Info about draft angle
                ui.add_space(4.0);
                ui.label(
                    egui::RichText::new(t("dialog.draft_hint"))
                        .small()
                        .color(egui::Color32::from_rgb(140, 140, 150))
                );

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
