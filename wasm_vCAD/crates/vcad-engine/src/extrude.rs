use wasm_bindgen::prelude::*;

/// Extrude a sketch
#[wasm_bindgen]
pub fn extrude_sketch(
    sketch_id: &str,
    height: f64,
    height_backward: f64,
    draft_angle: f64,
) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!(
        "Extruded sketch {}: h={}, h_back={}, draft={}°",
        sketch_id,
        height,
        height_backward,
        draft_angle
    );
    Ok(id)
}

/// Cut extrude operation
#[wasm_bindgen]
pub fn cut_extrude(
    body_id: &str,
    sketch_id: &str,
    height: f64,
) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Cut extruded sketch {} from body {}: h={}", sketch_id, body_id, height);
    Ok(id)
}

/// Revolve a sketch
#[wasm_bindgen]
pub fn revolve_sketch(
    sketch_id: &str,
    axis_start_x: f64,
    axis_start_y: f64,
    axis_end_x: f64,
    axis_end_y: f64,
    angle: f64,
) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!(
        "Revolved sketch {}: axis ({}, {}) -> ({}, {}), angle={}°",
        sketch_id,
        axis_start_x,
        axis_start_y,
        axis_end_x,
        axis_end_y,
        angle
    );
    Ok(id)
}
