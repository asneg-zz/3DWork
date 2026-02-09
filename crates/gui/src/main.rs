mod app;
pub mod i18n;
mod sketch;
mod ui;
mod viewport;

// Re-export library modules so that `crate::build`, `crate::extrude`, etc.
// resolve to the lib crate types everywhere in the binary.
pub use vcad_gui_lib::build;
pub use vcad_gui_lib::export;
pub use vcad_gui_lib::extrude;
pub use vcad_gui_lib::helpers;
pub use vcad_gui_lib::state;

use app::CadApp;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "vcad_gui=info".into()),
        )
        .init();

    // Parse --scene <path> argument
    let initial_scene = parse_scene_arg();

    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("vCAD — 3D CAD Editor")
            .with_inner_size([1400.0, 900.0])
            .with_min_inner_size([800.0, 500.0]),
        ..Default::default()
    };

    if let Err(e) = eframe::run_native(
        "vcad-gui",
        native_options,
        Box::new(move |cc| Ok(Box::new(CadApp::new(cc, initial_scene)))),
    ) {
        tracing::error!("Failed to start application: {e}");
    }
}

fn parse_scene_arg() -> Option<shared::SceneDescriptionV2> {
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--scene" && i + 1 < args.len() {
            let path = &args[i + 1];
            match std::fs::read_to_string(path) {
                Ok(json) => match serde_json::from_str::<shared::SceneDescriptionV2>(&json) {
                    Ok(scene) => {
                        tracing::info!("Loaded scene from {path} ({} bodies)", scene.bodies.len());
                        return Some(scene);
                    }
                    Err(e) => {
                        tracing::error!("Failed to parse scene JSON from {path}: {e}");
                    }
                },
                Err(e) => {
                    tracing::error!("Failed to read scene file {path}: {e}");
                }
            }
            break;
        }
        i += 1;
    }
    None
}
