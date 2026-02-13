//! Application menu bar and settings window

use eframe::egui;

use crate::i18n::{lang, set_lang, t, Lang};
use crate::state::{AppState, Units};
use crate::ui::toolbar;
use crate::viewport::ViewportPanel;

/// Show the file menu
pub fn file_menu(ui: &mut egui::Ui, state: &mut AppState, viewport: &ViewportPanel) {
    ui.menu_button(t("menu.file"), |ui| {
        if ui.button(t("menu.new")).clicked() {
            state.scene.clear();
            state.selection.clear();
            state.sketch.exit_edit();
            state.chat.clear();
            ui.close_menu();
        }
        if ui.button(t("menu.open")).clicked() {
            ui.close_menu();
            if let Some(path) = rfd::FileDialog::new()
                .set_title(t("menu.open_title"))
                .add_filter("JSON", &["json"])
                .pick_file()
            {
                match std::fs::read_to_string(&path) {
                    Ok(json) => match serde_json::from_str::<shared::SceneDescriptionV2>(&json) {
                        Ok(scene) => {
                            state.scene.set_scene(scene);
                            state.selection.clear();
                            state.sketch.exit_edit();
                            tracing::info!("Loaded scene from {}", path.display());
                        }
                        Err(e) => tracing::error!("Failed to parse scene: {e}"),
                    },
                    Err(e) => tracing::error!("Failed to read file: {e}"),
                }
            }
        }
        if ui.button(t("menu.save")).clicked() {
            ui.close_menu();
            if let Some(path) = rfd::FileDialog::new()
                .set_title(t("menu.save_title"))
                .add_filter("JSON", &["json"])
                .set_file_name("scene.json")
                .save_file()
            {
                match serde_json::to_string_pretty(&state.scene.scene) {
                    Ok(json) => {
                        if let Err(e) = std::fs::write(&path, json) {
                            tracing::error!("Failed to write scene: {e}");
                        } else {
                            tracing::info!("Saved scene to {}", path.display());
                        }
                    }
                    Err(e) => tracing::error!("Failed to serialize scene: {e}"),
                }
            }
        }
        ui.separator();
        if ui.button(t("menu.export_glb")).clicked() {
            ui.close_menu();
            let meshes = viewport.export_meshes();
            if !meshes.is_empty() {
                let glb_data = crate::export::build_glb(&meshes);
                if let Some(path) = rfd::FileDialog::new()
                    .set_title(t("menu.export_glb_title"))
                    .add_filter("GLB", &["glb"])
                    .set_file_name("scene.glb")
                    .save_file()
                {
                    if let Err(e) = std::fs::write(&path, &glb_data) {
                        tracing::error!("Failed to write GLB: {e}");
                    }
                }
            }
        }
        ui.separator();
        if ui.button(t("menu.quit")).clicked() {
            std::process::exit(0);
        }
    });
}

/// Show the edit menu
pub fn edit_menu(ui: &mut egui::Ui, state: &mut AppState) {
    ui.menu_button(t("menu.edit"), |ui| {
        if ui
            .add_enabled(state.scene.can_undo(), egui::Button::new(t("menu.undo")))
            .clicked()
        {
            state.scene.undo();
            ui.close_menu();
        }
        if ui
            .add_enabled(state.scene.can_redo(), egui::Button::new(t("menu.redo")))
            .clicked()
        {
            state.scene.redo();
            ui.close_menu();
        }
        ui.separator();
        if ui
            .add_enabled(
                state.selection.primary().is_some(),
                egui::Button::new(t("menu.duplicate")),
            )
            .clicked()
        {
            toolbar::action_duplicate(state);
            ui.close_menu();
        }
        if ui
            .add_enabled(
                state.selection.primary().is_some(),
                egui::Button::new(t("menu.delete")),
            )
            .clicked()
        {
            if let Some(id) = state.selection.primary().cloned() {
                state.scene.remove_body(&id);
                state.selection.clear();
            }
            ui.close_menu();
        }
        ui.separator();
        if ui.button(t("menu.select_all")).clicked() {
            for body in &state.scene.scene.bodies {
                if !state.selection.is_selected(&body.id) {
                    state.selection.toggle(body.id.clone());
                }
            }
            ui.close_menu();
        }
        if ui.button(t("menu.deselect_all")).clicked() {
            state.selection.clear();
            ui.close_menu();
        }
    });
}

