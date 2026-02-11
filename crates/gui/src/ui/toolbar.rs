//! Toolbar actions and UI
//!
//! Simplified for V2 Body-based architecture.

use egui::Ui;
use shared::{BooleanOp, BooleanResult, Primitive, Sketch, SketchPlane, Transform};

use crate::helpers::{
    can_perform_cut, can_perform_extrude, find_body_with_base, get_selected_body_context,
    has_base_geometry,
};
use crate::i18n::t;
use crate::state::AppState;

// ── Public actions (callable from menus too) ─────────────────

pub fn action_create_cube(state: &mut AppState) {
    create_primitive_body(state, "Cube", Primitive::Cube { width: 1.0, height: 1.0, depth: 1.0 });
}

pub fn action_create_cylinder(state: &mut AppState) {
    create_primitive_body(state, "Cylinder", Primitive::Cylinder { radius: 0.5, height: 1.0 });
}

pub fn action_create_sphere(state: &mut AppState) {
    create_primitive_body(state, "Sphere", Primitive::Sphere { radius: 0.5 });
}

pub fn action_create_cone(state: &mut AppState) {
    create_primitive_body(state, "Cone", Primitive::Cone { radius: 0.5, height: 1.0 });
}

pub fn action_create_sketch_xy(state: &mut AppState) {
    create_sketch_body(state, "Sketch XY", SketchPlane::Xy);
}

pub fn action_create_sketch_xz(state: &mut AppState) {
    create_sketch_body(state, "Sketch XZ", SketchPlane::Xz);
}

pub fn action_create_sketch_yz(state: &mut AppState) {
    create_sketch_body(state, "Sketch YZ", SketchPlane::Yz);
}

pub fn action_extrude(state: &mut AppState) {
    let ctx = match get_selected_body_context(state) {
        Ok(ctx) => ctx,
        Err(msg) => {
            tracing::warn!("Extrude: {}", msg);
            return;
        }
    };

    let Some((sketch_id, _sketch, _transform)) = ctx.last_sketch else {
        tracing::warn!("Extrude: selected body has no sketch with elements");
        return;
    };

    // Open dialog for extrude parameters
    state.operation_dialog.open_extrude(ctx.body_id.clone(), sketch_id);
}

/// Apply extrude operation with parameters from dialog
pub fn apply_extrude(state: &mut AppState) {
    let Some(body_id) = state.operation_dialog.body_id.clone() else { return };
    let Some(sketch_id) = state.operation_dialog.sketch_id.clone() else { return };
    let params = &state.operation_dialog.params;

    // Check if body has base geometry
    let has_base = state.scene.get_body(&body_id)
        .map(|b| has_base_geometry(b))
        .unwrap_or(false);

    if has_base {
        // Body has base + sketch: add Extrude feature (boss extrude)
        state.scene.add_extrude_to_body_ex(
            &body_id,
            &sketch_id,
            params.height,
            params.height_backward,
            false, // not a cut
            params.draft_angle,
        );
        tracing::info!("Added extrude feature to body {}", body_id);
    } else {
        // Body has only sketch (no base): convert Sketch to BaseExtrude
        state.scene.convert_sketch_to_base_extrude(&body_id, &sketch_id, params.height);
        tracing::info!("Converted sketch to base extrude in body {}", body_id);
    }

    state.sketch.exit_edit();
    state.operation_dialog.close();
}

pub fn action_revolve(state: &mut AppState) {
    let ctx = match get_selected_body_context(state) {
        Ok(ctx) => ctx,
        Err(msg) => {
            tracing::warn!("Revolve: {}", msg);
            return;
        }
    };

    let Some((sketch_id, sketch, _transform)) = ctx.last_sketch else {
        tracing::warn!("Revolve: selected body has no sketch with elements");
        return;
    };

    // Find construction lines that can be used as axes
    let axes = crate::helpers::find_construction_axes(&sketch);

    // Open dialog for revolve parameters with available axes
    // Pass designated revolve_axis from sketch (if set)
    state.operation_dialog.open_revolve_with_axes(ctx.body_id.clone(), sketch_id, axes, sketch.revolve_axis);
}

