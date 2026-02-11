//! Scene tree panel - displays bodies and their features
//!
//! Simplified for V2 Body-based architecture.

use egui::Ui;

use crate::helpers::{find_any_sketch, find_last_sketch_feature_id, has_sketch_with_elements};
use crate::i18n::t;
use crate::state::scene::{body_display_name, feature_display_name, feature_icon};
use crate::state::{AppState, ExtrudeParams};

pub fn show(ui: &mut Ui, state: &mut AppState) {
    // Header with body count and Create Body button
    ui.horizontal(|ui| {
        ui.heading(t("tree.scene"));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            // Create Body button
            if ui.small_button("➕").on_hover_text(t("tree.create_body")).clicked() {
                let id = state.scene.create_empty_body(t("tree.new_body").to_string());
                state.selection.select(id);
            }
            let count = state.scene.scene.bodies.len();
            ui.weak(format!("({count})"));
        });
    });
    ui.separator();

    if state.scene.scene.bodies.is_empty() {
        ui.add_space(20.0);
        ui.vertical_centered(|ui| {
            ui.weak(t("tree.no_objects"));
            ui.add_space(4.0);
            if ui.button(t("tree.create_body")).clicked() {
                let id = state.scene.create_empty_body(t("tree.new_body").to_string());
                state.selection.select(id);
            }
        });
        return;
    }

    // Scrollable list of bodies
    egui::ScrollArea::vertical()
        .id_salt("scene_tree_scroll")
        .show(ui, |ui| {
            // Collect body info to avoid borrow conflicts
            // Feature info: (id, name, icon, is_sketch, has_base_sketch, extrude_info)
            // extrude_info: Option<(sketch_id, is_cut, height, height_backward, draft_angle)>
            let bodies: Vec<_> = state
                .scene
                .scene
                .bodies
                .iter()
                .map(|body| {
                    let features: Vec<_> = body
                        .features
                        .iter()
                        .map(|f| {
                            let fid = f.id().clone();
                            let name = feature_display_name(f);
                            let icon = feature_icon(f);
                            let is_sketch = matches!(f, shared::Feature::Sketch { .. });
                            // Check if this is a base feature with editable sketch
                            let has_base_sketch = matches!(
                                f,
                                shared::Feature::BaseExtrude { .. } | shared::Feature::BaseRevolve { .. }
                            );
                            // Collect extrude info for edit operation
                            let extrude_info = if let shared::Feature::Extrude {
                                sketch_id, cut, height, height_backward, draft_angle, ..
                            } = f {
                                Some((sketch_id.clone(), *cut, *height, *height_backward, *draft_angle))
                            } else {
                                None
                            };
                            (fid, name, icon, is_sketch, has_base_sketch, extrude_info)
                        })
                        .collect();
                    (
                        body.id.clone(),
                        body_display_name(body),
                        body.visible,
                        features,
                    )
                })
                .collect();

            // Also collect sketch info for context menu (body_id -> has_elements)
            let sketch_info: std::collections::HashMap<String, bool> = state
                .scene
                .scene
                .bodies
                .iter()
                .filter_map(|body| {
                    // Only include bodies that have any sketch feature
                    find_any_sketch(body).map(|_| {
                        (body.id.clone(), has_sketch_with_elements(body))
                    })
                })
                .collect();

            for (body_id, body_name, visible, features) in &bodies {
                let selected = state.selection.is_selected(body_id);
                let is_hidden = !visible;

                // Build the label color
                let label_color = if is_hidden {
                    egui::Color32::from_rgb(100, 100, 100)
                } else if selected {
                    egui::Color32::from_rgb(100, 200, 255)
                } else {
                    egui::Color32::from_rgb(200, 200, 200)
                };

                // Selection background frame
                let sel_frame = if selected {
                    egui::Frame::NONE
                        .fill(egui::Color32::from_rgba_premultiplied(40, 80, 140, 180))
                        .corner_radius(3.0)
                        .inner_margin(egui::Margin::symmetric(2, 1))
                } else {
                    egui::Frame::NONE
                };

                let response = sel_frame
                    .show(ui, |ui| {
                        let header_resp = egui::CollapsingHeader::new(
                            egui::RichText::new(format!("[B] {}", body_name)).color(label_color),
                        )
                        .id_salt(body_id)
                        .default_open(true)
                        .show(ui, |ui| {
                            // Show features as tree items
                            for (fid, fname, ficon, is_sketch, has_base_sketch, extrude_info) in features.iter() {
                                let feature_label = format!("   {} {}", ficon, fname);

                                let feature_resp = ui.horizontal(|ui| {
                                    ui.add(egui::Label::new(
                                        egui::RichText::new(feature_label)
                                            .color(egui::Color32::from_rgb(180, 180, 180))
                                    ).sense(egui::Sense::click()))
                                }).inner;

                                // Context menu for individual feature
                                feature_resp.context_menu(|ui| {
                                    // Edit option for Sketch features
                                    if *is_sketch {
                                        if ui.button(t("ctx.edit_sketch")).clicked() {
                                            state.sketch.enter_edit_feature(body_id.clone(), fid.clone());
                                            state.selection.select(body_id.clone());
                                            ui.close_menu();
                                        }
                                        ui.separator();
                                    }
                                    // Edit option for base features with sketches
                                    if *has_base_sketch {
                                        if ui.button(t("ctx.edit_sketch")).clicked() {
                                            state.sketch.enter_edit_feature(body_id.clone(), fid.clone());
                                            state.selection.select(body_id.clone());
                                            ui.close_menu();
                                        }
                                        ui.separator();
                                    }
                                    // Edit option for Extrude/Cut features
                                    if let Some((sketch_id, is_cut, height, height_backward, draft_angle)) = extrude_info {
                                        if ui.button(t("ctx.edit_operation")).clicked() {
                                            let params = ExtrudeParams {
                                                height: *height,
                                                height_backward: *height_backward,
                                                draft_angle: *draft_angle,
                                            };
                                            state.operation_dialog.open_edit(
                                                body_id.clone(),
                                                fid.clone(),
                                                sketch_id.clone(),
                                                *is_cut,
                                                params,
                                            );
                                            ui.close_menu();
                                        }
                                        ui.separator();
                                    }

                                    if ui
                                        .button(
                                            egui::RichText::new(t("tree.delete_feature"))
                                                .color(egui::Color32::from_rgb(220, 80, 80)),
                                        )
                                        .clicked()
                                    {
                                        state.scene.remove_feature(body_id, fid);
                                        ui.close_menu();
                                    }
                                });

                                // Show base sketch as child item for BaseExtrude/BaseRevolve
                                if *has_base_sketch {
                                    let sketch_label = format!("      📐 {}", t("tree.base_sketch"));
                                    let sketch_resp = ui.horizontal(|ui| {
                                        ui.add(egui::Label::new(
                                            egui::RichText::new(sketch_label)
                                                .color(egui::Color32::from_rgb(160, 160, 180))
                                        ).sense(egui::Sense::click()))
                                    }).inner;

                                    // Context menu for base sketch
                                    sketch_resp.context_menu(|ui| {
                                        if ui.button(t("ctx.edit_sketch")).clicked() {
                                            state.sketch.enter_edit_feature(body_id.clone(), fid.clone());
                                            state.selection.select(body_id.clone());
                                            ui.close_menu();
                                        }
                                    });
                                }
                            }
                            if features.is_empty() {
                                ui.label(
                                    egui::RichText::new(format!("   {}", t("tree.empty_body")))
                                        .color(egui::Color32::from_rgb(120, 120, 120))
                                );
                            }
                        });
                        header_resp.header_response
                    })
                    .inner;

                // Selection handling
                if response.clicked() {
                    if ui.input(|i| i.modifiers.command) {
                        state.selection.toggle(body_id.clone());
                    } else {
                        state.selection.select(body_id.clone());
                    }
                }

                // Context menu
                response.context_menu(|ui| {
                    // Add features submenu
                    ui.menu_button(t("tree.add_feature"), |ui| {
                        ui.menu_button(t("tree.add_primitive"), |ui| {
                            if ui.button(t("prim.cube")).clicked() {
                                state.scene.add_primitive_to_body(
                                    body_id,
                                    shared::Primitive::Cube { width: 1.0, height: 1.0, depth: 1.0 },
                                    shared::Transform::new(),
                                );
                                ui.close_menu();
                            }
                            if ui.button(t("prim.cylinder")).clicked() {
                                state.scene.add_primitive_to_body(
                                    body_id,
                                    shared::Primitive::Cylinder { radius: 0.5, height: 1.0 },
                                    shared::Transform::new(),
                                );
                                ui.close_menu();
                            }
                            if ui.button(t("prim.sphere")).clicked() {
                                state.scene.add_primitive_to_body(
                                    body_id,
                                    shared::Primitive::Sphere { radius: 0.5 },
                                    shared::Transform::new(),
                                );
                                ui.close_menu();
                            }
                            if ui.button(t("prim.cone")).clicked() {
                                state.scene.add_primitive_to_body(
                                    body_id,
                                    shared::Primitive::Cone { radius: 0.5, height: 1.0 },
                                    shared::Transform::new(),
                                );
                                ui.close_menu();
                            }
                        });

                        ui.menu_button(t("tree.add_sketch"), |ui| {
                            if ui.button("XY").clicked() {
                                let sketch = shared::Sketch {
                                    plane: shared::SketchPlane::Xy,
                                    offset: 0.0,
                                    elements: vec![],
                                    face_normal: None,
                                    construction: vec![],
                                    revolve_axis: None,
                                    constraints: vec![],
                                };
                                if let Some(feature_id) = state.scene.add_sketch_to_body(body_id, sketch, shared::Transform::new()) {
                                    state.sketch.enter_edit_feature(body_id.clone(), feature_id);
                                    state.selection.select(body_id.clone());
                                }
                                ui.close_menu();
                            }
                            if ui.button("XZ").clicked() {
                                let sketch = shared::Sketch {
                                    plane: shared::SketchPlane::Xz,
                                    offset: 0.0,
                                    elements: vec![],
                                    face_normal: None,
                                    construction: vec![],
                                    revolve_axis: None,
                                    constraints: vec![],
                                };
                                if let Some(feature_id) = state.scene.add_sketch_to_body(body_id, sketch, shared::Transform::new()) {
                                    state.sketch.enter_edit_feature(body_id.clone(), feature_id);
                                    state.selection.select(body_id.clone());
                                }
                                ui.close_menu();
                            }
                            if ui.button("YZ").clicked() {
                                let sketch = shared::Sketch {
                                    plane: shared::SketchPlane::Yz,
                                    offset: 0.0,
                                    elements: vec![],
                                    face_normal: None,
                                    construction: vec![],
                                    revolve_axis: None,
                                    constraints: vec![],
                                };
                                if let Some(feature_id) = state.scene.add_sketch_to_body(body_id, sketch, shared::Transform::new()) {
                                    state.sketch.enter_edit_feature(body_id.clone(), feature_id);
                                    state.selection.select(body_id.clone());
                                }
                                ui.close_menu();
                            }
                        });
                    });

                    ui.separator();

                    // Visibility toggle
                    if is_hidden {
                        if ui.button(t("tree.show")).clicked() {
                            state.scene.set_body_visible(body_id, true);
                            ui.close_menu();
                        }
                    } else if ui.button(t("tree.hide")).clicked() {
                        state.scene.set_body_visible(body_id, false);
                        ui.close_menu();
                    }

                    // Sketch operations (Edit, Extrude, Revolve)
                    if let Some(&has_elements) = sketch_info.get(body_id) {
                        ui.separator();

                        // Edit Sketch
                        if ui.button(t("ctx.edit_sketch")).clicked() {
                            // Find the last sketch feature in this body
                            if let Some(body) = state.scene.get_body(body_id) {
                                if let Some(feature_id) = find_last_sketch_feature_id(body) {
                                    state.sketch.enter_edit_feature(body_id.clone(), feature_id);
                                    state.selection.select(body_id.clone());
                                }
                            }
                            ui.close_menu();
                        }

                        // Extrude/Revolve (only if sketch has elements)
                        if has_elements {
                            if ui.button(t("tb.extrude")).clicked() {
                                state.selection.select(body_id.clone());
                                crate::ui::toolbar::action_extrude(state);
                                ui.close_menu();
                            }
                            if ui.button(t("tb.revolve")).clicked() {
                                state.selection.select(body_id.clone());
                                crate::ui::toolbar::action_revolve(state);
                                ui.close_menu();
                            }
                        }
                    }

                    ui.separator();
                    if ui
                        .button(
                            egui::RichText::new(t("tree.delete"))
                                .color(egui::Color32::from_rgb(220, 80, 80)),
                        )
                        .clicked()
                    {
                        state.scene.remove_body(body_id);
                        state.selection.clear();
                        ui.close_menu();
                    }
                });
            }
        });
}

