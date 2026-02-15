use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

mod primitives;
mod sketch_wasm;  // Rename old stub to sketch_wasm
mod extrude;
mod fillet;
mod boolean;
mod export;
mod truck_primitives;
pub mod sketch;  // Real sketch operations from desktop app
mod sketch_operations;  // WASM bindings for sketch ops

pub use primitives::*;
pub use sketch_wasm::*;  // Old sketch stubs
pub use extrude::*;
pub use fillet::*;
pub use boolean::*;
pub use export::*;
pub use sketch_operations::*;  // Real sketch operations

/// Initialize WASM module with panic hook and logging
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    tracing_wasm::set_as_global_default();
    tracing::info!("vCAD WASM Engine initialized");
}

/// Main vCAD Engine interface
#[wasm_bindgen]
pub struct VcadEngine {
    version: String,
}

#[wasm_bindgen]
impl VcadEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn version(&self) -> String {
        self.version.clone()
    }

    /// Build scene from SceneDescription and return GLB bytes
    #[wasm_bindgen]
    pub fn build_scene_glb(&self, scene_json: &str) -> Result<Vec<u8>, JsValue> {
        build_scene_to_glb(scene_json)
    }

    /// Get scene metrics (volume, surface area, bounding box)
    #[wasm_bindgen]
    pub fn inspect_scene(&self, scene_json: &str) -> Result<JsValue, JsValue> {
        inspect_scene_metrics(scene_json)
    }
}

/// Version info
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Check if manifold CSG is available
#[wasm_bindgen]
pub fn has_manifold() -> bool {
    cfg!(feature = "manifold")
}

// ========== Truck-based Mesh Generation ==========

/// Generate mesh for a cube
#[wasm_bindgen]
pub fn generate_cube_mesh(width: f64, height: f64, depth: f64) -> Result<JsValue, JsValue> {
    let mesh = truck_primitives::create_cube_mesh(width, height, depth)?;
    serde_wasm_bindgen::to_value(&mesh)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Generate mesh for a cylinder
#[wasm_bindgen]
pub fn generate_cylinder_mesh(radius: f64, height: f64) -> Result<JsValue, JsValue> {
    let mesh = truck_primitives::create_cylinder_mesh(radius, height)?;
    serde_wasm_bindgen::to_value(&mesh)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Generate mesh for a sphere
#[wasm_bindgen]
pub fn generate_sphere_mesh(radius: f64) -> Result<JsValue, JsValue> {
    let mesh = truck_primitives::create_sphere_mesh(radius)?;
    serde_wasm_bindgen::to_value(&mesh)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Generate mesh for a cone
#[wasm_bindgen]
pub fn generate_cone_mesh(radius: f64, height: f64) -> Result<JsValue, JsValue> {
    let mesh = truck_primitives::create_cone_mesh(radius, height)?;
    serde_wasm_bindgen::to_value(&mesh)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}