pub fn action_cut_revolve(state: &mut AppState) {
    let ctx = match get_selected_body_context(state) {
        Ok(ctx) => ctx,
        Err(msg) => {
            tracing::warn!("Cut Revolve: {}", msg);
            return;
        }
    };

    let Some((sketch_id, sketch, _transform)) = ctx.last_sketch else {
        tracing::warn!("Cut Revolve: selected body has no sketch with elements");
        return;
    };

    if !ctx.has_base {
        tracing::warn!("Cut Revolve: body has no base geometry to cut from");
        return;
    }

    // Find construction lines that can be used as axes
    let axes = crate::helpers::find_construction_axes(&sketch);

    // Open dialog for cut revolve parameters with available axes
    // Pass designated revolve_axis from sketch (if set)
    state.operation_dialog.open_cut_revolve_with_axes(ctx.body_id.clone(), sketch_id, axes, sketch.revolve_axis);
}

/// Apply revolve operation with parameters from dialog
pub fn apply_revolve(state: &mut AppState) {
    let Some(body_id) = state.operation_dialog.body_id.clone() else { return };
    let Some(sketch_id) = state.operation_dialog.sketch_id.clone() else { return };
    let params = &state.operation_dialog.revolve_params;
    let is_cut = state.operation_dialog.is_cut;

    // Get axis from params (None for default X=0 axis)
    let axis = if params.axis.element_index >= 0 {
        Some((params.axis.start, params.axis.end))
    } else {
        None
    };

    // Check if body has base geometry
    let has_base = state.scene.get_body(&body_id)
        .map(|b| has_base_geometry(b))
        .unwrap_or(false);

    if has_base {
        // Body has base + sketch: add Revolve feature with axis
        state.scene.add_revolve_to_body_with_axis(
            &body_id,
            &sketch_id,
            params.angle,
            params.segments,
            is_cut,
            axis,
        );
        tracing::info!("Added {} revolve feature to body {} with axis {:?}",
            if is_cut { "cut" } else { "boss" }, body_id, axis);
    } else if !is_cut {
        // Body has only sketch (no base): convert Sketch to BaseRevolve
        // TODO: BaseRevolve doesn't support custom axis yet
        state.scene.convert_sketch_to_base_revolve(&body_id, &sketch_id, params.angle, params.segments);
        tracing::info!("Converted sketch to base revolve in body {}", body_id);
    } else {
        tracing::warn!("Cannot cut revolve from body without base geometry");
    }

    state.sketch.exit_edit();
    state.operation_dialog.close();
}

pub fn action_cut(state: &mut AppState) {
    let ctx = match get_selected_body_context(state) {
        Ok(ctx) => ctx,
        Err(msg) => {
            tracing::warn!("Cut: {}", msg);
            return;
        }
    };

    let Some((sketch_id, _sketch, _transform)) = ctx.last_sketch else {
        tracing::warn!("Cut: selected body has no sketch with elements");
        return;
    };

    if !ctx.has_base {
        // Sketch-only body: need to find a target body
        if find_body_with_base(state, &ctx.body_id).is_none() {
            tracing::warn!("Cut: no body with base geometry found");
            return;
        }
    }

    // Open dialog for cut parameters
    state.operation_dialog.open_cut(ctx.body_id.clone(), sketch_id);
}

