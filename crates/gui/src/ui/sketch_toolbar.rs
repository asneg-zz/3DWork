use egui::Ui;

use crate::i18n::t;
use crate::state::sketch::SketchTool;
use crate::state::AppState;

pub fn show(ui: &mut Ui, state: &mut AppState) {
    ui.horizontal(|ui| {
        ui.label(t("stb.sketch"));

        // Drawing tools
        let drawing_tools = [
            SketchTool::None,
            SketchTool::Line,
            SketchTool::Circle,
            SketchTool::Arc,
            SketchTool::Rectangle,
            SketchTool::Polyline,
            SketchTool::Spline,
            SketchTool::Dimension,
        ];

        for tool in drawing_tools {
            let active = state.sketch.tool == tool;
            let label = tool_translated_label(tool);
            if ui.selectable_label(active, label).clicked() {
                state.sketch.set_tool(tool);
            }
        }

        ui.separator();

        // Modification tools
        let mod_tools = [
            SketchTool::Trim,
            SketchTool::Fillet,
            SketchTool::Offset,
        ];

        for tool in mod_tools {
            let active = state.sketch.tool == tool;
            let label = tool_translated_label(tool);
            if ui.selectable_label(active, label).clicked() {
                state.sketch.set_tool(tool);
            }
        }

        // Tool-specific settings
        match state.sketch.tool {
            SketchTool::Fillet => {
                ui.separator();
                ui.label(t("tool.radius"));
                ui.add(
                    egui::DragValue::new(&mut state.sketch.fillet_radius)
                        .speed(0.01)
                        .range(0.01..=10.0)
                        .suffix(" mm"),
                );
            }
            SketchTool::Offset => {
                ui.separator();
                ui.label(t("tool.distance"));
                ui.add(
                    egui::DragValue::new(&mut state.sketch.offset_distance)
                        .speed(0.01)
                        .range(0.01..=10.0)
                        .suffix(" mm"),
                );
            }
            _ => {}
        }

        ui.separator();

        // Snap settings
        show_snap_settings(ui, state);

        ui.separator();

        if ui.button(t("stb.done")).clicked() {
            state.sketch.exit_edit();
        }
    });
}

fn show_snap_settings(ui: &mut Ui, state: &mut AppState) {
    let snap = &mut state.sketch.snap;

    // Main toggle
    ui.checkbox(&mut snap.enabled, t("snap.enabled"));

    if snap.enabled {
        ui.separator();

        // Individual snap type toggles (compact format)
        ui.checkbox(&mut snap.endpoint, t("snap.endpoint"));
        ui.checkbox(&mut snap.midpoint, t("snap.midpoint"));
        ui.checkbox(&mut snap.center, t("snap.center"));
        ui.checkbox(&mut snap.quadrant, t("snap.quadrant"));
        ui.checkbox(&mut snap.grid, t("snap.grid"));
    }
}

fn tool_translated_label(tool: SketchTool) -> &'static str {
    match tool {
        SketchTool::None => t("tool.select"),
        SketchTool::Line => t("tool.line"),
        SketchTool::Circle => t("tool.circle"),
        SketchTool::Arc => t("tool.arc"),
        SketchTool::Rectangle => t("tool.rectangle"),
        SketchTool::Polyline => t("tool.polyline"),
        SketchTool::Spline => t("tool.spline"),
        SketchTool::Dimension => t("tool.dimension"),
        SketchTool::Trim => t("tool.trim"),
        SketchTool::Fillet => t("tool.fillet"),
        SketchTool::Offset => t("tool.offset"),
    }
}
