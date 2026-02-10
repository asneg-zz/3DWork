//! Main application module

mod keyboard;
mod menus;
mod styles;

use eframe::egui;

use crate::state::AppState;
use crate::ui::operation_dialog::OperationDialogUi;
use crate::ui::{chat_panel, properties, scene_tree, sketch_toolbar, status_bar, toolbar};
use crate::viewport::ViewportPanel;

/// Main application
pub struct CadApp {
    state: AppState,
    viewport: ViewportPanel,
    /// Last applied font size (to detect changes)
    last_font_size: f32,
    /// Last saved scene version (for autosave)
    last_saved_version: u64,
}

impl CadApp {
    pub fn new(
        cc: &eframe::CreationContext<'_>,
        initial_scene: Option<shared::SceneDescriptionV2>,
    ) -> Self {
        let mut state = AppState::default();

        // Load initial scene: CLI argument takes priority, then autosave
        if let Some(scene) = initial_scene {
            state.scene.set_scene(scene);
        } else if let Some(autosave) = crate::state::scene::SceneState::load_autosave() {
            state.scene.set_scene(autosave);
            tracing::info!("Loaded autosave scene");
        }

        // Apply initial styles with font size from settings
        styles::configure_styles(&cc.egui_ctx, state.settings.ui.font_size);

        let mut viewport = ViewportPanel::new();

        // Initialize GL renderer if glow context is available
        if let Some(gl) = cc.gl.as_ref() {
            viewport.init_gl(gl);
        }

        let last_font_size = state.settings.ui.font_size;
        let last_saved_version = state.scene.version();

        Self {
            state,
            viewport,
            last_font_size,
            last_saved_version,
        }
    }
}

impl eframe::App for CadApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Apply font size if changed
        if self.state.settings.ui.font_size != self.last_font_size {
            styles::apply_font_size(ctx, self.state.settings.ui.font_size);
            self.last_font_size = self.state.settings.ui.font_size;
        }

        // Autosave scene if changed
        let current_version = self.state.scene.version();
        if current_version != self.last_saved_version {
            self.state.scene.autosave();
            self.state.settings.save();
            self.last_saved_version = current_version;
        }

        keyboard::handle_keyboard(ctx, &mut self.state, &mut self.viewport);

        if let Some(new_ids) = self.state.chat.poll_responses(&mut self.state.scene) {
            self.state.selection.clear();
            if let Some(last_id) = new_ids.last() {
                self.state.selection.toggle(last_id.clone());
            }
        }

        // ── Menu bar ──────────────────────────────────────────
        egui::TopBottomPanel::top("menu_bar").show(ctx, |ui| {
            egui::menu::bar(ui, |ui| {
                menus::file_menu(ui, &mut self.state, &self.viewport);
                menus::edit_menu(ui, &mut self.state);
                menus::view_menu(ui, &mut self.state, &mut self.viewport);
                menus::create_menu(ui, &mut self.state);
                menus::settings_menu(ui, &mut self.state);
            });
        });

        // ── Settings window ──────────────────────────────────
        menus::settings_window(ctx, &mut self.state);

        // ── Operation dialog (extrude/cut params) ────────────
        self.handle_operation_dialog(ctx);

        // ── Toolbar ───────────────────────────────────────────
        egui::TopBottomPanel::top("toolbar")
            .frame(
                egui::Frame::side_top_panel(&ctx.style()).inner_margin(egui::Margin::symmetric(8, 4)),
            )
            .show(ctx, |ui| {
                toolbar::show(ui, &mut self.state);
            });

        // ── Sketch toolbar (only in sketch mode) ─────────────
        if self.state.sketch.is_editing() {
            egui::TopBottomPanel::top("sketch_toolbar")
                .frame(
                    egui::Frame::side_top_panel(&ctx.style())
                        .inner_margin(egui::Margin::symmetric(8, 3))
                        .fill(egui::Color32::from_rgb(45, 45, 55)),
                )
                .show(ctx, |ui| {
                    sketch_toolbar::show(ui, &mut self.state);
                });
        }

        // ── Status bar ───────────────────────────────────────
        egui::TopBottomPanel::bottom("status_bar")
            .exact_height(22.0)
            .frame(
                egui::Frame::side_top_panel(&ctx.style()).inner_margin(egui::Margin::symmetric(8, 2)),
            )
            .show(ctx, |ui| {
                status_bar::show(ui, &self.state);
            });

        // ── Left panel: Scene tree ───────────────────────────
        if self.state.panels.scene_tree {
            egui::SidePanel::left("scene_tree")
                .default_width(210.0)
                .width_range(140.0..=400.0)
                .resizable(true)
                .frame(
                    egui::Frame::side_top_panel(&ctx.style()).inner_margin(egui::Margin::same(6)),
                )
                .show(ctx, |ui| {
                    scene_tree::show(ui, &mut self.state);
                });
        }

        // ── Right panel: Properties + Chat ───────────────────
        self.show_right_panel(ctx);

        // ── Central panel: 3D viewport ───────────────────────
        egui::CentralPanel::default()
            .frame(egui::Frame::NONE)
            .show(ctx, |ui| {
                self.viewport.show(ui, &mut self.state);
            });
    }
}

