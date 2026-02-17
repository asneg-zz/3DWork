use wasm_bindgen::prelude::*;

/// Create a new sketch on a plane
#[wasm_bindgen]
pub fn create_sketch(plane: &str) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Created sketch: {} on plane {}", id, plane);
    Ok(id)
}

