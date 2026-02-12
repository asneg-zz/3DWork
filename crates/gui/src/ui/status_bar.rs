use egui::Ui;

use crate::i18n::t;
use crate::state::AppState;

pub fn show(ui: &mut Ui, state: &AppState) {
    ui.horizontal(|ui| {
        let body_count = state.scene.scene.bodies.len();
        ui.weak(format!("{}: {body_count}", t("status.bodies")));

        ui.separator();

        if state.sketch.is_editing() {
            use crate::state::sketch::SketchTool;
            let tool = state.sketch.tool;
            let pts = state.sketch.drawing_points.len();
            let hint = match tool {
                SketchTool::None => t("status.select_tool").to_string(),
                SketchTool::Line => match pts {
                    0 => t("hint.line_start").to_string(),
                    _ => t("hint.line_end").to_string(),
                },
                SketchTool::Circle => match pts {
                    0 => t("hint.circle_center").to_string(),
                    _ => t("hint.circle_radius").to_string(),
                },
                SketchTool::Rectangle => match pts {
                    0 => t("hint.rect_corner1").to_string(),
                    _ => t("hint.rect_corner2").to_string(),
                },
                SketchTool::Arc => match pts {
                    0 => t("hint.arc_center").to_string(),
                    1 => t("hint.arc_radius").to_string(),
                    _ => t("hint.arc_end").to_string(),
                },
                SketchTool::Polyline | SketchTool::Spline => {
                    format!("{} ({pts})", t("hint.poly_add"))
                }
                SketchTool::Dimension => match pts {
                    0 => t("hint.dim_from").to_string(),
                    1 => t("hint.dim_to").to_string(),
                    _ => t("hint.dim_pos").to_string(),
                },
                SketchTool::Trim => t("hint.trim").to_string(),
                SketchTool::Fillet => t("hint.fillet").to_string(),
                SketchTool::Offset => t("hint.offset").to_string(),
                SketchTool::Mirror => t("hint.mirror").to_string(),
            };
            let tool_label = match tool {
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
                SketchTool::Mirror => t("tool.mirror"),
            };
            ui.colored_label(
                egui::Color32::YELLOW,
                format!("{} [{}]: {hint}", t("hint.sketch_prefix"), tool_label),
            );
            ui.separator();
            ui.weak(t("hint.esc"));
        } else {
            let sel = state.selection.count();
            if sel > 0 {
                ui.label(format!("{}: {sel}", t("status.selected")));
            } else {
                ui.weak(t("status.ready"));
            }
        }

        if state.chat.is_loading {
            ui.separator();
            ui.colored_label(egui::Color32::from_rgb(255, 200, 100), t("status.ai_thinking"));
        }

        // Right-aligned version
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.weak("vCAD v0.1");
        });
    });
}
