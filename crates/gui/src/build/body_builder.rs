//! Body mesh building from features

use shared::{Body, Feature, Transform};
use vcad::Part;

use crate::extrude::{extrude_mesh, revolve_mesh};
use crate::helpers::{combine_transforms, get_body_base_transform};
use crate::viewport::mesh::MeshData;

use super::extrude_builder::{create_extrude_part_from_sketch, create_extrude_part_full};
use super::mesh_extraction::{apply_selection_color, extract_mesh_data};
use super::primitives::{apply_transform, create_primitive};
use super::sketch_geometry::{sketch_bounds, sketch_center_3d};

/// Build MeshData directly from a body's features
pub fn build_body_mesh_data(body: &Body, selected: bool) -> Result<Option<MeshData>, String> {
    if body.features.is_empty() {
        return Err("Body has no features".to_string());
    }

    // Find the first base feature (can be at any position)
    let base_feature = body.features.iter().find(|f| {
        matches!(
            f,
            Feature::BasePrimitive { .. }
                | Feature::BaseExtrude { .. }
                | Feature::BaseRevolve { .. }
        )
    });

    // If no base feature found, check if we have only sketches
    let Some(base_feature) = base_feature else {
        // Only sketch features - no 3D geometry
        tracing::debug!(
            "Body {} has no base feature, skip mesh generation",
            body.id
        );
        return Ok(None);
    };

    // Check if there are any modification features
    let has_modifications = body
        .features
        .iter()
        .any(|f| matches!(f, Feature::Extrude { .. } | Feature::Revolve { .. }));

    // Build initial geometry from base feature
    let mut current_part: Option<Part> = match base_feature {
        Feature::BasePrimitive {
            id,
            primitive,
            transform,
        } => {
            let part = create_primitive(id, primitive);
            let part = apply_transform(part, transform);
            Some(part)
        }
        Feature::BaseExtrude {
            id,
            sketch,
            sketch_transform,
            height,
        } => {
            // If no modifications, return mesh directly
            if !has_modifications {
                let mut mesh = extrude_mesh(sketch, sketch_transform, *height)?;
                if selected {
                    apply_selection_color(&mut mesh);
                }
                return Ok(Some(mesh));
            }

            // Has modifications - need to create a CSG Part from the sketch bounds
            create_extrude_part_from_sketch(id, sketch, sketch_transform, *height)
        }
        Feature::BaseRevolve {
            id,
            sketch,
            sketch_transform,
            angle,
            segments,
        } => {
            // If no modifications, return mesh directly
            if !has_modifications {
                let mut mesh = revolve_mesh(sketch, sketch_transform, *angle, *segments)?;
                if selected {
                    apply_selection_color(&mut mesh);
                }
                return Ok(Some(mesh));
            }

            // Has modifications - approximate with sphere for now
            if let Some(bounds) = sketch_bounds(sketch) {
                let (min_x, min_y, max_x, max_y) = bounds;
                let radius = ((max_x - min_x).max(max_y - min_y) / 2.0).max(0.1);
                let part = Part::sphere(id, radius, *segments);
                let offset = sketch_center_3d(sketch, sketch_transform);
                let part = part.translate(offset[0] as f64, offset[1] as f64, offset[2] as f64);
                Some(part)
            } else {
                None
            }
        }
        _ => {
            return Err("Unexpected feature type".to_string());
        }
    };

    // Process modification features (Extrude, Revolve, etc.) - skip base features
    tracing::debug!("Processing modification features for body {}", body.id);
    for feature in &body.features {
        // Skip base features (already processed above)
        if matches!(
            feature,
            Feature::BasePrimitive { .. }
                | Feature::BaseExtrude { .. }
                | Feature::BaseRevolve { .. }
        ) {
            tracing::debug!("  Skipping base feature: {:?}", feature.id());
            continue;
        }

        match feature {
            Feature::Extrude {
                id: extrude_id,
                sketch_id,
                height,
                height_backward,
                cut,
                draft_angle,
            } => {
                process_extrude_feature(
                    body,
                    &mut current_part,
                    extrude_id,
                    sketch_id,
                    *height,
                    *height_backward,
                    *cut,
                    *draft_angle,
                );
            }
            Feature::Revolve { sketch_id, cut, .. } => {
                process_revolve_feature(body, &mut current_part, sketch_id, *cut);
            }
            Feature::Sketch { .. } => {
                // Sketches are reference geometry, don't modify the part
            }
            Feature::BooleanModify { .. } => {
                // TODO: Implement inter-body boolean
            }
            _ => {}
        }
    }

    // Convert final Part to MeshData
    match current_part {
        Some(part) => Ok(extract_mesh_data(&part, selected)),
        None => Ok(None),
    }
}

