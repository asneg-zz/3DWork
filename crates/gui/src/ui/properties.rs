//! Properties panel for selected bodies and features
//!
//! Simplified for V2 Body-based architecture.

use egui::Ui;
use shared::{Body, SketchElement};

use crate::i18n::t;
use crate::state::scene::{body_display_name, feature_display_name};
use crate::state::AppState;
use crate::viewport::sketch_utils;

pub fn show(ui: &mut Ui, state: &mut AppState) {
    ui.heading(t("prop.title"));
    ui.separator();

    // If editing sketch and elements selected, show element properties
    if state.sketch.is_editing() && !state.sketch.element_selection.selected.is_empty() {
        show_sketch_element_properties(ui, state);
        return;
    }

    let selected_id = match state.selection.primary() {
        Some(id) => id.clone(),
        None => {
            ui.add_space(10.0);
            ui.vertical_centered(|ui| {
                ui.weak(t("prop.select_object"));
                ui.weak(t("prop.to_view"));
            });
            return;
        }
    };

    // Find the selected body
    let body = match state.scene.scene.bodies.iter().find(|b| b.id == selected_id) {
        Some(b) => b,
        None => {
            ui.weak(t("prop.not_found"));
            return;
        }
    };

    // Display body properties
    show_body_properties(ui, body);
}

fn show_sketch_element_properties(ui: &mut Ui, state: &mut AppState) {
    let selected = &state.sketch.element_selection.selected;
    let selected_count = selected.len();

    // Get sketch data
    let body_id = state.sketch.editing_body_id().cloned();
    let feature_id = state.sketch.active_feature_id().cloned();

    let sketch_data = if let Some(ref bid) = body_id {
        sketch_utils::find_sketch_data_ex(
            &state.scene.scene,
            bid,
            feature_id.as_deref(),
        )
    } else {
        None
    };

    let sketch = match sketch_data {
        Some((s, _)) => s.clone(),
        None => return,
    };

    if selected_count == 1 {
        let elem_idx = selected[0];
        if let Some(element) = sketch.elements.get(elem_idx) {
            show_single_element_properties(ui, state, element, elem_idx, &body_id, &feature_id);
        }
    } else {
        // Multiple elements selected
        ui.label(format!("{}: {}", t("prop.selected_elements"), selected_count));
        ui.separator();

        for &elem_idx in selected.iter().take(5) {
            if let Some(element) = sketch.elements.get(elem_idx) {
                let type_name = element_type_name(element);
                ui.label(format!("  #{}: {}", elem_idx, type_name));
            }
        }
        if selected_count > 5 {
            ui.weak(format!("  ... {} {}", selected_count - 5, t("prop.more")));
        }
    }
}

