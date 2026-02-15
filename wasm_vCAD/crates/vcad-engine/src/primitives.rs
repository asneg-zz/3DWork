use wasm_bindgen::prelude::*;

/// Create a cube primitive
#[wasm_bindgen]
pub fn create_cube(width: f64, height: f64, depth: f64) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Created cube: {} ({}x{}x{})", id, width, height, depth);
    Ok(id)
}

/// Create a cylinder primitive
#[wasm_bindgen]
pub fn create_cylinder(radius: f64, height: f64) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Created cylinder: {} (r={}, h={})", id, radius, height);
    Ok(id)
}

/// Create a sphere primitive
#[wasm_bindgen]
pub fn create_sphere(radius: f64) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Created sphere: {} (r={})", id, radius);
    Ok(id)
}

/// Create a cone primitive
#[wasm_bindgen]
pub fn create_cone(radius: f64, height: f64) -> Result<String, JsValue> {
    let id = uuid::Uuid::new_v4().to_string();
    tracing::info!("Created cone: {} (r={}, h={})", id, radius, height);
    Ok(id)
}