/// Show the view menu
pub fn view_menu(ui: &mut egui::Ui, state: &mut AppState, viewport: &mut ViewportPanel) {
    ui.menu_button(t("menu.view"), |ui| {
        ui.checkbox(&mut state.panels.scene_tree, t("menu.scene_tree"));
        ui.checkbox(&mut state.panels.properties, t("menu.properties"));
        ui.checkbox(&mut state.panels.parameters, t("menu.parameters"));
        ui.checkbox(&mut state.panels.chat, t("menu.ai_chat"));
        ui.separator();
        if ui.button(t("menu.reset_camera")).clicked() {
            viewport.reset_camera();
            ui.close_menu();
        }
        ui.separator();
        ui.menu_button(t("menu.language"), |ui| {
            if ui.selectable_label(lang() == Lang::Ru, "Русский").clicked() {
                set_lang(Lang::Ru);
                ui.close_menu();
            }
            if ui.selectable_label(lang() == Lang::En, "English").clicked() {
                set_lang(Lang::En);
                ui.close_menu();
            }
        });
    });
}

/// Show the create menu
pub fn create_menu(ui: &mut egui::Ui, state: &mut AppState) {
    ui.menu_button(t("menu.create"), |ui| {
        ui.label(t("menu.primitives"));
        if ui.button(format!("  {}", t("prim.cube"))).clicked() {
            toolbar::action_create_cube(state);
            ui.close_menu();
        }
        if ui.button(format!("  {}", t("prim.cylinder"))).clicked() {
            toolbar::action_create_cylinder(state);
            ui.close_menu();
        }
        if ui.button(format!("  {}", t("prim.sphere"))).clicked() {
            toolbar::action_create_sphere(state);
            ui.close_menu();
        }
        if ui.button(format!("  {}", t("prim.cone"))).clicked() {
            toolbar::action_create_cone(state);
            ui.close_menu();
        }
        ui.separator();
        ui.label(t("menu.sketch"));
        if ui.button(format!("  {}", t("menu.on_xy"))).clicked() {
            toolbar::action_create_sketch_xy(state);
            ui.close_menu();
        }
        if ui.button(format!("  {}", t("menu.on_xz"))).clicked() {
            toolbar::action_create_sketch_xz(state);
            ui.close_menu();
        }
        if ui.button(format!("  {}", t("menu.on_yz"))).clicked() {
            toolbar::action_create_sketch_yz(state);
            ui.close_menu();
        }
        ui.separator();
        ui.label(t("menu.features"));
        // Note: V2 architecture - extrude/revolve now work with body features
        // For now, these are disabled until feature selection is implemented
        let has_sketch_selected = false;
        if ui
            .add_enabled(
                has_sketch_selected,
                egui::Button::new(format!("  {}", t("menu.extrude"))),
            )
            .clicked()
        {
            toolbar::action_extrude(state);
            ui.close_menu();
        }
        if ui
            .add_enabled(
                has_sketch_selected,
                egui::Button::new(format!("  {}", t("menu.revolve"))),
            )
            .clicked()
        {
            toolbar::action_revolve(state);
            ui.close_menu();
        }
    });
}

/// Show the settings menu
pub fn settings_menu(ui: &mut egui::Ui, state: &mut AppState) {
    ui.menu_button(t("menu.settings"), |ui| {
        if ui.button(t("menu.preferences")).clicked() {
            state.show_settings_window = true;
            ui.close_menu();
        }
    });
}

/// Show the settings window
pub fn settings_window(ctx: &egui::Context, state: &mut AppState) {
    let mut open = state.show_settings_window;
    egui::Window::new(t("settings.title"))
        .open(&mut open)
        .resizable(true)
        .default_width(400.0)
        .show(ctx, |ui| {
            egui::ScrollArea::vertical().show(ui, |ui| {
                show_general_settings(ui, state);
                show_dimension_settings(ui, state);
                show_grid_settings(ui, state);
                show_axes_settings(ui, state);
                show_viewport_settings(ui, state);
                show_snap_settings(ui, state);
                show_ui_settings(ui, state);
                show_settings_buttons(ui, state);
            });
        });
    state.show_settings_window = open;
}

fn show_general_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading(t("settings.general"));
    ui.horizontal(|ui| {
        ui.label(t("settings.units"));
        egui::ComboBox::from_id_salt("units_combo")
            .selected_text(match state.settings.units {
                Units::Millimeters => t("settings.mm"),
                Units::Centimeters => t("settings.cm"),
                Units::Meters => t("settings.m"),
                Units::Inches => t("settings.in"),
            })
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut state.settings.units, Units::Millimeters, t("settings.mm"));
                ui.selectable_value(&mut state.settings.units, Units::Centimeters, t("settings.cm"));
                ui.selectable_value(&mut state.settings.units, Units::Meters, t("settings.m"));
                ui.selectable_value(&mut state.settings.units, Units::Inches, t("settings.in"));
            });
    });
    ui.add_space(10.0);
}