fn show_single_element_properties(
    ui: &mut Ui,
    state: &mut AppState,
    element: &SketchElement,
    elem_idx: usize,
    body_id: &Option<String>,
    feature_id: &Option<String>,
) {
    let type_name = element_type_name(element);
    ui.horizontal(|ui| {
        ui.strong(format!("{} #{}", type_name, elem_idx));
    });
    ui.separator();

    match element {
        SketchElement::Line { start, end } => {
            let dx = end.x - start.x;
            let dy = end.y - start.y;
            let length = (dx * dx + dy * dy).sqrt();
            let angle = dy.atan2(dx).to_degrees();

            egui::CollapsingHeader::new(t("prop.geometry"))
                .id_salt("line_geometry")
                .default_open(true)
                .show(ui, |ui| {
                    egui::Grid::new("line_props")
                        .num_columns(2)
                        .spacing([8.0, 4.0])
                        .show(ui, |ui| {
                            ui.label(format!("{}:", t("prop.start")));
                            ui.label(format!("({:.3}, {:.3})", start.x, start.y));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.end")));
                            ui.label(format!("({:.3}, {:.3})", end.x, end.y));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.length")));
                            ui.label(format!("{:.4}", length));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.angle")));
                            ui.label(format!("{:.2}°", angle));
                            ui.end_row();
                        });
                });
        }
        SketchElement::Circle { center, radius } => {
            let circumference = 2.0 * std::f64::consts::PI * radius;
            let area = std::f64::consts::PI * radius * radius;

            egui::CollapsingHeader::new(t("prop.geometry"))
                .id_salt("circle_geometry")
                .default_open(true)
                .show(ui, |ui| {
                    egui::Grid::new("circle_props")
                        .num_columns(2)
                        .spacing([8.0, 4.0])
                        .show(ui, |ui| {
                            ui.label(format!("{}:", t("prop.center")));
                            ui.label(format!("({:.3}, {:.3})", center.x, center.y));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.radius")));
                            ui.label(format!("{:.4}", radius));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.diameter")));
                            ui.label(format!("{:.4}", radius * 2.0));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.circumference")));
                            ui.label(format!("{:.4}", circumference));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.area")));
                            ui.label(format!("{:.4}", area));
                            ui.end_row();
                        });
                });
        }
        SketchElement::Arc { center, radius, start_angle, end_angle } => {
            let mut angle_span = end_angle - start_angle;
            if angle_span < 0.0 {
                angle_span += std::f64::consts::TAU;
            }
            let arc_length = radius * angle_span;

            egui::CollapsingHeader::new(t("prop.geometry"))
                .id_salt("arc_geometry")
                .default_open(true)
                .show(ui, |ui| {
                    egui::Grid::new("arc_props")
                        .num_columns(2)
                        .spacing([8.0, 4.0])
                        .show(ui, |ui| {
                            ui.label(format!("{}:", t("prop.center")));
                            ui.label(format!("({:.3}, {:.3})", center.x, center.y));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.radius")));
                            ui.label(format!("{:.4}", radius));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.start_angle")));
                            ui.label(format!("{:.2}°", start_angle.to_degrees()));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.end_angle")));
                            ui.label(format!("{:.2}°", end_angle.to_degrees()));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.arc_length")));
                            ui.label(format!("{:.4}", arc_length));
                            ui.end_row();
                        });
                });
        }
        SketchElement::Rectangle { corner, width, height } => {
            let area = width * height;
            let perimeter = 2.0 * (width + height);

            egui::CollapsingHeader::new(t("prop.geometry"))
                .id_salt("rect_geometry")
                .default_open(true)
                .show(ui, |ui| {
                    egui::Grid::new("rect_props")
                        .num_columns(2)
                        .spacing([8.0, 4.0])
                        .show(ui, |ui| {
                            ui.label(format!("{}:", t("prop.corner")));
                            ui.label(format!("({:.3}, {:.3})", corner.x, corner.y));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.width")));
                            ui.label(format!("{:.4}", width));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.height")));
                            ui.label(format!("{:.4}", height));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.perimeter")));
                            ui.label(format!("{:.4}", perimeter));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.area")));
                            ui.label(format!("{:.4}", area));
                            ui.end_row();
                        });
                });
        }
        SketchElement::Polyline { points } => {
            let mut total_length = 0.0;
            for i in 0..points.len().saturating_sub(1) {
                let dx = points[i + 1].x - points[i].x;
                let dy = points[i + 1].y - points[i].y;
                total_length += (dx * dx + dy * dy).sqrt();
            }

            egui::CollapsingHeader::new(t("prop.geometry"))
                .id_salt("polyline_geometry")
                .default_open(true)
                .show(ui, |ui| {
                    egui::Grid::new("polyline_props")
                        .num_columns(2)
                        .spacing([8.0, 4.0])
                        .show(ui, |ui| {
                            ui.label(format!("{}:", t("prop.points")));
                            ui.label(format!("{}", points.len()));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.length")));
                            ui.label(format!("{:.4}", total_length));
                            ui.end_row();
                        });
                });
        }
        SketchElement::Spline { points } => {
            egui::CollapsingHeader::new(t("prop.geometry"))
                .id_salt("spline_geometry")
                .default_open(true)
                .show(ui, |ui| {
                    egui::Grid::new("spline_props")
                        .num_columns(2)
                        .spacing([8.0, 4.0])
                        .show(ui, |ui| {
                            ui.label(format!("{}:", t("prop.control_points")));
                            ui.label(format!("{}", points.len()));
                            ui.end_row();
                        });
                });
        }
        SketchElement::Dimension { from, to, value } => {
            egui::CollapsingHeader::new(t("prop.geometry"))
                .id_salt("dimension_geometry")
                .default_open(true)
                .show(ui, |ui| {
                    egui::Grid::new("dimension_props")
                        .num_columns(2)
                        .spacing([8.0, 4.0])
                        .show(ui, |ui| {
                            ui.label(format!("{}:", t("prop.from")));
                            ui.label(format!("({:.3}, {:.3})", from.x, from.y));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.to")));
                            ui.label(format!("({:.3}, {:.3})", to.x, to.y));
                            ui.end_row();

                            ui.label(format!("{}:", t("prop.value")));
                            ui.label(format!("{:.4}", value));
                            ui.end_row();
                        });
                });
        }
    }

    // Show constraints for this element
    // Collect constraint info (index, label) to avoid borrow issues
    let constraints_info: Vec<(usize, String)> = if let Some(ref bid) = body_id {
        sketch_utils::find_sketch_data_ex(
            &state.scene.scene,
            bid,
            feature_id.as_deref(),
        )
        .map(|(sketch, _)| {
            sketch.constraints.iter().enumerate()
                .filter(|(_, c)| constraint_involves_element(c, elem_idx))
                .map(|(idx, c)| (idx, constraint_display_name(c)))
                .collect()
        })
        .unwrap_or_default()
    } else {
        vec![]
    };

    if !constraints_info.is_empty() {
        ui.add_space(8.0);
        egui::CollapsingHeader::new(t("constraints.title"))
            .id_salt("element_constraints")
            .default_open(true)
            .show(ui, |ui| {
                let mut to_remove: Option<usize> = None;
                for (idx, label) in &constraints_info {
                    let response = ui.add(egui::Label::new(format!("  {}", label)).sense(egui::Sense::click()));
                    response.context_menu(|ui| {
                        if ui.button(t("tree.delete")).clicked() {
                            to_remove = Some(*idx);
                            ui.close_menu();
                        }
                    });
                }
                if let Some(idx) = to_remove {
                    if let Some(ref bid) = body_id {
                        state.scene.remove_sketch_constraint(
                            bid,
                            feature_id.as_deref(),
                            idx,
                        );
                    }
                }
            });
    }
}

