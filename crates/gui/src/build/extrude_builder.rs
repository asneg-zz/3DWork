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
/// The face normal points OUTWARD from the body.
/// To cut INTO the body, we should cut in the OPPOSITE direction of the face normal.
///
/// The default cut direction for each plane:
/// - XY: -Z (into the body from above)
/// - XZ: -Y (into the body from front)
/// - YZ: -X (into the body from right)
///
/// We check if the face normal points in the same direction as the default cut.
/// If the dot product with the default cut direction is POSITIVE, the face normal
/// points AGAINST the default cut direction, meaning body is behind us - DON'T reverse.
/// If the dot product is NEGATIVE, face normal points WITH the default cut direction,
/// meaning body is in front of us - REVERSE the cut.
fn should_reverse_cut_direction(plane: &SketchPlane, face_normal: Option<[f64; 3]>) -> bool {
    let Some(normal) = face_normal else {
        return false;
    };

    // Default cut directions (negative axis)
    let default_cut_dir = match plane {
        SketchPlane::Xy => [0.0, 0.0, -1.0], // -Z
        SketchPlane::Xz => [0.0, -1.0, 0.0], // -Y
        SketchPlane::Yz => [-1.0, 0.0, 0.0], // -X
    };

    // The cut direction into the body = -face_normal (opposite to face normal)
    // We need to reverse if -face_normal doesn't match default_cut_dir
    //
    // dot(face_normal, default_cut) > 0 means they point same direction
    // → -face_normal points opposite to default_cut → REVERSE needed
    //
    // dot(face_normal, default_cut) < 0 means they point opposite directions
    // → -face_normal points same as default_cut → NO REVERSE needed
    let dot = normal[0] * default_cut_dir[0]
        + normal[1] * default_cut_dir[1]
        + normal[2] * default_cut_dir[2];

    dot > 0.0
}

