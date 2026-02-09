//! Application style configuration

use eframe::egui;

/// Configure initial application styles with given font size
pub fn configure_styles(ctx: &egui::Context, font_size: f32) {
    let mut style = (*ctx.style()).clone();

    // Dark theme
    style.visuals = egui::Visuals::dark();

    // Rounding
    style.visuals.window_corner_radius = egui::CornerRadius::same(6);
    style.visuals.menu_corner_radius = egui::CornerRadius::same(4);
    style.visuals.widgets.noninteractive.corner_radius = egui::CornerRadius::same(3);
    style.visuals.widgets.inactive.corner_radius = egui::CornerRadius::same(3);
    style.visuals.widgets.hovered.corner_radius = egui::CornerRadius::same(3);
    style.visuals.widgets.active.corner_radius = egui::CornerRadius::same(3);

    // Spacing
    style.spacing.item_spacing = egui::vec2(6.0, 4.0);
    style.spacing.button_padding = egui::vec2(6.0, 3.0);
    style.spacing.menu_margin = egui::Margin::same(4);

    // Slightly brighter panel backgrounds
    style.visuals.panel_fill = egui::Color32::from_rgb(30, 30, 34);
    style.visuals.window_fill = egui::Color32::from_rgb(35, 35, 40);

    // Selection highlight
    style.visuals.selection.bg_fill = egui::Color32::from_rgb(40, 80, 140);

    // Font sizes
    apply_text_styles(&mut style, font_size);

    ctx.set_style(style);
}

/// Apply font size to all text styles
pub fn apply_font_size(ctx: &egui::Context, font_size: f32) {
    let mut style = (*ctx.style()).clone();
    apply_text_styles(&mut style, font_size);
    ctx.set_style(style);
}

fn apply_text_styles(style: &mut egui::Style, font_size: f32) {
    style.text_styles.insert(
        egui::TextStyle::Body,
        egui::FontId::proportional(font_size),
    );
    style.text_styles.insert(
        egui::TextStyle::Button,
        egui::FontId::proportional(font_size),
    );
    style.text_styles.insert(
        egui::TextStyle::Small,
        egui::FontId::proportional(font_size * 0.85),
    );
    style.text_styles.insert(
        egui::TextStyle::Heading,
        egui::FontId::proportional(font_size * 1.3),
    );
    style.text_styles.insert(
        egui::TextStyle::Monospace,
        egui::FontId::monospace(font_size),
    );
}
