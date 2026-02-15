use wasm_bindgen::prelude::*;

/// Create a new sketch on a plane
#[wasm_bindgen]
pub fn create_sketch(plane: &str) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Created sketch: {} on plane {}", id, plane);
    Ok(id)
}

/// Add a line to sketch
#[wasm_bindgen]
pub fn sketch_add_line(
    sketch_id: &str,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Added line to sketch {}: ({}, {}) -> ({}, {})", sketch_id, x1, y1, x2, y2);
    Ok(id)
}

/// Add a circle to sketch
#[wasm_bindgen]
pub fn sketch_add_circle(
    sketch_id: &str,
    cx: f64,
    cy: f64,
    radius: f64,
) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Added circle to sketch {}: center ({}, {}), r={}", sketch_id, cx, cy, radius);
    Ok(id)
}

/// Add a rectangle to sketch
#[wasm_bindgen]
pub fn sketch_add_rectangle(
    sketch_id: &str,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Added rectangle to sketch {}: ({}, {}), {}x{}", sketch_id, x, y, width, height);
    Ok(id)
}