/// Apply cut operation with parameters from dialog
pub fn apply_cut(state: &mut AppState) {
    let Some(body_id) = state.operation_dialog.body_id.clone() else { return };
    let Some(sketch_id) = state.operation_dialog.sketch_id.clone() else { return };
    let params = &state.operation_dialog.params;

    // Check if body has base geometry
    let has_base = state.scene.get_body(&body_id)
        .map(|b| has_base_geometry(b))
        .unwrap_or(false);

    if has_base {
        // Normal case: body has both base and sketch
        state.scene.add_extrude_to_body_ex(
            &body_id,
            &sketch_id,
            params.height,
            params.height_backward,
            true, // this is a cut
            params.draft_angle,
        );
        tracing::info!("Added cut feature to body {}", body_id);
    } else {
        // Sketch-only body: find a body with base geometry to apply cut to
        // Get sketch data before mutable operations
        let sketch_data = state.scene.get_body(&body_id).and_then(|body| {
            body.features.iter().find_map(|f| {
                if let shared::Feature::Sketch { id, sketch, transform } = f {
                    if id == &sketch_id {
                        return Some((sketch.clone(), transform.clone()));
                    }
                }
                None
            })
        });

        if let Some((sketch, transform)) = sketch_data {
            if let Some(target) = find_body_with_base(state, &body_id) {
                let target_id = target.id.clone();
                if let Some(new_sketch_id) = state.scene.add_sketch_to_body(
                    &target_id,
                    sketch,
                    transform,
                ) {
                    state.scene.add_extrude_to_body_ex(
                        &target_id,
                        &new_sketch_id,
                        params.height,
                        params.height_backward,
                        true, // this is a cut
                        params.draft_angle,
                    );
                    state.scene.set_body_visible(&body_id, false);
                    state.selection.select(target_id);
                }
            }
        }
    }

    state.sketch.exit_edit();
    state.operation_dialog.close();
}

// ── Toolbar UI ───────────────────────────────────────────────

pub fn show(ui: &mut Ui, state: &mut AppState) {
    ui.horizontal(|ui| {
        // ── Primitives dropdown ──
        ui.menu_button(t("tb.primitives"), |ui| {
            if ui.button(t("prim.cube")).on_hover_text(t("tip.cube")).clicked() {
                action_create_cube(state);
                ui.close_menu();
            }
            if ui.button(t("prim.cylinder")).on_hover_text(t("tip.cylinder")).clicked() {
                action_create_cylinder(state);
                ui.close_menu();
            }
            if ui.button(t("prim.sphere")).on_hover_text(t("tip.sphere")).clicked() {
                action_create_sphere(state);
                ui.close_menu();
            }
            if ui.button(t("prim.cone")).on_hover_text(t("tip.cone")).clicked() {
                action_create_cone(state);
                ui.close_menu();
            }
        });

        // ── Features dropdown ──
        let can_extrude = can_perform_extrude(state);
        let can_cut = can_perform_cut(state);

        ui.menu_button(t("tb.features"), |ui| {
            if ui
                .add_enabled(can_extrude, egui::Button::new(t("tb.extrude")))
                .on_hover_text(t("tip.extrude"))
                .clicked()
            {
                action_extrude(state);
                ui.close_menu();
            }
            if ui
                .add_enabled(can_extrude, egui::Button::new(t("tb.revolve")))
                .on_hover_text(t("tip.revolve"))
                .clicked()
            {
                action_revolve(state);
                ui.close_menu();
            }

            ui.separator();

            if ui
                .add_enabled(can_cut, egui::Button::new(t("tb.cut")))
                .on_hover_text(t("tip.cut"))
                .clicked()
            {
                action_cut(state);
                ui.close_menu();
            }
            if ui
                .add_enabled(can_cut, egui::Button::new(t("tb.cut_revolve")))
                .on_hover_text(t("tip.cut_revolve"))
                .clicked()
            {
                action_cut_revolve(state);
                ui.close_menu();
            }
        });

        // ── Boolean dropdown ──
        let has_two = state.selection.count() >= 2;

        ui.menu_button(t("tb.boolean"), |ui| {
            if ui
                .add_enabled(has_two, egui::Button::new(t("tb.union")))
                .on_hover_text(t("tip.union"))
                .clicked()
            {
                do_boolean(state, BooleanOp::Union);
                ui.close_menu();
            }
            if ui
                .add_enabled(has_two, egui::Button::new(t("tb.diff")))
                .on_hover_text(t("tip.diff"))
                .clicked()
            {
                do_boolean(state, BooleanOp::Difference);
                ui.close_menu();
            }
            if ui
                .add_enabled(has_two, egui::Button::new(t("tb.intersect")))
                .on_hover_text(t("tip.intersect"))
                .clicked()
            {
                do_boolean(state, BooleanOp::Intersection);
                ui.close_menu();
            }
        });

        ui.separator();

        // ── History buttons ──
        if ui
            .add_enabled(state.scene.can_undo(), egui::Button::new(t("tb.undo")))
            .on_hover_text(t("tip.undo"))
            .clicked()
        {
            state.scene.undo();
        }
        if ui
            .add_enabled(state.scene.can_redo(), egui::Button::new(t("tb.redo")))
            .on_hover_text(t("tip.redo"))
            .clicked()
        {
            state.scene.redo();
        }

        ui.separator();

        if ui.button(t("tb.clear_all")).on_hover_text(t("tip.clear_all")).clicked() {
            state.scene.clear();
            state.selection.clear();
            state.sketch.exit_edit();
        }
    });
}

