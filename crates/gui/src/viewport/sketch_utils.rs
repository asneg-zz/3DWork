//! Sketch utility functions for viewport

use shared::{Feature, SceneDescriptionV2, Sketch, SketchPlane, Transform};

use crate::state::AppState;

/// Find the sketch and transform for a given body ID and optional feature ID.
/// If feature_id is Some, finds that specific feature.
/// If feature_id is None, finds the LAST Sketch feature in the body (most recently added).
/// Falls back to Base* sketches if no standalone Sketch found.
pub fn find_sketch_data_ex<'a>(
    scene: &'a SceneDescriptionV2,
    body_id: &str,
    feature_id: Option<&str>,
) -> Option<(&'a Sketch, &'a Transform)> {
    for body in &scene.bodies {
        if body.id != body_id {
            continue;
        }

        // If feature_id is specified, find that specific feature
        if let Some(fid) = feature_id {
            for feature in &body.features {
                match feature {
                    Feature::Sketch { id, sketch, transform } if id == fid => {
                        return Some((sketch, transform));
                    }
                    Feature::BaseExtrude {
                        id,
                        sketch,
                        sketch_transform,
                        ..
                    } if id == fid => {
                        return Some((sketch, sketch_transform));
                    }
                    Feature::BaseRevolve {
                        id,
                        sketch,
                        sketch_transform,
                        ..
                    } if id == fid => {
                        return Some((sketch, sketch_transform));
                    }
                    _ => {}
                }
            }
            return None;
        }

        // No feature_id: find the LAST Sketch feature (most recently added)
        let last_sketch = body.features.iter().rev().find_map(|f| {
            if let Feature::Sketch { sketch, transform, .. } = f {
                Some((sketch, transform))
            } else {
                None
            }
        });
        if last_sketch.is_some() {
            return last_sketch;
        }

        // Fall back to Base* sketches
        for feature in &body.features {
            match feature {
                Feature::BaseExtrude {
                    sketch,
                    sketch_transform,
                    ..
                } => {
                    return Some((sketch, sketch_transform));
                }
                Feature::BaseRevolve {
                    sketch,
                    sketch_transform,
                    ..
                } => {
                    return Some((sketch, sketch_transform));
                }
                _ => {}
            }
        }
    }
    None
}

/// Add sketch to an existing body (for sketch on face)
pub fn add_sketch_to_existing_body(
    state: &mut AppState,
    body_id: &str,
    plane: SketchPlane,
    offset: f64,
    face_normal: Option<[f64; 3]>,
) {
    tracing::info!(
        "Creating sketch on face: body={}, plane={:?}, offset={}, face_normal={:?}",
        body_id, plane, offset, face_normal
    );

    // Create a sketch
    let sketch = Sketch {
        plane,
        offset,
        elements: vec![],
        face_normal,
        construction: vec![],
        revolve_axis: None,
        symmetry_axis: None,
        constraints: vec![],
    };

    // Add sketch to the existing body
    if let Some(feature_id) =
        state
            .scene
            .add_sketch_to_body(&body_id.to_string(), sketch, Transform::new())
    {
        // Enter sketch editing mode with specific feature ID
        state
            .sketch
            .enter_edit_feature(body_id.to_string(), feature_id.clone());
        state.selection.select(body_id.to_string());
        tracing::info!("Added sketch {} to body {}", feature_id, body_id);
    } else {
        tracing::warn!("Failed to add sketch to body {}", body_id);
    }
}

/// Apply modification tool - disabled for V2 migration
#[allow(dead_code)]
pub fn apply_modification_tool(
    _state: &mut AppState,
    _sketch_id: &str,
    _sketch: &Sketch,
    _element_index: usize,
    _click_point: [f64; 2],
) {
    // Sketch modification tools disabled for V2 body architecture migration
}
