use egui::Ui;

use crate::i18n::t;
use crate::state::chat::ChatRole;
use crate::state::AppState;

pub fn show(ui: &mut Ui, state: &mut AppState) {
    // Header with clear button
    ui.horizontal(|ui| {
        ui.heading(t("chat.title"));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if !state.chat.messages.is_empty()
                && ui
                    .small_button(t("chat.clear"))
                    .on_hover_text(t("chat.clear_tip"))
                    .clicked()
                {
                    state.chat.clear();
                }
        });
    });
    ui.separator();

    // Track whether we need a retry action after the scroll area
    let mut wants_retry = false;

    // Message history (scrollable)
    let scroll_height = (ui.available_height() - 36.0).max(60.0);
    egui::ScrollArea::vertical()
        .id_salt("chat_scroll")
        .max_height(scroll_height)
        .stick_to_bottom(true)
        .show(ui, |ui| {
            if state.chat.messages.is_empty() && !state.chat.is_loading {
                ui.add_space(10.0);
                ui.vertical_centered(|ui| {
                    ui.weak(t("chat.placeholder"));
                    ui.add_space(6.0);
                    ui.weak(t("chat.examples"));
                    ui.weak(format!("  \"{}\"", t("chat.example1")));
                    ui.weak(format!("  \"{}\"", t("chat.example2")));
                    ui.weak(format!("  \"{}\"", t("chat.example3")));
                });
            }

            let msg_count = state.chat.messages.len();
            for (i, msg) in state.chat.messages.iter().enumerate() {
                let is_last = i == msg_count - 1;
                let can_retry = is_last && msg.is_error && state.chat.last_failed_input.is_some();
                if show_message(ui, msg, can_retry) {
                    wants_retry = true;
                }
            }

            if state.chat.is_loading {
                ui.add_space(4.0);
                ui.horizontal(|ui| {
                    ui.spinner();
                    ui.weak(t("chat.thinking"));
                });
            }
        });

    // Handle retry outside scroll area (to avoid borrow issues)
    if wants_retry {
        let scene = state.scene.scene.clone();
        state.chat.retry(&scene);
    }

    // Input area
    ui.add_space(2.0);
    ui.horizontal(|ui| {
        let available_w = ui.available_width() - 44.0;
        let input_resp = ui.add_sized(
            [available_w.max(40.0), 22.0],
            egui::TextEdit::singleline(&mut state.chat.input)
                .hint_text(t("chat.ask"))
                .desired_width(available_w.max(40.0)),
        );

        let enter_pressed =
            input_resp.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
        let can_send = !state.chat.is_loading && !state.chat.input.trim().is_empty();

        let send_clicked = ui
            .add_enabled(can_send, egui::Button::new(">>"))
            .on_hover_text(t("chat.send_tip"))
            .clicked();

        if (send_clicked || enter_pressed) && can_send {
            let scene = state.scene.scene.clone();
            state.chat.send_message(&scene);
        }
    });
}

/// Render a single chat message. Returns true if retry was clicked.
fn show_message(ui: &mut Ui, msg: &crate::state::chat::ChatMessage, can_retry: bool) -> bool {
    let mut retry_clicked = false;

    let (prefix, color, bg) = if msg.is_error {
        (
            "AI",
            egui::Color32::from_rgb(255, 130, 130),
            egui::Color32::from_rgba_premultiplied(80, 30, 30, 200),
        )
    } else {
        match msg.role {
            ChatRole::User => (
                t("chat.you"),
                egui::Color32::from_rgb(130, 190, 255),
                egui::Color32::from_rgba_premultiplied(40, 60, 90, 200),
            ),
            ChatRole::Assistant => (
                "AI",
                egui::Color32::from_rgb(130, 255, 170),
                egui::Color32::from_rgba_premultiplied(30, 60, 40, 200),
            ),
        }
    };

    egui::Frame::NONE
        .fill(bg)
        .corner_radius(egui::CornerRadius::same(4))
        .inner_margin(egui::Margin::same(6))
        .outer_margin(egui::Margin::symmetric(0, 2))
        .show(ui, |ui| {
            ui.horizontal_wrapped(|ui| {
                ui.colored_label(color, format!("{prefix}:"));
                ui.label(&msg.text);
            });

            // Retry button for error messages
            if can_retry {
                ui.add_space(2.0);
                if ui.small_button(t("chat.retry")).clicked() {
                    retry_clicked = true;
                }
            }
        });

    retry_clicked
}
