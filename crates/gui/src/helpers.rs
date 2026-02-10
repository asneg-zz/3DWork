//! Common helper functions for body/feature operations
//!
//! This module provides shared utilities to avoid code duplication
//! across toolbar.rs, scene_tree.rs, and other UI components.

use shared::{Body, Feature, Sketch, SketchElement, Transform};
use crate::state::AppState;
use crate::state::operation_dialog::RevolveAxis;

/// Check if body has base geometry (primitive, extrude, or revolve)
pub fn has_base_geometry(body: &Body) -> bool {
    body.features.iter().any(|f| {
        matches!(
            f,
            Feature::BasePrimitive { .. }
                | Feature::BaseExtrude { .. }
                | Feature::BaseRevolve { .. }
        )
    })
}

/// Get the base transform of a body (from BasePrimitive, BaseExtrude, or BaseRevolve)
/// Returns Transform::new() if no base feature found
pub fn get_body_base_transform(body: &Body) -> Transform {
    for feature in &body.features {
        match feature {
            Feature::BasePrimitive { transform, .. } => return transform.clone(),
            Feature::BaseExtrude { sketch_transform, .. } => return sketch_transform.clone(),
            Feature::BaseRevolve { sketch_transform, .. } => return sketch_transform.clone(),
            _ => continue,
        }
    }
    Transform::new()
}

/// Combine two transforms (parent + child)
/// Result position = parent.position + child.position * parent.scale
pub fn combine_transforms(parent: &Transform, child: &Transform) -> Transform {
    Transform {
        position: [
            parent.position[0] + child.position[0] * parent.scale[0],
            parent.position[1] + child.position[1] * parent.scale[1],
            parent.position[2] + child.position[2] * parent.scale[2],
        ],
        rotation: [
            parent.rotation[0] + child.rotation[0],
            parent.rotation[1] + child.rotation[1],
            parent.rotation[2] + child.rotation[2],
        ],
        scale: [
            parent.scale[0] * child.scale[0],
            parent.scale[1] * child.scale[1],
            parent.scale[2] * child.scale[2],
        ],
    }
}

/// Find a visible body with base geometry, excluding the given ID
pub fn find_body_with_base<'a>(
    state: &'a AppState,
    exclude_id: &str,
) -> Option<&'a Body> {
    state.scene.scene.bodies.iter().find(|b| {
        b.id != exclude_id && b.visible && has_base_geometry(b)
    })
}

/// Find the last sketch with elements in a body
/// Returns (feature_id, sketch, transform) if found
pub fn find_last_sketch_with_elements(body: &Body) -> Option<(String, Sketch, Transform)> {
    body.features.iter().rev().find_map(|f| {
        if let Feature::Sketch { id, sketch, transform } = f {
            if !sketch.elements.is_empty() {
                return Some((id.clone(), sketch.clone(), transform.clone()));
            }
        }
        None
    })
}

/// Find ANY sketch (even empty) in a body - useful for checking if body has sketch feature
pub fn find_any_sketch(body: &Body) -> Option<(String, Sketch, Transform)> {
    body.features.iter().rev().find_map(|f| {
        if let Feature::Sketch { id, sketch, transform } = f {
            return Some((id.clone(), sketch.clone(), transform.clone()));
        }
        None
    })
}

/// Check if body has a sketch with elements
pub fn has_sketch_with_elements(body: &Body) -> bool {
    body.features.iter().any(|f| {
        matches!(f, Feature::Sketch { sketch, .. } if !sketch.elements.is_empty())
    })
}

/// Context for feature operations (extrude, revolve, cut)
pub struct BodyContext {
    pub body_id: String,
    pub body: Body,
    pub has_base: bool,
    pub last_sketch: Option<(String, Sketch, Transform)>,
}

