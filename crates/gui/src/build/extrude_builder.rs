//! Extrude/revolve Part creation from sketches
//!
//! Uses Manifold::extrude for actual sketch profile extrusion.

use manifold_rs::Manifold;
use shared::{Sketch, SketchElement, SketchPlane, Transform};
use vcad::Part;

use super::primitives::DEFAULT_SEGMENTS;
use crate::extrude::extract_2d_profiles;
use crate::sketch::operations::{validate_sketch_for_extrusion, SketchValidation};

/// Create an extruded Part from sketch profile, respecting sketch plane orientation
/// For cuts (negative height or cut flag), the extrusion goes in the opposite direction
pub fn create_extrude_part_from_sketch(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
) -> Option<Part> {
    create_extrude_part_from_sketch_ex(id, sketch, transform, height, false)
}

/// Create an extruded Part from sketch profile, with optional cut direction
pub fn create_extrude_part_from_sketch_ex(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    is_cut: bool,
) -> Option<Part> {
    create_extrude_part_full(id, sketch, transform, height, is_cut, false, 0.0)
}

/// Validate sketch for extrusion and return validation result
pub fn validate_sketch(sketch: &Sketch) -> SketchValidation {
    validate_sketch_for_extrusion(sketch)
}

/// Create an extruded Part from sketch profile with all parameters
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

    let _pos = &transform.position;
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

    // Try profile extrusion for all planes
    if let Some(part) = try_create_profile_extrusion(
        id, sketch, transform, height, is_cut, symmetric, center_offset,
    ) {
        return Some(part);
    }

    // Fallback to bounding box if profile extraction fails
    create_bounding_box_fallback(id, sketch, transform, height, is_cut, symmetric, center_offset)
}

/// Try to create an extruded Part from actual sketch profiles using Manifold::extrude
fn try_create_profile_extrusion(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    is_cut: bool,
    symmetric: bool,
    _center_offset: f64,
) -> Option<Part> {
    // Extract 2D profiles from sketch
    let profiles = match extract_2d_profiles(&sketch.elements) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("Profile extraction failed: {}", e);
            return None;
        }
    };

    if profiles.is_empty() {
        tracing::warn!("No profiles extracted from sketch");
        return None;
    }

    tracing::info!("Extracted {} profiles, first has {} points", profiles.len(), profiles.first().map(|p| p.len()).unwrap_or(0));

    // Convert profiles to format for Manifold::extrude
    // Manifold::extrude creates profile in XY plane and extrudes along Z
    // For non-XY planes, we need to transform coordinates and reverse winding
    let polygon_data: Vec<Vec<f64>> = profiles
        .iter()
        .map(|profile| {
            match sketch.plane {
                SketchPlane::Xy => {
                    // XY plane: use coordinates as-is
                    profile.iter().flat_map(|p| vec![p[0], p[1]]).collect()
                }
                SketchPlane::Xz => {
                    // XZ plane: sketch (x,y) -> world (x, extrude, y)
                    // Use (x, -y) to get correct Z after rotation, reverse for winding
                    let mut pts: Vec<[f64; 2]> = profile.iter().map(|p| [p[0], -p[1]]).collect();
                    pts.reverse(); // Fix winding order after coordinate flip
                    pts.iter().flat_map(|p| vec![p[0], p[1]]).collect()
                }
                SketchPlane::Yz => {
                    // YZ plane: sketch (x,y) -> world (extrude, x, y)
                    // Use (-y, x) to get correct Y,Z after rotation, reverse for winding
                    let mut pts: Vec<[f64; 2]> = profile.iter().map(|p| [-p[1], p[0]]).collect();
                    pts.reverse(); // Fix winding order after coordinate flip
                    pts.iter().flat_map(|p| vec![p[0], p[1]]).collect()
                }
            }
        })
        .collect();

    // Create slice references for Manifold::extrude
    let polygon_slices: Vec<&[f64]> = polygon_data.iter().map(|v| v.as_slice()).collect();

    tracing::info!("Calling Manifold::extrude with {} polygons, height={}, plane={:?}",
        polygon_slices.len(), height.abs(), sketch.plane);

    // Create the manifold extrusion
    // Extrusion is always along Z axis, we'll rotate it to match the sketch plane
    let manifold = Manifold::extrude(
        &polygon_slices,
        height.abs(),
        1,    // n_divisions
        0.0,  // twist_degrees
        1.0,  // scale_top_x
        1.0,  // scale_top_y
    );

    if manifold.is_empty() {
        tracing::warn!("Manifold::extrude returned empty geometry for {} polygons", polygon_slices.len());
        return None;
    }

    tracing::info!("Manifold::extrude succeeded!");

    let pos = &transform.position;

    // Transform based on sketch plane
    // Manifold creates geometry in XY plane extruded along Z (from 0 to height)
    let final_manifold = match sketch.plane {
        SketchPlane::Xy => {
            let m = if symmetric {
                manifold.translate(0.0, 0.0, -height.abs() / 2.0)
            } else if is_cut {
                manifold.translate(0.0, 0.0, -height.abs())
            } else {
                manifold
            };
            m.translate(pos[0], pos[1], sketch.offset + pos[2])
        }
        SketchPlane::Xz => {
            // Rotate -90° around X to make Z become Y (extrusion direction)
            let rotated = manifold.rotate(-90.0, 0.0, 0.0);
            // After rotation: extrusion goes from Y=0 to Y=height
            let m = if symmetric {
                rotated.translate(0.0, -height.abs() / 2.0, 0.0)
            } else if is_cut {
                rotated.translate(0.0, -height.abs(), 0.0)
            } else {
                rotated
            };
            m.translate(pos[0], sketch.offset + pos[1], pos[2])
        }
        SketchPlane::Yz => {
            // Rotate 90° around Y to make Z become X (extrusion direction)
            let rotated = manifold.rotate(0.0, 90.0, 0.0);
            // After rotation: extrusion goes from X=0 to X=height
            let m = if symmetric {
                rotated.translate(-height.abs() / 2.0, 0.0, 0.0)
            } else if is_cut {
                rotated.translate(-height.abs(), 0.0, 0.0)
            } else {
                rotated
            };
            m.translate(sketch.offset + pos[0], pos[1], pos[2])
        }
    };

    tracing::info!(
        "Created profile extrusion: plane={:?}, height={:.2}, profiles={}, symmetric={}, cut={}",
        sketch.plane,
        height,
        profiles.len(),
        symmetric,
        is_cut
    );

    Some(Part::new(id, final_manifold))
}

