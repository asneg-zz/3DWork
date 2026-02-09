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

    tracing::info!(
        "Building mesh for body {}, base feature: {}",
        body.id,
        base_feature.id()
    );

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
            tracing::info!("  Base is Primitive: {:?}", primitive);
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
            tracing::info!("  Base is BaseExtrude, height={}", height);

            // If no modifications, return mesh directly
            if !has_modifications {
                tracing::info!("  No modifications, returning extrude mesh directly");
                let mut mesh = extrude_mesh(sketch, sketch_transform, *height)?;
                if selected {
                    apply_selection_color(&mut mesh);
                }
                return Ok(Some(mesh));
            }

            // Has modifications - need to create a CSG Part from the sketch bounds
            tracing::info!(
                "  Has modifications, creating Part from sketch bounds (plane={:?}, offset={}, pos={:?})",
                sketch.plane, sketch.offset, sketch_transform.position
            );
            create_extrude_part_from_sketch(id, sketch, sketch_transform, *height)
        }
        Feature::BaseRevolve {
            id,
            sketch,
            sketch_transform,
            angle,
            segments,
        } => {
            tracing::info!("  Base is BaseRevolve, angle={}", angle);

            // If no modifications, return mesh directly
            if !has_modifications {
                tracing::info!("  No modifications, returning revolve mesh directly");
                let mut mesh = revolve_mesh(sketch, sketch_transform, *angle, *segments)?;
                if selected {
                    apply_selection_color(&mut mesh);
                }
                return Ok(Some(mesh));
            }

            // Has modifications - approximate with sphere for now
            tracing::info!("  Has modifications, creating approximate Part");
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
                cut,
                symmetric,
                draft_angle,
            } => {
                process_extrude_feature(
                    body,
                    &mut current_part,
                    extrude_id,
                    sketch_id,
                    *height,
                    *cut,
                    *symmetric,
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
    extrude_id: &str,
    sketch_id: &str,
    height: f64,
    cut: bool,
    symmetric: bool,
    draft_angle: f64,
) {
    tracing::info!(
        "  Processing Extrude: id={}, sketch_id={}, height={}, cut={}, symmetric={}, draft={}",
        extrude_id,
        sketch_id,
        height,
        cut,
        symmetric,
        draft_angle
    );

    // Find the sketch in this body (can be Sketch or inside BaseExtrude/BaseRevolve)
    let sketch_data = find_sketch_in_body(body, sketch_id);

    if sketch_data.is_none() {
        tracing::warn!("    Sketch not found! Available features:");
        for f in &body.features {
            tracing::warn!(
                "      - {:?} id={}",
                std::mem::discriminant(f),
                f.id()
            );
        }
    }

    if let Some((sketch, sketch_transform)) = sketch_data {
        // Combine body's base transform with sketch's local transform
        let body_transform = get_body_base_transform(body);
        let combined_transform = combine_transforms(&body_transform, sketch_transform);

        tracing::info!(
            "    Sketch has {} elements, plane={:?}, offset={}, sketch_pos={:?}, body_pos={:?}, combined_pos={:?}",
            sketch.elements.len(), sketch.plane, sketch.offset,
            sketch_transform.position, body_transform.position, combined_transform.position
        );
        if let Some(base_part) = current_part.take() {
            // Create extrusion tool from sketch (respects plane orientation and cut direction)
            if let Some(tool_part) = create_extrude_part_full(
                "extrude_tool",
                sketch,
                &combined_transform,
                height,
                cut,
                symmetric,
                draft_angle,
            ) {
                // Debug: log bounding boxes
                let (base_min, base_max) = base_part.bounding_box();
                let (tool_min, tool_max) = tool_part.bounding_box();
                tracing::info!("    Base bbox: ({:.2},{:.2},{:.2}) - ({:.2},{:.2},{:.2})",
                    base_min[0], base_min[1], base_min[2], base_max[0], base_max[1], base_max[2]);
                tracing::info!("    Tool bbox: ({:.2},{:.2},{:.2}) - ({:.2},{:.2},{:.2})",
                    tool_min[0], tool_min[1], tool_min[2], tool_max[0], tool_max[1], tool_max[2]);

                if cut {
                    tracing::info!("    Performing DIFFERENCE (cut)");
                    let base_tris = base_part.num_triangles();
                    let tool_tris = tool_part.num_triangles();
                    let result = base_part.difference(&tool_part);
                    let result_tris = result.num_triangles();
                    let (res_min, res_max) = result.bounding_box();
                    tracing::info!("    Result bbox: ({:.2},{:.2},{:.2}) - ({:.2},{:.2},{:.2}), empty={}, tris: {} - {} = {}",
                        res_min[0], res_min[1], res_min[2], res_max[0], res_max[1], res_max[2], result.is_empty(),
                        base_tris, tool_tris, result_tris);
                    *current_part = Some(result);
                } else {
                    tracing::info!("    Performing UNION (boss)");
                    *current_part = Some(base_part.union(&tool_part));
                }
            } else {
                tracing::warn!("    No sketch bounds - sketch is empty?");
                *current_part = Some(base_part);
            }
        } else {
            tracing::warn!("    No base part to apply extrude to!");
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
            tracing::info!("    Found Sketch feature with id={}", id);
            Some((sketch, transform))
        }
        // Also check if sketch_id matches a BaseExtrude/BaseRevolve
        Feature::BaseExtrude {
            id,
            sketch,
            sketch_transform,
            ..
        } if id == sketch_id => {
            tracing::info!("    Found BaseExtrude feature with id={}", id);
            Some((sketch, sketch_transform))
        }
        Feature::BaseRevolve {
            id,
            sketch,
            sketch_transform,
            ..
        } if id == sketch_id => {
            tracing::info!("    Found BaseRevolve feature with id={}", id);
            Some((sketch, sketch_transform))
        }
        _ => None,
    })
}