fn show_grid_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading(t("settings.grid"));
    ui.checkbox(&mut state.settings.grid.visible, t("settings.grid_visible"));

    ui.horizontal(|ui| {
        ui.label(t("settings.grid_size"));
        ui.add(
            egui::DragValue::new(&mut state.settings.grid.size)
                .speed(0.1)
                .range(0.1..=100.0)
                .suffix(format!(" {}", state.settings.units.abbrev())),
        );
    });

    ui.horizontal(|ui| {
        ui.label(t("settings.grid_range"));
        ui.add(
            egui::DragValue::new(&mut state.settings.grid.range)
                .speed(1)
                .range(1..=50),
        );
    });

    ui.horizontal(|ui| {
        ui.label(t("settings.grid_opacity"));
        ui.add(egui::Slider::new(&mut state.settings.grid.opacity, 0.0..=1.0));
    });
    ui.add_space(10.0);
}

fn show_axes_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading(t("settings.axes"));
    ui.checkbox(&mut state.settings.axes.visible, t("settings.axes_visible"));
    ui.checkbox(&mut state.settings.axes.show_labels, t("settings.axes_labels"));

    ui.horizontal(|ui| {
        ui.label(t("settings.axes_length"));
        ui.add(
            egui::DragValue::new(&mut state.settings.axes.length)
                .speed(0.1)
                .range(0.1..=10.0),
        );
    });

    ui.horizontal(|ui| {
        ui.label(t("settings.axes_thickness"));
        ui.add(
            egui::DragValue::new(&mut state.settings.axes.thickness)
                .speed(0.1)
                .range(0.5..=5.0),
        );
    });
    ui.add_space(10.0);
}

fn show_viewport_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading(t("settings.viewport"));
    ui.horizontal(|ui| {
        ui.label(t("settings.bg_color"));
        let mut color = egui::Color32::from_rgb(
            state.settings.viewport.background_color[0],
            state.settings.viewport.background_color[1],
            state.settings.viewport.background_color[2],
        );
        if ui.color_edit_button_srgba(&mut color).changed() {
            state.settings.viewport.background_color = [color.r(), color.g(), color.b()];
        }
    });

    ui.horizontal(|ui| {
        ui.label(t("settings.sel_color"));
        let mut color = egui::Color32::from_rgb(
            state.settings.viewport.selection_color[0],
            state.settings.viewport.selection_color[1],
            state.settings.viewport.selection_color[2],
        );
        if ui.color_edit_button_srgba(&mut color).changed() {
            state.settings.viewport.selection_color = [color.r(), color.g(), color.b()];
        }
    });

    ui.checkbox(&mut state.settings.viewport.antialiasing, t("settings.antialiasing"));
    ui.add_space(10.0);
}

fn show_snap_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading(t("settings.snap"));
    ui.checkbox(&mut state.settings.snap.enabled, t("settings.snap_enabled"));
    ui.checkbox(&mut state.settings.snap.grid, t("settings.snap_grid"));
    ui.checkbox(&mut state.settings.snap.endpoints, t("settings.snap_endpoints"));
    ui.checkbox(&mut state.settings.snap.midpoints, t("settings.snap_midpoints"));
    ui.checkbox(&mut state.settings.snap.intersections, t("settings.snap_intersections"));

    ui.horizontal(|ui| {
        ui.label(t("settings.snap_radius"));
        ui.add(
            egui::DragValue::new(&mut state.settings.snap.radius)
                .speed(1.0)
                .range(1.0..=50.0),
        );
    });
    ui.add_space(10.0);
}

fn show_ui_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading(t("settings.ui"));
    ui.horizontal(|ui| {
        ui.label(t("settings.font_size"));
        ui.add(
            egui::DragValue::new(&mut state.settings.ui.font_size)
                .speed(0.5)
                .range(8.0..=24.0)
                .suffix(" pt"),
        );
    });
    ui.add_space(10.0);
}

fn show_dimension_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading(t("settings.dimensions"));

    ui.horizontal(|ui| {
        ui.label(t("settings.dim_font_size"));
        ui.add(
            egui::DragValue::new(&mut state.settings.dimensions.font_size)
                .speed(0.5)
                .range(8.0..=32.0)
                .suffix(" pt"),
        );
    });

    ui.horizontal(|ui| {
        ui.label(t("settings.dim_precision"));
        ui.add(
            egui::DragValue::new(&mut state.settings.dimensions.precision)
                .speed(1.0)
                .range(0..=6),
        );
    });

    ui.checkbox(&mut state.settings.dimensions.show_units, t("settings.dim_show_units"));
    ui.add_space(10.0);
}

fn show_settings_buttons(ui: &mut egui::Ui, state: &mut AppState) {
    ui.separator();
    ui.horizontal(|ui| {
        if ui.button(t("settings.apply")).clicked() {
            state.settings.save();
        }
        if ui.button(t("settings.reset")).clicked() {
            state.settings = crate::state::settings::AppSettings::default();
        }
        if ui.button(t("settings.close")).clicked() {
            state.show_settings_window = false;
        }
    });
}