fn element_type_name(element: &SketchElement) -> &'static str {
    match element {
        SketchElement::Line { .. } => "Line",
        SketchElement::Circle { .. } => "Circle",
        SketchElement::Arc { .. } => "Arc",
        SketchElement::Rectangle { .. } => "Rectangle",
        SketchElement::Polyline { .. } => "Polyline",
        SketchElement::Spline { .. } => "Spline",
        SketchElement::Dimension { .. } => "Dimension",
    }
}

fn constraint_involves_element(constraint: &shared::SketchConstraint, elem_idx: usize) -> bool {
    match constraint {
        shared::SketchConstraint::Horizontal { element } => *element == elem_idx,
        shared::SketchConstraint::Vertical { element } => *element == elem_idx,
        shared::SketchConstraint::Parallel { element1, element2 } => {
            *element1 == elem_idx || *element2 == elem_idx
        }
        shared::SketchConstraint::Perpendicular { element1, element2 } => {
            *element1 == elem_idx || *element2 == elem_idx
        }
        shared::SketchConstraint::Coincident { point1, point2 } => {
            point1.element_index == elem_idx || point2.element_index == elem_idx
        }
        shared::SketchConstraint::Fixed { element } => *element == elem_idx,
        shared::SketchConstraint::Equal { element1, element2 } => {
            *element1 == elem_idx || *element2 == elem_idx
        }
        shared::SketchConstraint::Tangent { element1, element2 } => {
            *element1 == elem_idx || *element2 == elem_idx
        }
        shared::SketchConstraint::Concentric { element1, element2 } => {
            *element1 == elem_idx || *element2 == elem_idx
        }
        shared::SketchConstraint::Symmetric { element1, element2, axis } => {
            *element1 == elem_idx || *element2 == elem_idx || *axis == elem_idx
        }
    }
}

