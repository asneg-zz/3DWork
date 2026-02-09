//! Display helper functions for bodies and features

use shared::{Body, BooleanOp, Feature, Primitive};

/// Get display name for a body
pub fn body_display_name(body: &Body) -> String {
    format!("{} ({})", body.name, short_id(&body.id))
}

/// Get display name for a feature
pub fn feature_display_name(feature: &Feature) -> String {
    match feature {
        Feature::BasePrimitive { primitive, .. } => {
            let kind = match primitive {
                Primitive::Cube { .. } => "Cube",
                Primitive::Cylinder { .. } => "Cylinder",
                Primitive::Sphere { .. } => "Sphere",
                Primitive::Cone { .. } => "Cone",
            };
            format!("Base {}", kind)
        }
        Feature::BaseExtrude { .. } => "Base Extrude".to_string(),
        Feature::BaseRevolve { .. } => "Base Revolve".to_string(),
        Feature::Sketch { .. } => "Sketch".to_string(),
        Feature::Extrude { cut, .. } => {
            if *cut {
                "Cut Extrude".to_string()
            } else {
                "Boss Extrude".to_string()
            }
        }
        Feature::Revolve { cut, .. } => {
            if *cut {
                "Cut Revolve".to_string()
            } else {
                "Boss Revolve".to_string()
            }
        }
        Feature::BooleanModify { op, .. } => match op {
            BooleanOp::Union => "Add Body".to_string(),
            BooleanOp::Difference => "Subtract Body".to_string(),
            BooleanOp::Intersection => "Intersect Body".to_string(),
        },
    }
}

/// Get icon for a feature
pub fn feature_icon(feature: &Feature) -> &'static str {
    match feature {
        Feature::BasePrimitive { primitive, .. } => match primitive {
            Primitive::Cube { .. } => "[C]",
            Primitive::Cylinder { .. } => "[Y]",
            Primitive::Sphere { .. } => "[S]",
            Primitive::Cone { .. } => "[K]",
        },
        Feature::BaseExtrude { .. } => "[E]",
        Feature::BaseRevolve { .. } => "[R]",
        Feature::Sketch { .. } => "[~]",
        Feature::Extrude { cut, .. } => {
            if *cut {
                "[X]"
            } else {
                "[E]"
            }
        }
        Feature::Revolve { cut, .. } => {
            if *cut {
                "[X]"
            } else {
                "[R]"
            }
        }
        Feature::BooleanModify { op, .. } => match op {
            BooleanOp::Union => "[+]",
            BooleanOp::Difference => "[-]",
            BooleanOp::Intersection => "[&]",
        },
    }
}

/// Get shortened ID (first 8 characters)
pub fn short_id(id: &str) -> &str {
    if id.len() > 8 {
        &id[..8]
    } else {
        id
    }
}
