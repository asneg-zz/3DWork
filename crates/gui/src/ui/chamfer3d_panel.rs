//! 3D Chamfer tool panel UI

use egui::Ui;

use crate::i18n::t;
use crate::state::AppState;

/// Show chamfer3d panel when chamfer tool is active
pub fn show(ui: &mut Ui, state: &mut AppState) {
    if !state.chamfer3d.is_active() {
        return;
    }

    ui.horizontal(|ui| {
        ui.label(t("chamfer3d.title"));
        ui.separator();

        // Distance input
        ui.label(t("chamfer3d.distance"));
        let mut distance = state.chamfer3d.distance as f32;
        if ui.add(egui::DragValue::new(&mut distance)
            .range(0.01..=100.0)
            .speed(0.1)
            .suffix(" mm"))
            .changed()
        {
            state.chamfer3d.distance = distance as f64;
        }

        ui.separator();

        // Selected edges count
        let edge_count = state.selection.edge_count();
        ui.label(format!("{} {}", t("chamfer3d.selected_edges"), edge_count));

        ui.separator();

        // Apply button (enabled when edges are selected)
        let can_apply = edge_count > 0;
        if ui.add_enabled(can_apply, egui::Button::new(t("chamfer3d.apply"))).clicked() {
            apply_chamfer(state);
        }

        // Cancel button
        if ui.button(t("chamfer3d.cancel")).clicked() {
            cancel_chamfer(state);
        }
    });

    // Hint
    ui.weak(t("chamfer3d.hint"));
}

/// Apply chamfer to selected edges
fn apply_chamfer(state: &mut AppState) {
    let distance = state.chamfer3d.distance;
    let edges = state.selection.selected_edges.clone();
    let body_id = state.chamfer3d.body_id.clone();

    if edges.is_empty() {
        tracing::warn!("Chamfer3D: no edges selected");
        return;
    }

    let Some(body_id) = body_id else {
        tracing::warn!("Chamfer3D: no body selected");
        return;
    };

    tracing::info!(
        "Chamfer3D: applying chamfer with distance={}, edges={}",
        distance, edges.len()
    );

    // Add Chamfer feature to body
    state.scene.add_chamfer_to_body(&body_id, edges, distance);

    // Deactivate chamfer tool
    cancel_chamfer(state);
}

/// Cancel chamfer operation
fn cancel_chamfer(state: &mut AppState) {
    state.chamfer3d.deactivate();
    state.selection.clear_edges();
}
