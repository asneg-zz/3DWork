//! Parameters panel for parametric modeling
//!
//! Allows users to create, edit, and manage parameters with formulas

use egui::{TextEdit, Ui};
use shared::{Parameter, ParameterValue};

use crate::i18n::t;
use crate::state::AppState;

pub fn show(ui: &mut Ui, state: &mut AppState) {
    ui.heading(t("params.title"));
    ui.separator();

    let selected_id = match state.selection.primary() {
        Some(id) => id.clone(),
        None => {
            ui.add_space(10.0);
            ui.vertical_centered(|ui| {
                ui.weak(t("params.select_body"));
            });
            return;
        }
    };

    // Find the selected body
    let body_idx = state.scene.scene.bodies.iter().position(|b| b.id == selected_id);
    let body_idx = match body_idx {
        Some(idx) => idx,
        None => {
            ui.weak(t("params.body_not_found"));
            return;
        }
    };

    // Display parameters panel
    show_parameters_panel(ui, state, body_idx);
}

fn show_parameters_panel(ui: &mut Ui, state: &mut AppState, body_idx: usize) {
    // Button to add new parameter
    if ui.button(format!("➕ {}", t("params.add_parameter"))).clicked() {
        add_new_parameter(state, body_idx);
    }

    ui.separator();

    // Get body (need mutable access)
    let body = &mut state.scene.scene.bodies[body_idx];

    // Collect parameter names to avoid borrow checker issues
    let param_names: Vec<String> = body.parameters.keys().cloned().collect();

    if param_names.is_empty() {
        ui.add_space(10.0);
        ui.vertical_centered(|ui| {
            ui.weak(t("params.no_parameters"));
        });
        return;
    }

    // Display each parameter
    let mut params_to_remove = Vec::new();
    let mut params_to_update: Vec<(String, Parameter)> = Vec::new();
    let mut params_to_rename: Vec<(String, String)> = Vec::new(); // (old_name, new_name)

    for param_name in &param_names {
        if let Some(param) = body.parameters.get(param_name) {
            ui.group(|ui| {
                ui.horizontal(|ui| {
                    ui.label("📊");

                    // Editable parameter name
                    let mut new_name = param_name.clone();
                    let name_response = ui.add(
                        TextEdit::singleline(&mut new_name)
                            .desired_width(120.0)
                            .font(egui::TextStyle::Body)
                    );

                    // Check if name changed and is valid
                    if name_response.lost_focus() && new_name != *param_name {
                        // Validate: not empty, no duplicates
                        let is_valid = !new_name.is_empty()
                            && !new_name.contains(' ')
                            && !body.parameters.contains_key(&new_name);
                        if is_valid {
                            params_to_rename.push((param_name.clone(), new_name));
                        }
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        // Delete button
                        if ui.small_button("🗑").clicked() {
                            params_to_remove.push(param_name.clone());
                        }
                    });
                });

                ui.separator();

                // Show parameter details
                let mut updated_param = param.clone();
                let mut changed = false;

                let is_formula = matches!(&param.value, ParameterValue::Formula { .. });

                // Always show the computed value first
                ui.horizontal(|ui| {
                    ui.label(t("params.value"));
                    match body.evaluate_parameter(param_name) {
                        Ok(val) => {
                            if is_formula {
                                // Read-only for formula
                                ui.strong(format!("{:.6}", val));
                            } else {
                                // Editable for number
                                let mut new_value = val;
                                let response = ui.add(
                                    egui::DragValue::new(&mut new_value)
                                        .speed(0.1)
                                        .range(f64::NEG_INFINITY..=f64::INFINITY)
                                );
                                if response.changed() {
                                    updated_param.value = ParameterValue::Number { value: new_value };
                                    changed = true;
                                }
                            }
                        }
                        Err(e) => {
                            ui.colored_label(egui::Color32::RED, format!("Err: {}", e));
                        }
                    }
                });

                // Formula toggle and input
                ui.horizontal(|ui| {
                    let mut use_formula = is_formula;
                    if ui.checkbox(&mut use_formula, t("params.formula")).changed() {
                        if use_formula {
                            // Switch to Formula mode
                            if let ParameterValue::Number { value } = &param.value {
                                updated_param.value = ParameterValue::Formula {
                                    expression: format!("{}", value)
                                };
                                changed = true;
                            }
                        } else {
                            // Switch to Number mode
                            let evaluated = body.evaluate_parameter(param_name).unwrap_or(0.0);
                            updated_param.value = ParameterValue::Number { value: evaluated };
                            changed = true;
                        }
                    }

                    // Show formula input if in formula mode
                    if let ParameterValue::Formula { expression } = &param.value {
                        let mut expr_str = expression.clone();
                        if ui.add(TextEdit::singleline(&mut expr_str).desired_width(150.0)).changed() {
                            updated_param.value = ParameterValue::Formula { expression: expr_str };
                            changed = true;
                        }
                    }
                });

                if let ParameterValue::Reference { .. } = &param.value {
                    ui.label(t("params.reference_not_supported"));
                }

                // Unit
                ui.horizontal(|ui| {
                    ui.label(t("params.unit"));
                    let mut unit_str = param.unit.clone().unwrap_or_default();
                    if ui.add(TextEdit::singleline(&mut unit_str).desired_width(60.0)).changed() {
                        updated_param.unit = if unit_str.is_empty() { None } else { Some(unit_str) };
                        changed = true;
                    }
                });

                // Description
                if let Some(desc) = &param.description {
                    ui.horizontal(|ui| {
                        ui.label(t("params.description"));
                        ui.weak(desc);
                    });
                }

                if changed {
                    params_to_update.push((param_name.clone(), updated_param));
                }
            });

            ui.add_space(5.0);
        }
    }

    // Apply removals, renames, and updates
    let needs_undo = !params_to_remove.is_empty() || !params_to_update.is_empty() || !params_to_rename.is_empty();

    if !params_to_remove.is_empty() {
        let body = &mut state.scene.scene.bodies[body_idx];
        for param_name in params_to_remove {
            body.parameters.remove(&param_name);
        }
    }

    // Apply renames
    if !params_to_rename.is_empty() {
        let body = &mut state.scene.scene.bodies[body_idx];
        for (old_name, new_name) in params_to_rename {
            if let Some(mut param) = body.parameters.remove(&old_name) {
                param.name = new_name.clone();
                body.parameters.insert(new_name, param);
            }
        }
        // Обновить размеры, привязанные к параметрам
        body.update_dimensions_from_parameters();
    }

    if !params_to_update.is_empty() {
        let body = &mut state.scene.scene.bodies[body_idx];
        for (param_name, updated_param) in params_to_update {
            body.parameters.insert(param_name, updated_param);
        }
        // Обновить размеры, привязанные к параметрам
        body.update_dimensions_from_parameters();
    }

    if needs_undo {
        state.scene.notify_mutated();
    }
}

fn add_new_parameter(state: &mut AppState, body_idx: usize) {
    let body = &mut state.scene.scene.bodies[body_idx];

    // Generate unique name
    let mut counter = 1;
    let name = loop {
        let candidate = format!("param{}", counter);
        if !body.parameters.contains_key(&candidate) {
            break candidate;
        }
        counter += 1;
    };

    // Create new parameter with default value
    let new_param = Parameter {
        name: name.clone(),
        value: ParameterValue::Number { value: 0.0 },
        unit: Some("mm".to_string()),
        description: None,
    };

    body.parameters.insert(name, new_param);
    // Обновить размеры, привязанные к параметрам
    body.update_dimensions_from_parameters();
    state.scene.notify_mutated();
}
