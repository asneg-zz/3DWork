use egui::Ui;

use crate::i18n::t;
use crate::state::sketch::{PatternType, SketchTool};
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
            SketchTool::Mirror,
            SketchTool::Pattern,
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
            SketchTool::Pattern => {
                ui.separator();
                show_pattern_settings(ui, state);
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
        SketchTool::Mirror => t("tool.mirror"),
        SketchTool::Pattern => t("tool.pattern"),
    }
}

fn show_pattern_settings(ui: &mut Ui, state: &mut AppState) {
    let params = &mut state.sketch.pattern_params;

    // Pattern type selector
    ui.label(t("pattern.type"));
    egui::ComboBox::from_id_salt("pattern_type")
        .selected_text(match params.pattern_type {
            PatternType::Linear => t("pattern.linear"),
            PatternType::Circular => t("pattern.circular"),
        })
        .show_ui(ui, |ui| {
            ui.selectable_value(&mut params.pattern_type, PatternType::Linear, t("pattern.linear"));
            ui.selectable_value(&mut params.pattern_type, PatternType::Circular, t("pattern.circular"));
        });

    ui.separator();

    // Count
    ui.label(t("pattern.count"));
    ui.add(
        egui::DragValue::new(&mut params.count)
            .speed(0.1)
            .range(2..=50),
    );

    match params.pattern_type {
        PatternType::Linear => {
            // Spacing
            ui.label(t("pattern.spacing"));
            ui.add(
                egui::DragValue::new(&mut params.spacing)
                    .speed(0.01)
                    .range(0.01..=100.0)
                    .suffix(" mm"),
            );

            // Direction angle
            ui.label(t("pattern.direction"));
            let mut dir_deg = params.direction.to_degrees();
            if ui.add(
                egui::DragValue::new(&mut dir_deg)
                    .speed(1.0)
                    .range(-180.0..=180.0)
                    .suffix("°"),
            ).changed() {
                params.direction = dir_deg.to_radians();
            }
        }
        PatternType::Circular => {
            // Total angle
            ui.label(t("pattern.total_angle"));
            ui.add(
                egui::DragValue::new(&mut params.total_angle)
                    .speed(1.0)
                    .range(1.0..=360.0)
                    .suffix("°"),
            );

            // Center point info
            if params.center.is_some() {
                ui.weak(t("pattern.center"));
            } else {
                ui.colored_label(egui::Color32::YELLOW, t("pattern.select_center"));
            }
        }
    }

    ui.separator();

    // Apply button
    let can_apply = !state.sketch.element_selection.selected.is_empty()
        && (params.pattern_type == PatternType::Linear || params.center.is_some());

    if ui.add_enabled(can_apply, egui::Button::new(t("pattern.apply"))).clicked() {
        apply_pattern(state);
    }
}

/// Apply pattern to selected elements
fn apply_pattern(state: &mut AppState) {
    use crate::sketch::pattern::{linear_pattern, circular_pattern};

    let body_id = match state.sketch.editing_body_id() {
        Some(id) => id.clone(),
        None => return,
    };
    let feature_id = state.sketch.active_feature_id().cloned();

    // Get selected element indices
    let selected_indices = state.sketch.element_selection.selected.clone();
    if selected_indices.is_empty() {
        return;
    }

    // Get the sketch to read elements
    let sketch = match crate::viewport::sketch_utils::find_sketch_data_ex(
        &state.scene.scene,
        &body_id,
        feature_id.as_deref(),
    ) {
        Some((sketch, _)) => sketch.clone(),
        None => return,
    };

    let params = &state.sketch.pattern_params;

    // Generate new elements for each selected element
    let mut new_elements = Vec::new();

    for &idx in &selected_indices {
        if let Some(element) = sketch.elements.get(idx) {
            let copies = match params.pattern_type {
                PatternType::Linear => {
                    linear_pattern(element, params.count, params.spacing, params.direction)
                }
                PatternType::Circular => {
                    if let Some(center) = params.center {
                        circular_pattern(element, params.count, params.total_angle, center)
                    } else {
                        continue;
                    }
                }
            };
            new_elements.extend(copies);
        }
    }

    // Add new elements to sketch
    for elem in new_elements {
        state.scene.add_element_to_body_sketch_ex(&body_id, feature_id.as_deref(), elem);
    }

    // Clear selection after applying
    state.sketch.element_selection.clear();
}
