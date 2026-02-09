//! Viewport context menu handling

use std::collections::HashMap;

use egui::Ui;

use crate::build::CsgCache;
use crate::i18n::t;
use crate::state::AppState;
use crate::ui::toolbar;
use mesh::MeshData;
pub use vcad_gui_lib::viewport::mesh;

use super::picking::{calculate_face_centroid, face_to_sketch_plane};

/// Context menu actions that need to be applied after the menu closes
pub struct ContextMenuActions {
    pub focus_request: Option<glam::Vec3>,
    pub duplicate_request: bool,
    /// (body_id, plane, offset, centroid, face_normal)
    pub sketch_on_face_request: Option<(String, shared::SketchPlane, f64, glam::Vec3, [f32; 3])>,
}

impl Default for ContextMenuActions {
    fn default() -> Self {
        Self {
            focus_request: None,
            duplicate_request: false,
            sketch_on_face_request: None,
        }
    }
}

/// Show context menu for an object
pub fn show_context_menu(
    ui: &mut Ui,
    state: &mut AppState,
    obj_id: &str,
    ctx_center: Option<glam::Vec3>,
    csg_cache: &CsgCache,
) -> ContextMenuActions {
    let mut actions = ContextMenuActions::default();
    let obj_id_string = obj_id.to_string();

    // Body name header
    if let Some(body) = state.scene.get_body(&obj_id_string) {
        ui.label(
            egui::RichText::new(crate::state::scene::body_display_name(body)).strong(),
        );
    }
    ui.separator();

    // Focus camera
    if ui.button(t("ctx.focus")).clicked() {
        if let Some(center) = ctx_center {
            actions.focus_request = Some(center);
        }
        ui.close_menu();
    }

    // Hide/Show toggle
    let is_hidden = state
        .scene
        .get_body(&obj_id_string)
        .map(|b| !b.visible)
        .unwrap_or(false);
    if is_hidden {
        if ui.button(t("ctx.show")).clicked() {
            state.scene.set_body_visible(&obj_id_string, true);
            ui.close_menu();
        }
    } else if ui.button(t("ctx.hide")).clicked() {
        state.scene.set_body_visible(&obj_id_string, false);
        ui.close_menu();
    }

    // Duplicate
    if ui.button(t("ctx.duplicate")).clicked() {
        state.selection.select(obj_id.to_string());
        actions.duplicate_request = true;
        ui.close_menu();
    }

    // Edit Sketch (if body has Sketch feature)
    show_sketch_menu_items(ui, state, obj_id);

    // Create sketch on face (if face is selected on this object)
    show_sketch_on_face_item(ui, state, obj_id, csg_cache, &mut actions);

    // Delete
    ui.separator();
    if ui
        .button(egui::RichText::new(t("ctx.delete")).color(egui::Color32::from_rgb(220, 80, 80)))
        .clicked()
    {
        state.scene.remove_body(&obj_id_string);
        state.selection.clear();
        state.sketch.exit_edit();
        ui.close_menu();
    }

    actions
}

fn show_sketch_menu_items(ui: &mut Ui, state: &mut AppState, obj_id: &str) {
    let obj_id_string = obj_id.to_string();
    let sketch_info = state.scene.get_body(&obj_id_string).and_then(|b| {
        b.features.iter().find_map(|f| {
            if let shared::Feature::Sketch { sketch, .. } = f {
                Some(!sketch.elements.is_empty())
            } else {
                None
            }
        })
    });
    let has_sketch = sketch_info.is_some();
    let has_sketch_elements = sketch_info.unwrap_or(false);

    if has_sketch {
        if ui.button(t("ctx.edit_sketch")).clicked() {
            state.sketch.enter_edit(obj_id.to_string());
            state.selection.select(obj_id.to_string());
            ui.close_menu();
        }
        // Extrude/Revolve (only if sketch has elements)
        if has_sketch_elements {
            if ui.button(t("tb.extrude")).clicked() {
                state.selection.select(obj_id.to_string());
                toolbar::action_extrude(state);
                ui.close_menu();
            }
            if ui.button(t("tb.revolve")).clicked() {
                state.selection.select(obj_id.to_string());
                toolbar::action_revolve(state);
                ui.close_menu();
            }
        }
    }
}

fn show_sketch_on_face_item(
    ui: &mut Ui,
    state: &AppState,
    obj_id: &str,
    csg_cache: &CsgCache,
    actions: &mut ContextMenuActions,
) {
    if let Some(ref face) = state.selection.selected_face {
        if &face.object_id == obj_id && ui.button(t("ctx.sketch_on_face")).clicked() {
            // Calculate plane and offset from face
            let meshes: HashMap<String, MeshData> = csg_cache.meshes_clone();
            if let Some(mesh) = meshes.get(&face.object_id) {
                let centroid = calculate_face_centroid(mesh, &face.triangle_indices);
                let (plane, offset) = face_to_sketch_plane(face.normal, centroid);
                // Save the face normal for correct cut direction
                actions.sketch_on_face_request =
                    Some((obj_id.to_string(), plane, offset, centroid, face.normal));
            }
            ui.close_menu();
        }
    }
}
