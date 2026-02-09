//! Extrude/revolve Part creation from sketches
//!
//! Uses Manifold::extrude for actual sketch profile extrusion.

use manifold_rs::Manifold;
use shared::{Sketch, SketchElement, SketchPlane, Transform};
use vcad::Part;

use super::primitives::DEFAULT_SEGMENTS;
use crate::extrude::extract_2d_profiles;
use crate::sketch::operations::{validate_sketch_for_extrusion, SketchValidation};

/// Determine if cut direction should be reversed based on face normal.
///
/// The default cut direction for each plane:
/// - XY: -Z (into the body from above)
/// - XZ: -Y (into the body from front)
/// - YZ: -X (into the body from right)
///
/// If the face normal points in the opposite direction (e.g., the sketch is on
/// a face facing negative Z), we need to reverse the cut direction to go into the body.
fn should_reverse_cut_direction(plane: &SketchPlane, face_normal: Option<[f64; 3]>) -> bool {
    let Some(normal) = face_normal else {
        return false;
    };

    match plane {
        SketchPlane::Xy => {
            // Default cut goes in -Z. If face normal points in -Z (normal.z < 0),
            // the body is above the sketch, so cut should go in +Z (reverse).
            normal[2] < 0.0
        }
        SketchPlane::Xz => {
            // Default cut goes in -Y. If face normal points in -Y (normal.y < 0),
            // the body is in front of the sketch, so cut should go in +Y (reverse).
            normal[1] < 0.0
        }
        SketchPlane::Yz => {
            // Default cut goes in -X. If face normal points in -X (normal.x < 0),
            // the body is to the right of the sketch, so cut should go in +X (reverse).
            normal[0] < 0.0
        }
    }
}

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
    create_extrude_part_full(id, sketch, transform, height, 0.0, is_cut, 0.0)
}

/// Validate sketch for extrusion and return validation result
#[allow(dead_code)]
pub fn validate_sketch(sketch: &Sketch) -> SketchValidation {
    validate_sketch_for_extrusion(sketch)
}

/// Create an extruded Part from sketch profile with all parameters
pub fn create_extrude_part_full(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    height_backward: f64,
    is_cut: bool,
    _draft_angle: f64, // Not yet implemented
) -> Option<Part> {
    if sketch.elements.is_empty() {
        return None;
    }

    let _pos = &transform.position;
    // For cuts, we extrude in the opposite direction (into the body)
    let dir = if is_cut { -1.0 } else { 1.0 };

    // Total extrusion height
    let total_height = height + height_backward;
    // Offset from sketch plane: positive = forward, negative = backward
    // If height=1, height_backward=0: center at +0.5 (forward only)
    // If height=1, height_backward=1: center at 0 (symmetric)
    // If height=0, height_backward=1: center at -0.5 (backward only)
    let center_offset = if is_cut {
        // For cuts: shift into body
        -(height - height_backward) / 2.0
    } else {
        // For boss: shift based on direction balance
        (height - height_backward) / 2.0
    };

    // Check if the sketch is a single circle - use cylinder for better CSG
    if let Some(circle_part) =
        try_create_cylinder_from_sketch_full(id, sketch, transform, total_height, height_backward, dir)
    {
        return Some(circle_part);
    }

    // Try profile extrusion for all planes
    if let Some(part) = try_create_profile_extrusion(
        id, sketch, transform, total_height, height_backward, is_cut, center_offset,
    ) {
        return Some(part);
    }

    // Fallback to bounding box if profile extraction fails
    create_bounding_box_fallback(id, sketch, transform, total_height, is_cut, center_offset)
}

