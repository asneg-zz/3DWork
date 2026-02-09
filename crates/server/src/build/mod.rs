use std::collections::HashMap;

use shared::{BooleanOp, Primitive, SceneDescription, SceneOperation, Transform};
use vcad::{centered_cube, Part};
use vcad::export::Material;
use vcad::export::gltf_export::to_glb_bytes;

const DEFAULT_SEGMENTS: u32 = 32;

fn create_primitive(id: &str, primitive: &Primitive) -> Part {
    match primitive {
        Primitive::Cube { width, height, depth } => centered_cube(id, *width, *height, *depth),
        Primitive::Cylinder { radius, height } => Part::cylinder(id, *radius, *height, DEFAULT_SEGMENTS),
        Primitive::Sphere { radius } => Part::sphere(id, *radius, DEFAULT_SEGMENTS),
        Primitive::Cone { radius, height } => Part::cone(id, *radius, 0.0, *height, DEFAULT_SEGMENTS),
    }
}

fn apply_transform(part: Part, transform: &Transform) -> Part {
    let [tx, ty, tz] = transform.position;
    let [rx, ry, rz] = transform.rotation;
    let [sx, sy, sz] = transform.scale;

    let mut p = part;

    if sx != 1.0 || sy != 1.0 || sz != 1.0 {
        p = p.scale(sx, sy, sz);
    }
    if rx != 0.0 || ry != 0.0 || rz != 0.0 {
        p = p.rotate(rx, ry, rz);
    }
    if tx != 0.0 || ty != 0.0 || tz != 0.0 {
        p = p.translate(tx, ty, tz);
    }

    p
}

pub fn build_scene_glb(scene: &SceneDescription) -> Result<Vec<u8>, String> {
    let mut parts: HashMap<String, Part> = HashMap::new();
    let mut last_id: Option<String> = None;

    for op in &scene.operations {
        match op {
            SceneOperation::CreatePrimitive { id, primitive, transform } => {
                let part = create_primitive(id, primitive);
                let part = apply_transform(part, transform);
                parts.insert(id.clone(), part);
                last_id = Some(id.clone());
            }
            SceneOperation::Boolean { id, op: bool_op, left, right } => {
                let left_part = parts
                    .get(left)
                    .ok_or_else(|| format!("Object '{}' not found", left))?;
                let right_part = parts
                    .get(right)
                    .ok_or_else(|| format!("Object '{}' not found", right))?;

                let result = match bool_op {
                    BooleanOp::Union => left_part.union(right_part),
                    BooleanOp::Difference => left_part.difference(right_part),
                    BooleanOp::Intersection => left_part.intersection(right_part),
                };

                parts.insert(id.clone(), result);
                last_id = Some(id.clone());
            }
            SceneOperation::CreateSketch { .. }
            | SceneOperation::Extrude { .. }
            | SceneOperation::Revolve { .. }
            | SceneOperation::Cut { .. } => {
                // Sketches/Extrude/Revolve/Cut are handled by GUI — skip during server GLB build
            }
        }
    }

    let final_part = match &last_id {
        Some(id) => parts.remove(id).ok_or("No parts in scene")?,
        None => return Err("Empty scene".into()),
    };

    let material = Material::default();
    to_glb_bytes(&final_part, &material).map_err(|e| format!("GLB export error: {}", e))
}

pub fn inspect_scene(scene: &SceneDescription) -> Result<serde_json::Value, String> {
    let mut parts: HashMap<String, Part> = HashMap::new();
    let mut last_id: Option<String> = None;

    for op in &scene.operations {
        match op {
            SceneOperation::CreatePrimitive { id, primitive, transform } => {
                let part = create_primitive(id, primitive);
                let part = apply_transform(part, transform);
                parts.insert(id.clone(), part);
                last_id = Some(id.clone());
            }
            SceneOperation::Boolean { id, op: bool_op, left, right } => {
                let left_part = parts
                    .get(left)
                    .ok_or_else(|| format!("Object '{}' not found", left))?;
                let right_part = parts
                    .get(right)
                    .ok_or_else(|| format!("Object '{}' not found", right))?;

                let result = match bool_op {
                    BooleanOp::Union => left_part.union(right_part),
                    BooleanOp::Difference => left_part.difference(right_part),
                    BooleanOp::Intersection => left_part.intersection(right_part),
                };

                parts.insert(id.clone(), result);
                last_id = Some(id.clone());
            }
            SceneOperation::CreateSketch { .. }
            | SceneOperation::Extrude { .. }
            | SceneOperation::Revolve { .. }
            | SceneOperation::Cut { .. } => {
                // Sketches/Extrude/Revolve/Cut — skip during inspect
            }
        }
    }

    let final_part = match &last_id {
        Some(id) => parts.get(id).ok_or("No parts in scene")?,
        None => return Err("Empty scene".into()),
    };

    let bbox = final_part.bounding_box();
    let com = final_part.center_of_mass();

    Ok(serde_json::json!({
        "volume": final_part.volume(),
        "surface_area": final_part.surface_area(),
        "bounding_box": { "min": bbox.0, "max": bbox.1 },
        "center_of_mass": com,
    }))
}