/// Process an Extrude feature and update the current part
fn process_extrude_feature(
    body: &Body,
    current_part: &mut Option<Part>,
    _extrude_id: &str,
    sketch_id: &str,
    height: f64,
    height_backward: f64,
    cut: bool,
    draft_angle: f64,
) {
    // Find the sketch in this body (can be Sketch or inside BaseExtrude/BaseRevolve)
    let sketch_data = find_sketch_in_body(body, sketch_id);

    if sketch_data.is_none() {
        tracing::warn!("Sketch {} not found in body {}", sketch_id, body.id);
        return;
    }

    if let Some((sketch, sketch_transform)) = sketch_data {
        // Combine body's base transform with sketch's local transform
        let body_transform = get_body_base_transform(body);
        let combined_transform = combine_transforms(&body_transform, sketch_transform);

        if let Some(base_part) = current_part.take() {
            // Create extrusion tool from sketch (respects plane orientation and cut direction)
            if let Some(tool_part) = create_extrude_part_full(
                "extrude_tool",
                sketch,
                &combined_transform,
                height,
                height_backward,
                cut,
                draft_angle,
            ) {
                let result = if cut {
                    base_part.difference(&tool_part)
                } else {
                    base_part.union(&tool_part)
                };
                *current_part = Some(result);
            } else {
                *current_part = Some(base_part);
            }
        }
    }
}

/// Process a Revolve feature and update the current part
fn process_revolve_feature(
    body: &Body,
    current_part: &mut Option<Part>,
    sketch_id: &str,
    cut: bool,
) {
    // Find the sketch and apply revolve
    let sketch_data = find_sketch_in_body(body, sketch_id);

    if let Some((sketch, sketch_transform)) = sketch_data {
        // Combine body's base transform with sketch's local transform
        let body_transform = get_body_base_transform(body);
        let combined_transform = combine_transforms(&body_transform, sketch_transform);

        if let Some(base_part) = current_part.take() {
            if let Some(bounds) = sketch_bounds(sketch) {
                let (min_x, min_y, max_x, max_y) = bounds;
                let width = (max_x - min_x).max(0.1);
                let depth = (max_y - min_y).max(0.1);

                let tool_part = vcad::centered_cube("revolve_tool", width, depth, depth);

                let offset = sketch_center_3d(sketch, &combined_transform);
                let tool_part = tool_part.translate(
                    offset[0] as f64,
                    offset[1] as f64,
                    offset[2] as f64,
                );

                if cut {
                    *current_part = Some(base_part.difference(&tool_part));
                } else {
                    *current_part = Some(base_part.union(&tool_part));
                }
            } else {
                *current_part = Some(base_part);
            }
        }
    }
}

/// Find a sketch in a body by its ID
fn find_sketch_in_body<'a>(
    body: &'a Body,
    sketch_id: &str,
) -> Option<(&'a shared::Sketch, &'a Transform)> {
    body.features.iter().find_map(|f| match f {
        Feature::Sketch { id, sketch, transform } if id == sketch_id => {
            Some((sketch, transform))
        }
        // Also check if sketch_id matches a BaseExtrude/BaseRevolve
        Feature::BaseExtrude {
            id,
            sketch,
            sketch_transform,
            ..
        } if id == sketch_id => {
            Some((sketch, sketch_transform))
        }
        Feature::BaseRevolve {
            id,
            sketch,
            sketch_transform,
            ..
        } if id == sketch_id => {
            Some((sketch, sketch_transform))
        }
        _ => None,
    })
}