/// Fallback to bounding box extrusion when profile extraction fails
fn create_bounding_box_fallback(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    is_cut: bool,
    symmetric: bool,
    center_offset: f64,
) -> Option<Part> {
    use super::sketch_geometry::sketch_bounds;

    let bounds = sketch_bounds(sketch)?;
    let (min_x, min_y, max_x, max_y) = bounds;
    let width = (max_x - min_x).max(0.1);
    let depth = (max_y - min_y).max(0.1);
    let cx = (min_x + max_x) / 2.0;
    let cy = (min_y + max_y) / 2.0;
    let pos = &transform.position;

    let (part, translate) = match sketch.plane {
        SketchPlane::Xy => {
            let part = vcad::centered_cube(id, width, depth, height.abs());
            let tx = cx + pos[0];
            let ty = cy + pos[1];
            let tz = sketch.offset + pos[2] + center_offset;
            (part, (tx, ty, tz))
        }
        SketchPlane::Xz => {
            let part = vcad::centered_cube(id, width, height.abs(), depth);
            let tx = cx + pos[0];
            let ty = sketch.offset + pos[1] + center_offset;
            let tz = cy + pos[2];
            (part, (tx, ty, tz))
        }
        SketchPlane::Yz => {
            let part = vcad::centered_cube(id, height.abs(), width, depth);
            let tx = sketch.offset + pos[0] + center_offset;
            let ty = cx + pos[1];
            let tz = cy + pos[2];
            (part, (tx, ty, tz))
        }
    };

    tracing::info!(
        "Created extrude Part (fallback box): plane={:?}, size=({:.2}x{:.2}x{:.2}), cut={}, symmetric={}",
        sketch.plane, width, depth, height, is_cut, symmetric
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
    let center_offset = if symmetric {
        0.0
    } else {
        dir * height.abs() / 2.0
    };

    tracing::info!(
        "Circle in sketch: center=({:.2}, {:.2}), radius={:.2}, sketch_offset={}, dir={}, symmetric={}",
        center.x, center.y, radius, sketch.offset, dir, symmetric
    );

    let cyl = vcad::centered_cylinder(id, radius, height.abs(), DEFAULT_SEGMENTS);

    let part = match sketch.plane {
        SketchPlane::Xy => {
            let tx = center.x + pos[0];
            let ty = center.y + pos[1];
            let tz = sketch.offset + pos[2] + center_offset;
            cyl.translate(tx, ty, tz)
        }
        SketchPlane::Xz => {
            let rotated = cyl.rotate(90.0, 0.0, 0.0);
            let tx = center.x + pos[0];
            let ty = sketch.offset + pos[1] + center_offset;
            let tz = center.y + pos[2];
            rotated.translate(tx, ty, tz)
        }
        SketchPlane::Yz => {
            let rotated = cyl.rotate(0.0, 90.0, 0.0);
            let tx = sketch.offset + pos[0] + center_offset;
            let ty = center.x + pos[1];
            let tz = center.y + pos[2];
            rotated.translate(tx, ty, tz)
        }
    };

    tracing::info!(
        "Created cylinder: plane={:?}, radius={:.2}, height={:.2}, cut={}",
        sketch.plane, radius, height, dir < 0.0
    );

    Some(part)
}

/// Create a revolved Part from sketch profile
pub fn create_revolve_part_from_sketch(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    angle_deg: f64,
    segments: u32,
) -> Option<Part> {
    if sketch.elements.is_empty() {
        return None;
    }

    // Extract 2D profiles from sketch
    let profiles = extract_2d_profiles(&sketch.elements).ok()?;

    if profiles.is_empty() {
        return None;
    }

    // Convert profiles to format for Manifold::revolve
    let polygon_data: Vec<Vec<f64>> = profiles
        .iter()
        .map(|profile| {
            profile
                .iter()
                .flat_map(|p| vec![p[0], p[1]])
                .collect::<Vec<f64>>()
        })
        .collect();

    let polygon_slices: Vec<&[f64]> = polygon_data.iter().map(|v| v.as_slice()).collect();

    // Create the manifold revolution around Y axis (standard convention)
    let manifold = Manifold::revolve(
        &polygon_slices,
        segments,
        angle_deg,
    );

    if manifold.is_empty() {
        tracing::warn!("Manifold::revolve returned empty geometry");
        return None;
    }

    let pos = &transform.position;

    // Transform based on sketch plane
    let (final_manifold, translate) = match sketch.plane {
        SketchPlane::Xy => {
            // For XY sketch, revolve around the Y axis
            let tx = pos[0];
            let ty = pos[1];
            let tz = sketch.offset + pos[2];
            (manifold, (tx, ty, tz))
        }
        SketchPlane::Xz => {
            let rotated = manifold.rotate(-90.0, 0.0, 0.0);
            let tx = pos[0];
            let ty = sketch.offset + pos[1];
            let tz = pos[2];
            (rotated, (tx, ty, tz))
        }
        SketchPlane::Yz => {
            let rotated = manifold.rotate(0.0, 90.0, 0.0);
            let tx = sketch.offset + pos[0];
            let ty = pos[1];
            let tz = pos[2];
            (rotated, (tx, ty, tz))
        }
    };

    let final_manifold = final_manifold.translate(translate.0, translate.1, translate.2);

    tracing::info!(
        "Created revolve: plane={:?}, angle={:.2}, segments={}, profiles={}",
        sketch.plane, angle_deg, segments, profiles.len()
    );

    Some(Part::new(id, final_manifold))
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared::{Point2D, SketchPlane};

    fn identity() -> Transform {
        Transform::new()
    }

    #[test]
    fn test_validate_empty_sketch() {
        let sketch = Sketch {
            plane: SketchPlane::Xy,
            offset: 0.0,
            elements: vec![],
        };
        let validation = validate_sketch(&sketch);
        assert!(!validation.is_valid);
        assert!(validation.error_message.is_some());
    }

    #[test]
    fn test_validate_single_circle() {
        let sketch = Sketch {
            plane: SketchPlane::Xy,
            offset: 0.0,
            elements: vec![SketchElement::Circle {
                center: Point2D { x: 0.0, y: 0.0 },
                radius: 1.0,
            }],
        };
        let validation = validate_sketch(&sketch);
        assert!(validation.is_valid);
        assert!(validation.is_closed);
        assert!(!validation.has_self_intersections);
    }

    #[test]
    fn test_validate_single_rectangle() {
        let sketch = Sketch {
            plane: SketchPlane::Xy,
            offset: 0.0,
            elements: vec![SketchElement::Rectangle {
                corner: Point2D { x: 0.0, y: 0.0 },
                width: 2.0,
                height: 1.0,
            }],
        };
        let validation = validate_sketch(&sketch);
        assert!(validation.is_valid);
        assert!(validation.is_closed);
    }

    #[test]
    fn test_extrude_circle_creates_cylinder() {
        let sketch = Sketch {
            plane: SketchPlane::Xy,
            offset: 0.0,
            elements: vec![SketchElement::Circle {
                center: Point2D { x: 0.0, y: 0.0 },
                radius: 1.0,
            }],
        };
        let part = create_extrude_part_from_sketch("test", &sketch, &identity(), 2.0);
        assert!(part.is_some());
    }

    #[test]
    fn test_extrude_rectangle_creates_profile() {
        let sketch = Sketch {
            plane: SketchPlane::Xy,
            offset: 0.0,
            elements: vec![SketchElement::Rectangle {
                corner: Point2D { x: -1.0, y: -1.0 },
                width: 2.0,
                height: 2.0,
            }],
        };
        let part = create_extrude_part_from_sketch("test", &sketch, &identity(), 1.0);
        assert!(part.is_some());
    }

    #[test]
    fn test_extrude_closed_lines() {
        // Create a closed triangle from 3 lines
        let sketch = Sketch {
            plane: SketchPlane::Xy,
            offset: 0.0,
            elements: vec![
                SketchElement::Line {
                    start: Point2D { x: 0.0, y: 0.0 },
                    end: Point2D { x: 2.0, y: 0.0 },
                },
                SketchElement::Line {
                    start: Point2D { x: 2.0, y: 0.0 },
                    end: Point2D { x: 1.0, y: 2.0 },
                },
                SketchElement::Line {
                    start: Point2D { x: 1.0, y: 2.0 },
                    end: Point2D { x: 0.0, y: 0.0 },
                },
            ],
        };
        let part = create_extrude_part_from_sketch("test", &sketch, &identity(), 1.0);
        assert!(part.is_some());
    }
}