// ── Helpers ──────────────────────────────────────────────────

fn create_primitive_body(state: &mut AppState, name: &str, primitive: Primitive) {
    let id = state.scene.create_body_with_primitive(
        name.to_string(),
        primitive,
        Transform::new(),
    );
    state.selection.select(id);
}

fn create_sketch_body(state: &mut AppState, name: &str, plane: SketchPlane) {
    // If a body is selected, add sketch to it; otherwise create new body
    if let Some(selected_id) = state.selection.primary().cloned() {
        if state.scene.get_body(&selected_id).is_some() {
            // Add sketch to existing body (not on face, so no face_normal)
            let sketch = Sketch {
                plane: plane.clone(),
                offset: 0.0,
                elements: vec![],
                face_normal: None,
                construction: vec![],
                revolve_axis: None,
                constraints: vec![],
            };
            if let Some(feature_id) = state.scene.add_sketch_to_body(
                &selected_id,
                sketch,
                Transform::new(),
            ) {
                state.sketch.enter_edit_feature(selected_id, feature_id);
                tracing::info!("Added sketch to existing body");
                return;
            }
        }
    }

    // No body selected or body not found - create new body with sketch
    let sketch = Sketch {
        plane,
        offset: 0.0,
        elements: vec![],
        face_normal: None,
        construction: vec![],
        revolve_axis: None,
        constraints: vec![],
    };
    let body_id = state.scene.create_body_with_sketch(
        name.to_string(),
        sketch,
        Transform::new(),
    );

    state.selection.select(body_id.clone());
    state.sketch.enter_edit(body_id);
}

fn do_boolean(state: &mut AppState, op: BooleanOp) {
    let selected = state.selection.all();
    if selected.len() >= 2 {
        let left = selected[0].clone();
        let right = selected[1].clone();

        // Use MergeIntoLeft as default for now
        let result = BooleanResult::MergeIntoLeft;

        if let Some(id) = state.scene.boolean_bodies(op, left, right, result) {
            state.selection.select(id);
        }
    }
}

pub fn action_duplicate(state: &mut AppState) {
    let selected_id = match state.selection.primary() {
        Some(id) => id.clone(),
        None => return,
    };

    // Find the body and duplicate it
    let body = match state.scene.get_body(&selected_id) {
        Some(b) => b.clone(),
        None => return,
    };

    // Create a new body with the same features
    if let Some(feature) = body.features.first() {
        match feature {
            shared::Feature::BasePrimitive { primitive, transform, .. } => {
                // Offset the duplicate slightly
                let mut new_transform = transform.clone();
                new_transform.position[0] += 0.5;
                let new_id = state.scene.create_body_with_primitive(
                    format!("{} Copy", body.name),
                    primitive.clone(),
                    new_transform,
                );
                state.selection.select(new_id);
            }
            _ => {
                // Other feature types need more complex duplication
                tracing::info!("Duplicate for this body type needs implementation");
            }
        }
    }
}
