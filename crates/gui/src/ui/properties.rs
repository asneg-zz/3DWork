//! Properties panel for selected bodies and features
//!
//! Simplified for V2 Body-based architecture.

use egui::Ui;
use shared::Body;

use crate::i18n::t;
use crate::state::scene::{body_display_name, feature_display_name};
use crate::state::AppState;

pub fn show(ui: &mut Ui, state: &mut AppState) {
    ui.heading(t("prop.title"));
    ui.separator();

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