/// Try to create an extruded Part from actual sketch profiles using Manifold::extrude
fn try_create_profile_extrusion(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    height_backward: f64,
    is_cut: bool,
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

    // Filter profiles - need at least 3 points for a valid polygon
    // Manifold auto-closes polygons, so we don't need to check for closure
    // Invalid/open profiles will produce empty manifolds (filtered later)
    let profiles: Vec<Vec<[f64; 2]>> = profiles
        .into_iter()
        .filter(|profile| {
            if profile.len() < 3 {
                tracing::warn!("Profile has less than 3 points, skipping");
                return false;
            }

            // Calculate signed area to filter degenerate profiles (shoelace formula)
            let n = profile.len();
            let area: f64 = (0..n)
                .map(|i| {
                    let j = (i + 1) % n;
                    (profile[j][0] - profile[i][0]) * (profile[j][1] + profile[i][1])
                })
                .sum();
            let area = area.abs() / 2.0;

            if area < 1e-6 {
                tracing::warn!("Profile has negligible area ({:.6}), skipping", area);
                return false;
            }

            true
        })
        .collect();

    if profiles.is_empty() {
        tracing::warn!("No valid profiles available for extrusion");
        return None;
    }

    // Extrude each profile separately and union them together
    // (Manifold interprets multiple polygons as outer+holes, not separate shapes)
    let mut result_manifold: Option<Manifold> = None;

    for (pi, profile) in profiles.iter().enumerate() {
        // Convert profile to format for Manifold::extrude
        let polygon_data: Vec<f64> = match sketch.plane {
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
                // YZ plane: sketch (x,y) -> world (extrude, y, z)
                // Using rotate(0, -90, 0): Manifold X -> world Z, Manifold Y -> world Y, Manifold Z -> world -X
                // So: Manifold X = world Z = sketch_y, Manifold Y = world Y = sketch_x
                // Extrusion goes along world -X (into body from positive X)
                profile.iter().flat_map(|p| vec![p[1], p[0]]).collect()
            }
        };

        let polygon_slice: &[f64] = &polygon_data;

        // Create the manifold extrusion for this profile
        let manifold = Manifold::extrude(
            &[polygon_slice],
            height.abs(),
            1,    // n_divisions
            0.0,  // twist_degrees
            1.0,  // scale_top_x
            1.0,  // scale_top_y
        );

        if manifold.is_empty() {
            tracing::warn!("Manifold::extrude returned empty geometry for profile {}", pi);
            continue;
        }

        // Union with result
        result_manifold = match result_manifold {
            Some(existing) => Some(existing.union(&manifold)),
            None => Some(manifold),
        };
    }

    let manifold = match result_manifold {
        Some(m) => m,
        None => {
            tracing::warn!("No valid extrusions created from {} profiles", profiles.len());
            return None;
        }
    };

    let pos = &transform.position;

    // Transform based on sketch plane
    // Manifold creates geometry in XY plane extruded along Z (from 0 to height)
    // After rotation, extrusion spans [0, height] along the extrusion axis
    // For cuts: shift so tool is INSIDE the body (ends at sketch plane)
    // For boss: shift so tool is OUTSIDE the body (starts at sketch plane)
    // For cuts: extend slightly past the surface to ensure clean cut (avoid floating-point issues)

    // Check if we need to reverse cut direction based on face normal
    let reverse_cut = is_cut && should_reverse_cut_direction(&sketch.plane, sketch.face_normal);

    // Overshoot direction depends on cut direction
    let cut_overshoot = if is_cut {
        if reverse_cut { -0.01 } else { 0.01 }
    } else {
        0.0
    };

    // Shift to account for backward extrusion
    // Manifold extrudes from 0 to height, we need to shift by -height_backward
    let backward_shift = -height_backward;

    let final_manifold = match sketch.plane {
        SketchPlane::Xy => {
            // XY plane: extrusion along Z
            let z_shift = if is_cut {
                if reverse_cut { backward_shift } else { -height.abs() + backward_shift }
            } else {
                backward_shift
            };
            manifold
                .translate(0.0, 0.0, z_shift)
                .translate(pos[0], pos[1], sketch.offset + pos[2] + cut_overshoot)
        }
        SketchPlane::Xz => {
            // XZ plane: extrusion along Y (after rotation)
            let rotated = manifold.rotate(-90.0, 0.0, 0.0);
            let y_shift = if is_cut {
                if reverse_cut { backward_shift } else { -height.abs() + backward_shift }
            } else {
                backward_shift
            };
            rotated
                .translate(0.0, y_shift, 0.0)
                .translate(pos[0], sketch.offset + pos[1] + cut_overshoot, pos[2])
        }
        SketchPlane::Yz => {
            // YZ plane: extrusion along X (after rotation)
            // rotate(0, -90, 0) makes Manifold Z become world -X
            let rotated = manifold.rotate(0.0, -90.0, 0.0);
            let x_shift = if is_cut {
                if reverse_cut { height.abs() - backward_shift } else { -backward_shift }
            } else {
                height.abs() - backward_shift
            };
            rotated
                .translate(x_shift, 0.0, 0.0)
                .translate(sketch.offset + pos[0] + cut_overshoot, pos[1], pos[2])
        }
    };

    Some(Part::new(id, final_manifold))
}

/// Fallback to bounding box extrusion when profile extraction fails
fn create_bounding_box_fallback(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    _is_cut: bool,
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

    Some(part.translate(translate.0, translate.1, translate.2))
}

/// Try to create a cylinder Part if the sketch contains a single circle
fn try_create_cylinder_from_sketch_full(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
    height_backward: f64,
    dir: f64,
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
    let is_cut = dir < 0.0;

    // Check if we need to reverse cut direction based on face normal
    let reverse_cut = is_cut && should_reverse_cut_direction(&sketch.plane, sketch.face_normal);

    // Center offset accounts for backward extrusion
    // Cylinder is centered, so offset = (height_forward - height_backward) / 2
    let forward_height = height - height_backward; // This is the "forward only" portion
    let center_offset = if is_cut {
        if reverse_cut {
            forward_height / 2.0
        } else {
            -forward_height / 2.0
        }
    } else {
        forward_height / 2.0
    };
    let cut_overshoot = if is_cut {
        if reverse_cut { -0.01 } else { 0.01 }
    } else {
        0.0
    };

    let cyl = vcad::centered_cylinder(id, radius, height.abs(), DEFAULT_SEGMENTS);

    let part = match sketch.plane {
        SketchPlane::Xy => {
            let tx = center.x + pos[0];
            let ty = center.y + pos[1];
            let tz = sketch.offset + pos[2] + center_offset + cut_overshoot;
            cyl.translate(tx, ty, tz)
        }
        SketchPlane::Xz => {
            let rotated = cyl.rotate(90.0, 0.0, 0.0);
            let tx = center.x + pos[0];
            let ty = sketch.offset + pos[1] + center_offset + cut_overshoot;
            let tz = center.y + pos[2];
            rotated.translate(tx, ty, tz)
        }
        SketchPlane::Yz => {
            let rotated = cyl.rotate(0.0, -90.0, 0.0);
            // For cut: center_offset is negative (-height/2), cylinder extends into body (-X)
            // For reversed cut: center_offset is positive (+height/2), cylinder extends outward (+X)
            let tx = sketch.offset + pos[0] + center_offset + cut_overshoot;
            let ty = center.x + pos[1];
            let tz = center.y + pos[2];
            rotated.translate(tx, ty, tz)
        }
    };

    Some(part)
}

/// Create a revolved Part from sketch profile
#[allow(dead_code)]
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
            face_normal: None,
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
            face_normal: None,
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
            face_normal: None,
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
            face_normal: None,
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
            face_normal: None,
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
            face_normal: None,
        };
        let part = create_extrude_part_from_sketch("test", &sketch, &identity(), 1.0);
        assert!(part.is_some());
    }
}
