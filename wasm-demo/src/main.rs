use eframe::egui;
use eframe::wasm_bindgen::JsCast;
use serde::{Deserialize, Serialize};

fn main() -> Result<(), eframe::Error> {
    let options = eframe::WebOptions::default();

    wasm_bindgen_futures::spawn_local(async {
        let document = web_sys::window()
            .expect("No window")
            .document()
            .expect("No document");

        let canvas = document
            .get_element_by_id("the_canvas_id")
            .expect("Failed to find the_canvas_id")
            .dyn_into::<web_sys::HtmlCanvasElement>()
            .expect("the_canvas_id was not a HtmlCanvasElement");

        eframe::WebRunner::new()
            .start(
                canvas,
                options,
                Box::new(|cc| Ok(Box::new(MyApp::new(cc)))),
            )
            .await
            .expect("failed to start eframe");
    });

    Ok(())
}

#[derive(Default, Serialize, Deserialize)]
struct MyApp {
    name: String,
    age: u32,
    show_3d: bool,
}

impl MyApp {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        // Можно загрузить сохраненное состояние
        if let Some(storage) = cc.storage {
            return eframe::get_value(storage, eframe::APP_KEY).unwrap_or_default();
        }
        Default::default()
    }
}

impl eframe::App for MyApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Top panel
        egui::TopBottomPanel::top("top_panel").show(ctx, |ui| {
            egui::menu::bar(ui, |ui| {
                ui.menu_button("File", |ui| {
                    if ui.button("Quit").clicked() {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                });
                ui.menu_button("View", |ui| {
                    ui.checkbox(&mut self.show_3d, "Show 3D viewport");
                });
            });
        });

        // Left panel - как в vCAD
        egui::SidePanel::left("left_panel")
            .default_width(200.0)
            .show(ctx, |ui| {
                ui.heading("Scene Tree");
                ui.separator();

                ui.label("Bodies:");
                ui.indent("bodies", |ui| {
                    ui.selectable_label(false, "Body 1");
                    ui.selectable_label(false, "Body 2");
                    ui.selectable_label(false, "Body 3");
                });
            });

        // Right panel - Properties
        egui::SidePanel::right("right_panel")
            .default_width(250.0)
            .show(ctx, |ui| {
                ui.heading("Properties");
                ui.separator();

                ui.label("Name:");
                ui.text_edit_singleline(&mut self.name);

                ui.label("Age:");
                ui.add(egui::Slider::new(&mut self.age, 0..=120));

                ui.separator();
                ui.label(format!("Hello '{}', age {}", self.name, self.age));
            });

        // Central panel - 3D viewport placeholder
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("3D Viewport");

            if self.show_3d {
                // Здесь будет 3D рендеринг
                ui.centered_and_justified(|ui| {
                    ui.label("🎨 WebGL viewport будет здесь\n(можно интегрировать Three.js или glow)");
                });

                // Пример рисования
                let painter = ui.painter();
                let rect = ui.available_rect_before_wrap();
                painter.rect_filled(rect, 0.0, egui::Color32::from_rgb(30, 30, 40));

                // Рисуем простую сетку
                let spacing = 50.0;
                for i in 0..10 {
                    let x = rect.left() + i as f32 * spacing;
                    painter.line_segment(
                        [egui::pos2(x, rect.top()), egui::pos2(x, rect.bottom())],
                        egui::Stroke::new(1.0, egui::Color32::from_rgb(50, 50, 60)),
                    );
                }
                for i in 0..10 {
                    let y = rect.top() + i as f32 * spacing;
                    painter.line_segment(
                        [egui::pos2(rect.left(), y), egui::pos2(rect.right(), y)],
                        egui::Stroke::new(1.0, egui::Color32::from_rgb(50, 50, 60)),
                    );
                }
            } else {
                ui.centered_and_justified(|ui| {
                    ui.label("3D viewport is hidden");
                });
            }
        });

        // Status bar
        egui::TopBottomPanel::bottom("bottom_panel")
            .exact_height(24.0)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label("vCAD WASM Demo");
                    ui.separator();
                    ui.label(format!("Running in browser! FPS: {:.0}", ctx.input(|i| 1.0 / i.stable_dt)));
                });
            });
    }

    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        eframe::set_value(storage, eframe::APP_KEY, self);
    }
}