fn constraint_display_name(constraint: &shared::SketchConstraint) -> String {
    let icon = constraint_icon(constraint);
    let name = match constraint {
        shared::SketchConstraint::Horizontal { .. } => t("constraint.horizontal"),
        shared::SketchConstraint::Vertical { .. } => t("constraint.vertical"),
        shared::SketchConstraint::Parallel { .. } => t("constraint.parallel"),
        shared::SketchConstraint::Perpendicular { .. } => t("constraint.perpendicular"),
        shared::SketchConstraint::Coincident { .. } => t("constraint.coincident"),
        shared::SketchConstraint::Fixed { .. } => t("constraint.fixed"),
        shared::SketchConstraint::Equal { .. } => t("constraint.equal"),
        shared::SketchConstraint::Tangent { .. } => t("constraint.tangent"),
        shared::SketchConstraint::Concentric { .. } => t("constraint.concentric"),
        shared::SketchConstraint::Symmetric { .. } => t("constraint.symmetric"),
    };
    format!("{} {}", icon, name)
}

fn constraint_icon(constraint: &shared::SketchConstraint) -> &'static str {
    match constraint {
        shared::SketchConstraint::Horizontal { .. } => "H",
        shared::SketchConstraint::Vertical { .. } => "V",
        shared::SketchConstraint::Parallel { .. } => "//",
        shared::SketchConstraint::Perpendicular { .. } => "T",
        shared::SketchConstraint::Coincident { .. } => "C",
        shared::SketchConstraint::Fixed { .. } => "F",
        shared::SketchConstraint::Equal { .. } => "=",
        shared::SketchConstraint::Tangent { .. } => "TG",
        shared::SketchConstraint::Concentric { .. } => "O",
        shared::SketchConstraint::Symmetric { .. } => "S",
    }
}

fn show_body_properties(ui: &mut Ui, body: &Body) {
    let name = body_display_name(body);

    ui.horizontal(|ui| {
        ui.strong("[B]");
        ui.strong(&name);
    });
    ui.add_space(4.0);

    // Body info section
    egui::CollapsingHeader::new(t("prop.body_info"))
        .id_salt("body_info")
        .default_open(true)
        .show(ui, |ui| {
            egui::Grid::new("body_props")
                .num_columns(2)
                .spacing([8.0, 4.0])
                .show(ui, |ui| {
                    ui.label("ID:");
                    ui.monospace(short_id(&body.id));
                    ui.end_row();

                    ui.label(format!("{}:", t("prop.visible")));
                    ui.label(if body.visible { "Yes" } else { "No" });
                    ui.end_row();

                    ui.label(format!("{}:", t("prop.features")));
                    ui.label(format!("{}", body.features.len()));
                    ui.end_row();
                });
        });

    // Features section
    if !body.features.is_empty() {
        ui.add_space(8.0);
        egui::CollapsingHeader::new(t("prop.features"))
            .id_salt("body_features")
            .default_open(true)
            .show(ui, |ui| {
                for feature in &body.features {
                    let name = feature_display_name(feature);
                    let icon = crate::state::scene::feature_icon(feature);
                    ui.horizontal(|ui| {
                        ui.label(format!("{} {}", icon, name));
                    });
                }
            });
    }
}

fn short_id(id: &str) -> &str {
    if id.len() > 8 {
        &id[..8]
    } else {
        id
    }
}
