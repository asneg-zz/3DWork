//! Extrude/revolve Part creation from sketches

use shared::{Sketch, SketchElement, SketchPlane, Transform};
use vcad::Part;

use super::primitives::DEFAULT_SEGMENTS;
use super::sketch_geometry::sketch_bounds;

/// Create an extruded Part from sketch bounds, respecting sketch plane orientation
/// For cuts (negative height or cut flag), the extrusion goes in the opposite direction
pub fn create_extrude_part_from_sketch(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
) -> Option<Part> {
    create_extrude_part_from_sketch_ex(id, sketch, transform, height, false)
}

/// Create an extruded Part from sketch bounds, with optional cut direction
pub fn create_extrude_part_from_sketch_ex(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    is_cut: bool,
) -> Option<Part> {
    // Use default values for symmetric and draft_angle (not yet supported through this entry point)
    create_extrude_part_full(id, sketch, transform, height, is_cut, false, 0.0)
}

/// Create an extruded Part from sketch bounds with all parameters
pub fn create_extrude_part_full(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    is_cut: bool,
    symmetric: bool,
    _draft_angle: f64, // Not yet implemented
) -> Option<Part> {
    if sketch.elements.is_empty() {
        return None;
    }

    let pos = &transform.position;
    // For cuts, we extrude in the opposite direction (into the body)
    let dir = if is_cut { -1.0 } else { 1.0 };
    // For symmetric extrusion, center on sketch plane (no offset)
    let center_offset = if symmetric { 0.0 } else { dir * height / 2.0 };

    // Check if the sketch is a single circle - use cylinder for better CSG
    if let Some(circle_part) =
        try_create_cylinder_from_sketch_full(id, sketch, transform, height, dir, symmetric)
    {
        return Some(circle_part);
    }

    // Fallback to bounding box for other shapes
    let bounds = sketch_bounds(sketch)?;
    let (min_x, min_y, max_x, max_y) = bounds;
    let width = (max_x - min_x).max(0.1);
    let depth = (max_y - min_y).max(0.1);
    let cx = (min_x + max_x) / 2.0;
    let cy = (min_y + max_y) / 2.0;

    // Create cube with dimensions and position based on sketch plane
    // Extrusion direction is normal to the sketch plane
    // Note: sketch.offset is always in LOCAL coords, add body position to get world position
    let (part, translate) = match sketch.plane {
        SketchPlane::Xy => {
            // XY plane: extrude along Z axis
            let part = vcad::centered_cube(id, width, depth, height.abs());
            let tx = cx + pos[0];
            let ty = cy + pos[1];
            let tz = sketch.offset + pos[2] + center_offset;
            (part, (tx, ty, tz))
        }
        SketchPlane::Xz => {
            // XZ plane: extrude along Y axis
            let part = vcad::centered_cube(id, width, height.abs(), depth);
            let tx = cx + pos[0];
            let ty = sketch.offset + pos[1] + center_offset;
            let tz = cy + pos[2];
            (part, (tx, ty, tz))
        }
        SketchPlane::Yz => {
            // YZ plane: extrude along X axis
            let part = vcad::centered_cube(id, height.abs(), width, depth);
            let tx = sketch.offset + pos[0] + center_offset;
            let ty = cx + pos[1];
            let tz = cy + pos[2];
            (part, (tx, ty, tz))
        }
    };

    tracing::info!(
        "  Created extrude Part (box): plane={:?}, size=({:.2}x{:.2}x{:.2}), pos=({:.2}, {:.2}, {:.2}), cut={}, symmetric={}",
        sketch.plane, width, depth, height, translate.0, translate.1, translate.2, is_cut, symmetric
    );

    Some(part.translate(translate.0, translate.1, translate.2))
}

/// Try to create a cylinder Part if the sketch contains a single circle (with symmetric support)
fn try_create_cylinder_from_sketch_full(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    dir: f64,
    symmetric: bool,
) -> Option<Part> {
    // Check if it's a single circle
    if sketch.elements.len() != 1 {
        return None;
    }

    let circle = match &sketch.elements[0] {
        SketchElement::Circle { center, radius } => Some((center, *radius)),
        _ => None,
    }?;

    let (center, radius) = circle;
    let pos = &transform.position;
    // For symmetric extrusion, center on sketch plane (no offset)
    let center_offset = if symmetric {
        0.0
    } else {
        dir * height.abs() / 2.0
    };

    tracing::info!(
        "    Circle in sketch: center=({:.2}, {:.2}), radius={:.2}, sketch_offset={}, dir={}, symmetric={}",
        center.x, center.y, radius, sketch.offset, dir, symmetric
    );

    // Use centered_cylinder for proper centering, then position based on plane
    // The cylinder will be centered at origin along Z, we rotate and translate it
    let cyl = vcad::centered_cylinder(id, radius, height.abs(), DEFAULT_SEGMENTS);

    let part = match sketch.plane {
        SketchPlane::Xy => {
            // XY plane: cylinder along Z axis (already correct orientation)
            // sketch.offset is LOCAL, add body position
            let tx = center.x + pos[0];
            let ty = center.y + pos[1];
            let tz = sketch.offset + pos[2] + center_offset;
            tracing::info!(
                "  XY cylinder at ({:.2}, {:.2}, {:.2}), sketch.offset={:.2}, pos[2]={:.2}, symmetric={}",
                tx, ty, tz, sketch.offset, pos[2], symmetric
            );
            cyl.translate(tx, ty, tz)
        }
        SketchPlane::Xz => {
            // XZ plane: need cylinder along Y axis
            let rotated = cyl.rotate(90.0, 0.0, 0.0);
            // sketch.offset is LOCAL, add body position
            let tx = center.x + pos[0];
            let ty = sketch.offset + pos[1] + center_offset;
            let tz = center.y + pos[2];
            tracing::info!(
                "  XZ cylinder at ({:.2}, {:.2}, {:.2}), sketch.offset={:.2}, pos[1]={:.2}, symmetric={}",
                tx, ty, tz, sketch.offset, pos[1], symmetric
            );
            rotated.translate(tx, ty, tz)
        }
        SketchPlane::Yz => {
            // YZ plane: need cylinder along X axis
            let rotated = cyl.rotate(0.0, 90.0, 0.0);
            // sketch.offset is LOCAL, add body position
            let tx = sketch.offset + pos[0] + center_offset;
            let ty = center.x + pos[1];
            let tz = center.y + pos[2];
            tracing::info!(
                "  YZ cylinder at ({:.2}, {:.2}, {:.2}), sketch.offset={:.2}, pos[0]={:.2}, symmetric={}",
                tx, ty, tz, sketch.offset, pos[0], symmetric
            );
            rotated.translate(tx, ty, tz)
        }
    };

    tracing::info!(
        "  Created cylinder: plane={:?}, radius={:.2}, height={:.2}, cut={}",
        sketch.plane,
        radius,
        height,
        dir < 0.0
    );

    Some(part)
}
