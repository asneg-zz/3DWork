//! 3D Fillet tool panel UI

use egui::Ui;

use crate::i18n::t;
use crate::state::AppState;

/// Show fillet3d panel when fillet tool is active
pub fn show(ui: &mut Ui, state: &mut AppState) {
    if !state.fillet3d.is_active() {
        return;
    }

    ui.horizontal(|ui| {
        ui.label(t("fillet3d.title"));
        ui.separator();

        // Radius input
        ui.label(t("fillet3d.radius"));
        let mut radius = state.fillet3d.radius as f32;
        if ui.add(egui::DragValue::new(&mut radius)
            .range(0.01..=100.0)
            .speed(0.1)
            .suffix(" mm"))
            .changed()
        {
            state.fillet3d.radius = radius as f64;
        }

        ui.separator();

        // Segments input
        ui.label(t("fillet3d.segments"));
        let mut segments = state.fillet3d.segments as i32;
        if ui.add(egui::DragValue::new(&mut segments)
            .range(3..=32)
            .speed(1.0))
            .changed()
        {
            state.fillet3d.segments = segments as u32;
        }

        ui.separator();

        // Selected edges count
        let edge_count = state.selection.edge_count();
        ui.label(format!("{} {}", t("fillet3d.selected_edges"), edge_count));

        ui.separator();

        // Apply button (enabled when edges are selected)
        let can_apply = edge_count > 0;
        if ui.add_enabled(can_apply, egui::Button::new(t("fillet3d.apply"))).clicked() {
            apply_fillet(state);
        }

        // Cancel button
        if ui.button(t("fillet3d.cancel")).clicked() {
            cancel_fillet(state);
        }
    });

    // Hint
    ui.weak(t("fillet3d.hint"));
}

/// Apply fillet to selected edges
fn apply_fillet(state: &mut AppState) {
    let radius = state.fillet3d.radius;
    let segments = state.fillet3d.segments;
    let edges = state.selection.selected_edges.clone();
    let body_id = state.fillet3d.body_id.clone();

    if edges.is_empty() {
        tracing::warn!("Fillet3D: no edges selected");
        return;
    }

    let Some(body_id) = body_id else {
        tracing::warn!("Fillet3D: no body selected");
        return;
    };

    tracing::info!(
        "Fillet3D: applying fillet with radius={}, segments={}, edges={}",
        radius, segments, edges.len()
    );

    // TODO: Create fillet geometry and apply CSG
    // For now, just log the operation
    for (i, edge) in edges.iter().enumerate() {
        tracing::info!(
            "  Edge {}: {:?} -> {:?}, length={}",
            i, edge.start, edge.end, edge.length()
        );
    }

    // Add Fillet feature to body
    state.scene.add_fillet_to_body(&body_id, edges, radius, segments);

    // Deactivate fillet tool
    cancel_fillet(state);
}

/// Cancel fillet operation
fn cancel_fillet(state: &mut AppState) {
    state.fillet3d.deactivate();
    state.selection.clear_edges();
}