impl CadApp {
    fn handle_operation_dialog(&mut self, ctx: &egui::Context) {
        use crate::state::OperationType;

        if let Some(confirmed) = self.state.operation_dialog.show(ctx) {
            if confirmed {
                if self.state.operation_dialog.edit_mode {
                    // Edit existing feature
                    if let (Some(body_id), Some(feature_id)) = (
                        self.state.operation_dialog.body_id.clone(),
                        self.state.operation_dialog.feature_id.clone(),
                    ) {
                        let params = &self.state.operation_dialog.params;
                        self.state.scene.update_extrude_feature(
                            &body_id,
                            &feature_id,
                            params.height,
                            params.height_backward,
                            params.draft_angle,
                        );
                        tracing::info!("Updated extrude feature {}", feature_id);
                    }
                    self.state.operation_dialog.close();
                } else {
                    // Apply operation based on type
                    match self.state.operation_dialog.operation_type {
                        OperationType::Extrude => toolbar::apply_extrude(&mut self.state),
                        OperationType::Cut => toolbar::apply_cut(&mut self.state),
                        OperationType::Revolve | OperationType::CutRevolve => {
                            toolbar::apply_revolve(&mut self.state)
                        }
                    }
                }
            }
        }
    }

    fn show_right_panel(&mut self, ctx: &egui::Context) {
        let show_right = self.state.panels.properties || self.state.panels.chat;
        if !show_right {
            return;
        }

        egui::SidePanel::right("right_panel")
            .default_width(290.0)
            .width_range(200.0..=500.0)
            .resizable(true)
            .frame(
                egui::Frame::side_top_panel(&ctx.style()).inner_margin(egui::Margin::same(6)),
            )
            .show(ctx, |ui| {
                let show_props = self.state.panels.properties;
                let show_chat = self.state.panels.chat;

                if show_props && show_chat {
                    // Both panels: split with a scrollable properties area
                    let total = ui.available_height();
                    let props_height = (total * 0.50).max(100.0);

                    egui::ScrollArea::vertical()
                        .id_salt("props_scroll")
                        .max_height(props_height)
                        .show(ui, |ui| {
                            properties::show(ui, &mut self.state);
                        });

                    ui.add_space(2.0);
                    ui.separator();
                    ui.add_space(2.0);

                    chat_panel::show(ui, &mut self.state);
                } else if show_props {
                    egui::ScrollArea::vertical()
                        .id_salt("props_scroll_full")
                        .show(ui, |ui| {
                            properties::show(ui, &mut self.state);
                        });
                } else if show_chat {
                    chat_panel::show(ui, &mut self.state);
                }
            });
    }
}
