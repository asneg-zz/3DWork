//! Keyboard shortcut handling

use eframe::egui;

use crate::state::AppState;
use crate::ui::toolbar;
use crate::viewport::ViewportPanel;

/// Handle keyboard shortcuts for the application
pub fn handle_keyboard(
    ctx: &egui::Context,
    state: &mut AppState,
    viewport: &mut ViewportPanel,
) {
    // Don't handle shortcuts when a text field is focused
    if ctx.memory(|m| m.focused().is_some()) {
        return;
    }

    ctx.input(|i| {
        // Ctrl+Z — undo
        if i.modifiers.command && i.key_pressed(egui::Key::Z) && !i.modifiers.shift {
            state.scene.undo();
        }
        // Ctrl+Shift+Z or Ctrl+Y — redo
        if (i.modifiers.command && i.modifiers.shift && i.key_pressed(egui::Key::Z))
            || (i.modifiers.command && i.key_pressed(egui::Key::Y))
        {
            state.scene.redo();
        }
        // Escape — cancel drawing / deselect tool / exit sketch / deselect
        if i.key_pressed(egui::Key::Escape) {
            handle_escape(state);
        }
        // Delete — remove selected bodies
        if i.key_pressed(egui::Key::Delete) {
            handle_delete(state);
        }
        // Ctrl+D — duplicate
        if i.modifiers.command && i.key_pressed(egui::Key::D) {
            toolbar::action_duplicate(state);
        }
        // Ctrl+A — select all
        if i.modifiers.command && i.key_pressed(egui::Key::A) {
            for body in &state.scene.scene.bodies {
                if !state.selection.is_selected(&body.id) {
                    state.selection.toggle(body.id.clone());
                }
            }
        }
        // E — extrude selected sketch
        if i.key_pressed(egui::Key::E) && !i.modifiers.command {
            toolbar::action_extrude(state);
        }
        // F — focus camera on selected object
        if i.key_pressed(egui::Key::F) && !i.modifiers.command {
            if let Some(id) = state.selection.primary() {
                if let Some(center) = viewport.aabb_center(id) {
                    viewport.focus_on(center);
                }
            }
        }
    });
}

fn handle_escape(state: &mut AppState) {
    if state.sketch.is_editing() {
        if !state.sketch.drawing_points.is_empty() {
            // Cancel current drawing operation
            state.sketch.clear_drawing();
        } else if state.sketch.tool != crate::state::sketch::SketchTool::None {
            // Deselect tool
            state.sketch.set_tool(crate::state::sketch::SketchTool::None);
        } else if !state.sketch.element_selection.selected.is_empty()
               || !state.sketch.element_selection.selected_points.is_empty() {
            // Clear element selection
            state.sketch.element_selection.clear();
        }
        // Don't exit sketch mode by Escape - use context menu or "Done" button
    } else {
        state.selection.clear();
    }
}

fn handle_delete(state: &mut AppState) {
    // Note: V2 architecture - sketch element deletion temporarily disabled
    // Delete selected body
    if let Some(id) = state.selection.primary().cloned() {
        state.scene.remove_body(&id);
        state.selection.clear();
    }
}