/// Get selected body with full context for feature operations
/// Returns error message if validation fails
pub fn get_selected_body_context(state: &AppState) -> Result<BodyContext, &'static str> {
    let body_id = state
        .selection
        .primary()
        .ok_or("No body selected")?
        .clone();

    let body = state
        .scene
        .get_body(&body_id)
        .ok_or("Body not found")?
        .clone();

    let has_base = has_base_geometry(&body);
    let last_sketch = find_last_sketch_with_elements(&body);

    Ok(BodyContext {
        body_id,
        body,
        has_base,
        last_sketch,
    })
}

/// Check if Cut operation can be performed
/// Returns true if selected body has sketch with elements AND
/// (same body has base OR another body has base)
pub fn can_perform_cut(state: &AppState) -> bool {
    let Some(body_id) = state.selection.primary() else {
        return false;
    };
    let Some(body) = state.scene.get_body(body_id) else {
        return false;
    };

    if !has_sketch_with_elements(body) {
        return false;
    }

    // Either this body has base, or another body has base
    has_base_geometry(body) || find_body_with_base(state, body_id).is_some()
}

/// Check if Extrude/Revolve operation can be performed
/// Returns true if selected body has sketch with elements
pub fn can_perform_extrude(state: &AppState) -> bool {
    state
        .selection
        .primary()
        .and_then(|id| state.scene.get_body(id))
        .map(has_sketch_with_elements)
        .unwrap_or(false)
}

/// Find construction lines in a sketch that can be used as revolve axes
/// Also includes the designated revolve axis (even if not construction geometry)
pub fn find_construction_axes(sketch: &Sketch) -> Vec<RevolveAxis> {
    let mut axes = Vec::new();
    let mut line_count = 0;

    for (index, element) in sketch.elements.iter().enumerate() {
        // Include if: construction geometry OR designated as revolve axis
        let is_construction = sketch.is_construction(index);
        let is_designated_axis = sketch.revolve_axis == Some(index);

        if !is_construction && !is_designated_axis {
            continue;
        }

        // Only lines can be used as axes
        if let SketchElement::Line { start, end } = element {
            line_count += 1;
            let suffix = if is_designated_axis { " *" } else { "" };
            axes.push(RevolveAxis {
                start: [start.x, start.y],
                end: [end.x, end.y],
                name: format!("Line {}{}", line_count, suffix),
                element_index: index as i32,
            });
        }
    }

    axes
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared::{Primitive, SketchPlane};

    fn make_body_with_primitive() -> Body {
        Body {
            id: "test-body".to_string(),
            name: "Test Body".to_string(),
            visible: true,
            features: vec![Feature::BasePrimitive {
                id: "prim-1".to_string(),
                primitive: Primitive::Cube {
                    width: 1.0,
                    height: 1.0,
                    depth: 1.0,
                },
                transform: Transform::new(),
            }],
        }
    }

    fn make_body_with_sketch() -> Body {
        Body {
            id: "sketch-body".to_string(),
            name: "Sketch Body".to_string(),
            visible: true,
            features: vec![Feature::Sketch {
                id: "sketch-1".to_string(),
                sketch: Sketch {
                    plane: SketchPlane::Xy,
                    offset: 0.0,
                    elements: vec![shared::SketchElement::Circle {
                        center: shared::Point2D { x: 0.0, y: 0.0 },
                        radius: 0.5,
                    }],
                    face_normal: None,
                },
                transform: Transform::new(),
            }],
        }
    }

    #[test]
    fn test_has_base_geometry() {
        let body_with_prim = make_body_with_primitive();
        assert!(has_base_geometry(&body_with_prim));

        let body_with_sketch = make_body_with_sketch();
        assert!(!has_base_geometry(&body_with_sketch));
    }

    #[test]
    fn test_has_sketch_with_elements() {
        let body_with_prim = make_body_with_primitive();
        assert!(!has_sketch_with_elements(&body_with_prim));

        let body_with_sketch = make_body_with_sketch();
        assert!(has_sketch_with_elements(&body_with_sketch));
    }

    #[test]
    fn test_find_last_sketch() {
        let body = make_body_with_sketch();
        let result = find_last_sketch_with_elements(&body);
        assert!(result.is_some());
        let (id, _, _) = result.unwrap();
        assert_eq!(id, "sketch-1");
    }
}