/// Create an extruded Part from sketch profile, respecting sketch plane orientation
/// For cuts (negative height or cut flag), the extrusion goes in the opposite direction
#[cfg(test)]
pub fn create_extrude_part_from_sketch(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    height: f64,
) -> Option<Part> {
    create_extrude_part_full(id, sketch, transform, height, 0.0, false, 0.0)
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
    draft_angle: f64,
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
    // Note: cylinder doesn't support draft angle, so skip if draft is non-zero
    if draft_angle.abs() < 0.01 {
        if let Some(circle_part) =
            try_create_cylinder_from_sketch_full(id, sketch, transform, total_height, height_backward, dir)
        {
            return Some(circle_part);
        }
    }

    // Try profile extrusion for all planes
    if let Some(part) = try_create_profile_extrusion(
        id, sketch, transform, total_height, height_backward, is_cut, center_offset, draft_angle,
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
    draft_angle: f64,
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
        // Calculate scale factor for draft angle
        // Draft angle: positive = expands outward, negative = tapers inward
        // scale = 1 + height * tan(draft_angle) / r_avg
        let scale_top = if draft_angle.abs() > 0.001 {
            // Calculate centroid
            let n = profile.len() as f64;
            let cx: f64 = profile.iter().map(|p| p[0]).sum::<f64>() / n;
            let cy: f64 = profile.iter().map(|p| p[1]).sum::<f64>() / n;

            // Calculate average distance from centroid (characteristic radius)
            let r_avg: f64 = profile.iter()
                .map(|p| ((p[0] - cx).powi(2) + (p[1] - cy).powi(2)).sqrt())
                .sum::<f64>() / n;

            if r_avg > 1e-6 {
                let draft_rad = draft_angle.to_radians();
                let offset = height.abs() * draft_rad.tan();
                1.0 + offset / r_avg
            } else {
                1.0
            }
        } else {
            1.0
        };

        // Clamp scale to reasonable range (0.1 to 10.0)
        let scale_top = scale_top.clamp(0.1, 10.0);

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
                // Swapping x,y reverses winding order, so we need to reverse the points
                let mut pts: Vec<[f64; 2]> = profile.iter().map(|p| [p[1], p[0]]).collect();
                pts.reverse(); // Fix winding order after coordinate swap
                pts.iter().flat_map(|p| vec![p[0], p[1]]).collect()
            }
        };

        let polygon_slice: &[f64] = &polygon_data;

        // Create the manifold extrusion for this profile
        let manifold = Manifold::extrude(
            &[polygon_slice],
            height.abs(),
            1,         // n_divisions
            0.0,       // twist_degrees
            scale_top, // scale_top_x
            scale_top, // scale_top_y
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
            // So the extrusion goes from X=0 to X=-height
            let rotated = manifold.rotate(0.0, -90.0, 0.0);

            // For reverse_cut, we need the tool to go in +X direction
            // Flip the tool by scaling X by -1
            let rotated = if is_cut && reverse_cut {
                rotated.scale(-1.0, 1.0, 1.0)
            } else {
                rotated
            };

            // x_shift positions the tool so the sketch plane ends up at the correct position
            // After rotation, the sketch plane (originally at Z=height_backward) is at X=-height_backward
            // After scale(-1,1,1) for reverse, it's at X=+height_backward
            // backward_shift = -height_backward, so:
            // - Without flip: x_shift = -backward_shift = height_backward
            // - With flip: x_shift = backward_shift = -height_backward
            let x_shift = if reverse_cut { backward_shift } else { -backward_shift };

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

/// Create a revolved Part from sketch profile with optional custom axis
/// If axis is None, uses the default X=0 vertical axis
/// axis format: (start_point, end_point) in sketch 2D coordinates
pub fn create_revolve_part_from_sketch_with_axis(
    id: &str,
    sketch: &Sketch,
    transform: &Transform,
    angle_deg: f64,
    segments: u32,
    axis: Option<([f64; 2], [f64; 2])>,
) -> Option<Part> {
    if sketch.elements.is_empty() {
        return None;
    }

    // Extract 2D profiles from sketch (excluding construction geometry)
    let geometry_elements: Vec<SketchElement> = sketch.geometry_elements().map(|(_, e)| e.clone()).collect();
    let profiles = extract_2d_profiles(&geometry_elements).ok()?;

    if profiles.is_empty() {
        return None;
    }

    let pos = &transform.position;

    // Compute 3D axis origin and direction
    let (axis_origin_3d, axis_dir_3d) = if let Some((start, end)) = axis {
        let origin = sketch_point_to_3d(start, sketch, pos);
        let end_3d = sketch_point_to_3d(end, sketch, pos);
        let dir = [
            end_3d[0] - origin[0],
            end_3d[1] - origin[1],
            end_3d[2] - origin[2],
        ];
        let dir_normalized = normalize_vector(dir).unwrap_or([0.0, 1.0, 0.0]);
        (origin, dir_normalized)
    } else {
        // Default axis: Y axis at sketch origin
        let origin = sketch_point_to_3d([0.0, 0.0], sketch, pos);
        let axis_dir = match sketch.plane {
            SketchPlane::Xy => [0.0, 1.0, 0.0], // +Y in world
            SketchPlane::Xz => [0.0, 0.0, 1.0], // +Z in world (sketch Y -> world Z)
            SketchPlane::Yz => [0.0, 0.0, 1.0], // +Z in world (sketch Y -> world Z)
        };
        (origin, axis_dir)
    };

    // Compute a reference direction perpendicular to axis (in the sketch plane)
    // This will be the +X direction in Manifold space (radial direction at angle 0)
    // Use face_normal if available (for sketches on faces), otherwise use standard plane normal
    let sketch_normal = if let Some(fn_) = sketch.face_normal {
        fn_
    } else {
        match sketch.plane {
            SketchPlane::Xy => [0.0, 0.0, 1.0],
            SketchPlane::Xz => [0.0, 1.0, 0.0],
            SketchPlane::Yz => [1.0, 0.0, 0.0],
        }
    };

    // ref_dir = sketch_normal × axis_dir (perpendicular to axis, in sketch plane)
    // If axis is parallel to sketch normal, use sketch X direction as reference
    let ref_dir = normalize_vector(cross_product(sketch_normal, axis_dir_3d)).unwrap_or_else(|| {
        match sketch.plane {
            SketchPlane::Xy | SketchPlane::Xz => [1.0, 0.0, 0.0],
            SketchPlane::Yz => [0.0, 1.0, 0.0],
        }
    });

    // Transform each profile point to Manifold coordinates:
    // X = distance from axis (must be positive for Manifold::revolve)
    // Y = distance along axis from axis_origin

    // First pass: compute signed X coordinates to determine if we need to flip ref_dir
    let mut sum_x = 0.0;
    let mut count = 0;
    for profile in &profiles {
        for p in profile {
            let p3d = sketch_point_to_3d(*p, sketch, pos);
            let v = [
                p3d[0] - axis_origin_3d[0],
                p3d[1] - axis_origin_3d[1],
                p3d[2] - axis_origin_3d[2],
            ];
            let y_coord = dot_product(v, axis_dir_3d);
            let perp = [
                v[0] - y_coord * axis_dir_3d[0],
                v[1] - y_coord * axis_dir_3d[1],
                v[2] - y_coord * axis_dir_3d[2],
            ];
            sum_x += dot_product(perp, ref_dir);
            count += 1;
        }
    }

    // If average X is negative, flip ref_dir so profile ends up on positive X side
    let ref_dir = if count > 0 && sum_x / (count as f64) < 0.0 {
        [-ref_dir[0], -ref_dir[1], -ref_dir[2]]
    } else {
        ref_dir
    };

    // Check if axis is along sketch Y (vertical on sketch)
    // This is common for XY plane with vertical axis line
    let axis_is_vertical_on_sketch = if let Some((start, end)) = axis {
        (start[0] - end[0]).abs() < 0.001  // X is constant = vertical line
    } else {
        true  // Default axis is always vertical
    };

    let axis_x_on_sketch = if let Some((start, _)) = axis {
        start[0]
    } else {
        0.0
    };

    let transformed_profiles: Vec<Vec<[f64; 2]>> = if axis_is_vertical_on_sketch && matches!(sketch.plane, SketchPlane::Xy) {
        // Simplified path for XY sketch with vertical axis:
        // - Manifold X = sketch_x - axis_x (distance from axis)
        // - Manifold Y = sketch_y (direct mapping)
        profiles
            .iter()
            .map(|profile| {
                profile
                    .iter()
                    .map(|p| {
                        let x_coord = p[0] - axis_x_on_sketch;  // Distance from axis
                        let y_coord = p[1];  // Sketch Y directly
                        [x_coord, y_coord]
                    })
                    .collect()
            })
            .collect()
    } else {
        // General case: project onto axis coordinate system
        profiles
            .iter()
            .map(|profile| {
                profile
                    .iter()
                    .map(|p| {
                        let p3d = sketch_point_to_3d(*p, sketch, pos);

                        // Vector from axis origin to point
                        let v = [
                            p3d[0] - axis_origin_3d[0],
                            p3d[1] - axis_origin_3d[1],
                            p3d[2] - axis_origin_3d[2],
                        ];

                        // Project onto axis (Y coordinate in Manifold space)
                        let y_coord = dot_product(v, axis_dir_3d);

                        // Component perpendicular to axis
                        let perp = [
                            v[0] - y_coord * axis_dir_3d[0],
                            v[1] - y_coord * axis_dir_3d[1],
                            v[2] - y_coord * axis_dir_3d[2],
                        ];

                        // X coordinate = projection onto ref_dir
                        let x_coord = dot_product(perp, ref_dir);

                        [x_coord, y_coord]
                    })
                    .collect()
            })
            .collect()
    };

    // Convert profiles to format for Manifold::revolve
    let polygon_data: Vec<Vec<f64>> = transformed_profiles
        .iter()
        .map(|profile| {
            profile
                .iter()
                .flat_map(|p| vec![p[0], p[1]])
                .collect::<Vec<f64>>()
        })
        .collect();

    let polygon_slices: Vec<&[f64]> = polygon_data.iter().map(|v| v.as_slice()).collect();

    tracing::info!(
        "create_revolve: axis_origin_3d={:?}, axis_dir_3d={:?}, ref_dir={:?}",
        axis_origin_3d, axis_dir_3d, ref_dir
    );
    tracing::info!(
        "create_revolve: transformed_profiles={:?}",
        transformed_profiles
    );

    // Create the manifold revolution around Y axis
    let manifold = Manifold::revolve(
        &polygon_slices,
        segments,
        angle_deg,
    );

    if manifold.is_empty() {
        tracing::warn!("Manifold::revolve returned empty geometry");
        return None;
    }

    // Transform the result to world coordinates.
    // Manifold::revolve creates geometry around Y axis with profile on +X side.
    //
    // We transform the profile so that:
    // - Manifold X = distance from axis (positive = right side of axis)
    // - Manifold Y = position along axis
    //
    // After revolve, we need to map back to world coordinates.
    // For sketch plane XY with vertical axis:
    // - Manifold X,Z rotate in world XZ plane
    // - Manifold Y stays as world Y
    //
    // The key insight: Manifold revolve generates geometry where each profile point
    // at (X, Y) traces a circle of radius X at height Y in the XZ plane.
    //
    // We need to rotate and translate so that:
    // - The axis (Manifold Y) aligns with axis_dir_3d
    // - The radial direction (Manifold X at theta=0) aligns with ref_dir
    // - The origin moves to axis_origin_3d

    // Check if axis is along world Y (common case for XY sketch with vertical axis)
    let axis_along_y = axis_dir_3d[1].abs() > 0.9 && axis_dir_3d[0].abs() < 0.1 && axis_dir_3d[2].abs() < 0.1;

    let final_manifold = if axis_along_y {
        // Simple case: axis along Y, no rotation needed
        //
        // Manifold::revolve creates geometry where:
        // - Profile (px, py) at theta becomes (px*cos(theta), py, px*sin(theta))
        // - Axis is Y, radial direction is X at theta=0
        //
        // For XY sketch with vertical axis at x=axis_x:
        // - We transformed profile so px = sketch_x - axis_x, py = sketch_y
        // - world_x = axis_x + px*cos(theta) = axis_x + Manifold_x
        // - world_y = sketch_y = py = Manifold_y (no shift needed!)
        // - world_z = sketch.offset + px*sin(theta) = sketch.offset + Manifold_z
        //
        // So translate should be (axis_x, 0, sketch.offset), NOT axis_origin!

        // Extract axis X position (same for all points on vertical axis)
        let axis_x = if let Some((start, _end)) = axis {
            start[0]
        } else {
            0.0
        };

        let tx = axis_x;
        let ty = 0.0;  // No Y shift - Manifold Y = sketch Y directly
        let tz = sketch.offset;

        tracing::info!(
            "create_revolve: axis_along_y path, translate=({:.2}, {:.2}, {:.2})",
            tx, ty, tz
        );

        // Manifold::revolve creates geometry around Z axis.
        // Rotate -90° around X to transform:
        // - Manifold XY plane → world XZ plane (torus ring)
        // - Manifold Z (profile height) → world Y
        // At theta=0: (r, 0, h) → (r, h, 0) after rotation
        manifold
            .rotate(-90.0, 0.0, 0.0)
            .translate(tx, ty, tz)
    } else {
        // General case: compute rotation matrix R = [ref_dir | tan_dir | axis_dir]
        // This maps Manifold coordinates to world coordinates:
        // - Manifold X (radial at θ=0) → ref_dir
        // - Manifold Y (tangent) → tan_dir = axis × ref
        // - Manifold Z (axis) → axis_dir
        //
        // Then decompose R into Euler angles XYZ (i.e., R = Rz * Ry * Rx)

        // Compute tangent direction (perpendicular to both axis and ref)
        let tan_dir = normalize_vector(cross_product(axis_dir_3d, ref_dir))
            .unwrap_or([1.0, 0.0, 0.0]); // Fallback if axis and ref are parallel

        // Decompose R = [ref_dir | tan_dir | axis_dir] into Euler XYZ angles
        // For Rz * Ry * Rx:
        // R[2][0] = ref_dir[2] = -sin(ry)
        // R[0][0] = ref_dir[0] = cos(ry) * cos(rz)
        // R[1][0] = ref_dir[1] = cos(ry) * sin(rz)
        // R[2][1] = tan_dir[2] = sin(rx) * cos(ry)
        // R[2][2] = axis_dir[2] = cos(rx) * cos(ry)

        let ry = (-ref_dir[2]).asin();
        let cy = ry.cos();

        let (rx, rz) = if cy.abs() > 0.0001 {
            // Normal case
            let rz = ref_dir[1].atan2(ref_dir[0]);
            let rx = tan_dir[2].atan2(axis_dir_3d[2]);
            (rx.to_degrees(), rz.to_degrees())
        } else {
            // Gimbal lock: ry = ±90°, ref_dir[2] ≈ ±1
            // In this case, rx and rz are not uniquely determined
            // Use a simple fallback
            (0.0, 0.0)
        };

        let ry_deg = ry.to_degrees();

        tracing::info!(
            "create_revolve general: ref_dir={:?}, tan_dir={:?}, axis_dir={:?}",
            ref_dir, tan_dir, axis_dir_3d
        );
        tracing::info!(
            "create_revolve general: euler angles=({:.2}, {:.2}, {:.2})",
            rx, ry_deg, rz
        );

        manifold
            .rotate(rx, ry_deg, rz)
            .translate(axis_origin_3d[0], axis_origin_3d[1], axis_origin_3d[2])
    };

    tracing::info!(
        "create_revolve: axis_along_y={}, axis_origin={:?}",
        axis_along_y, axis_origin_3d
    );

    Some(Part::new(id, final_manifold))
}

/// Convert 2D sketch point to 3D world coordinates
fn sketch_point_to_3d(p: [f64; 2], sketch: &Sketch, pos: &[f64; 3]) -> [f64; 3] {
    match sketch.plane {
        SketchPlane::Xy => [p[0] + pos[0], p[1] + pos[1], sketch.offset + pos[2]],
        SketchPlane::Xz => [p[0] + pos[0], sketch.offset + pos[1], p[1] + pos[2]],
        SketchPlane::Yz => [sketch.offset + pos[0], p[0] + pos[1], p[1] + pos[2]],
    }
}

/// Cross product of two 3D vectors
fn cross_product(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

/// Dot product of two 3D vectors
fn dot_product(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Normalize a 3D vector, returns original if length is too small
fn normalize_vector(v: [f64; 3]) -> Option<[f64; 3]> {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len > 0.0001 {
        Some([v[0] / len, v[1] / len, v[2] / len])
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared::Point2D;

    fn identity() -> Transform {
        Transform::new()
    }

    #[test]
    fn test_validate_empty_sketch() {
        let sketch = Sketch::default();
        let validation = validate_sketch(&sketch);
        assert!(!validation.is_valid);
        assert!(validation.error_message.is_some());
    }

    #[test]
    fn test_validate_single_circle() {
        let sketch = Sketch {
            elements: vec![SketchElement::Circle {
                center: Point2D { x: 0.0, y: 0.0 },
                radius: 1.0,
            }],
            ..Default::default()
        };
        let validation = validate_sketch(&sketch);
        assert!(validation.is_valid);
        assert!(validation.is_closed);
        assert!(!validation.has_self_intersections);
    }

    #[test]
    fn test_validate_single_rectangle() {
        let sketch = Sketch {
            elements: vec![SketchElement::Rectangle {
                corner: Point2D { x: 0.0, y: 0.0 },
                width: 2.0,
                height: 1.0,
            }],
            ..Default::default()
        };
        let validation = validate_sketch(&sketch);
        assert!(validation.is_valid);
        assert!(validation.is_closed);
    }

    #[test]
    fn test_extrude_circle_creates_cylinder() {
        let sketch = Sketch {
            elements: vec![SketchElement::Circle {
                center: Point2D { x: 0.0, y: 0.0 },
                radius: 1.0,
            }],
            ..Default::default()
        };
        let part = create_extrude_part_from_sketch("test", &sketch, &identity(), 2.0);
        assert!(part.is_some());
    }

    #[test]
    fn test_extrude_rectangle_creates_profile() {
        let sketch = Sketch {
            elements: vec![SketchElement::Rectangle {
                corner: Point2D { x: -1.0, y: -1.0 },
                width: 2.0,
                height: 2.0,
            }],
            ..Default::default()
        };
        let part = create_extrude_part_from_sketch("test", &sketch, &identity(), 1.0);
        assert!(part.is_some());
    }

    #[test]
    fn test_extrude_closed_lines() {
        // Create a closed triangle from 3 lines
        let sketch = Sketch {
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
            ..Default::default()
        };
        let part = create_extrude_part_from_sketch("test", &sketch, &identity(), 1.0);
        assert!(part.is_some());
    }
}
