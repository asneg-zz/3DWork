//! Constraint solver for sketch elements
//!
//! This module provides functions to apply geometric constraints to sketch elements.
//! The solver works iteratively to satisfy all constraints.

use shared::{PointRef, Sketch, SketchConstraint, SketchElement};

/// Maximum number of solver iterations
const MAX_ITERATIONS: usize = 50;

/// Tolerance for constraint satisfaction
const TOLERANCE: f64 = 1e-6;

/// Solve all constraints in the sketch
/// Returns true if all constraints were satisfied
pub fn solve_constraints(sketch: &mut Sketch) -> bool {
    if sketch.constraints.is_empty() {
        return true;
    }

    for _ in 0..MAX_ITERATIONS {
        let mut all_satisfied = true;

        for constraint in sketch.constraints.clone() {
            let satisfied = apply_constraint(sketch, &constraint);
            if !satisfied {
                all_satisfied = false;
            }
        }

        if all_satisfied {
            return true;
        }
    }

    false
}

/// Apply a single constraint
fn apply_constraint(sketch: &mut Sketch, constraint: &SketchConstraint) -> bool {
    match constraint {
        SketchConstraint::Horizontal { element } => apply_horizontal(sketch, *element),
        SketchConstraint::Vertical { element } => apply_vertical(sketch, *element),
        SketchConstraint::Parallel { element1, element2 } => {
            apply_parallel(sketch, *element1, *element2)
        }
        SketchConstraint::Perpendicular { element1, element2 } => {
            apply_perpendicular(sketch, *element1, *element2)
        }
        SketchConstraint::Coincident { point1, point2 } => {
            apply_coincident(sketch, point1, point2)
        }
        SketchConstraint::Fixed { .. } => {
            // Fixed constraint doesn't modify elements - it just prevents them from moving
            // The actual prevention is done in drag handling
            true
        }
        SketchConstraint::Equal { element1, element2 } => {
            apply_equal(sketch, *element1, *element2)
        }
        SketchConstraint::Tangent { element1, element2 } => {
            apply_tangent(sketch, *element1, *element2)
        }
        SketchConstraint::Concentric { element1, element2 } => {
            apply_concentric(sketch, *element1, *element2)
        }
        SketchConstraint::Symmetric { element1, element2, axis } => {
            apply_symmetric(sketch, *element1, *element2, *axis)
        }
    }
}

/// Make a line horizontal (start.y == end.y), preserving line length
fn apply_horizontal(sketch: &mut Sketch, element_idx: usize) -> bool {
    let elem = match sketch.elements.get(element_idx) {
        Some(e) => e.clone(),
        None => return true,
    };

    match elem {
        SketchElement::Line { start, end, .. } => {
            let dy = (start.y - end.y).abs();
            if dy < TOLERANCE {
                return true; // Already horizontal
            }

            let len = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
            let mid_x = (start.x + end.x) / 2.0;
            let mid_y = (start.y + end.y) / 2.0;
            let half = len / 2.0;

            if let Some(SketchElement::Line { start: s, end: e, .. }) =
                sketch.elements.get_mut(element_idx)
            {
                s.x = mid_x - half;
                s.y = mid_y;
                e.x = mid_x + half;
                e.y = mid_y;
            }
            false
        }
        _ => true,
    }
}

/// Make a line vertical (start.x == end.x), preserving line length
fn apply_vertical(sketch: &mut Sketch, element_idx: usize) -> bool {
    let elem = match sketch.elements.get(element_idx) {
        Some(e) => e.clone(),
        None => return true,
    };

    match elem {
        SketchElement::Line { start, end, .. } => {
            let dx = (start.x - end.x).abs();
            if dx < TOLERANCE {
                return true;
            }

            let len = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
            let mid_x = (start.x + end.x) / 2.0;
            let mid_y = (start.y + end.y) / 2.0;
            let half = len / 2.0;

            if let Some(SketchElement::Line { start: s, end: e, .. }) =
                sketch.elements.get_mut(element_idx)
            {
                s.x = mid_x;
                s.y = mid_y - half;
                e.x = mid_x;
                e.y = mid_y + half;
            }
            false
        }
        _ => true,
    }
}

/// Make two lines parallel
/// Rotates the second line to be parallel to the first, keeping its midpoint fixed
fn apply_parallel(sketch: &mut Sketch, elem1_idx: usize, elem2_idx: usize) -> bool {
    let (dir1, mid2, len2) = {
        let elem1 = sketch.elements.get(elem1_idx);
        let elem2 = sketch.elements.get(elem2_idx);

        match (elem1, elem2) {
            (
                Some(SketchElement::Line { start: s1, end: e1, .. }),
                Some(SketchElement::Line { start: s2, end: e2, .. }),
            ) => {
                // Direction of first line
                let dx1 = e1.x - s1.x;
                let dy1 = e1.y - s1.y;
                let len1 = (dx1 * dx1 + dy1 * dy1).sqrt();
                if len1 < TOLERANCE {
                    return true; // Degenerate line
                }
                let dir1 = (dx1 / len1, dy1 / len1);

                // Midpoint and length of second line
                let mid2 = ((s2.x + e2.x) / 2.0, (s2.y + e2.y) / 2.0);
                let dx2 = e2.x - s2.x;
                let dy2 = e2.y - s2.y;
                let len2 = (dx2 * dx2 + dy2 * dy2).sqrt();

                // Check if already parallel
                let cross = dx1 * dy2 - dy1 * dx2;
                if cross.abs() < TOLERANCE * len1 * len2 {
                    return true; // Already parallel
                }

                (dir1, mid2, len2)
            }
            _ => return true, // Not lines
        }
    };

    // Update second line to be parallel to first
    if let Some(SketchElement::Line { start: s, end: e, .. }) = sketch.elements.get_mut(elem2_idx) {
        let half_len = len2 / 2.0;
        s.x = mid2.0 - dir1.0 * half_len;
        s.y = mid2.1 - dir1.1 * half_len;
        e.x = mid2.0 + dir1.0 * half_len;
        e.y = mid2.1 + dir1.1 * half_len;
    }

    false
}

/// Make two lines perpendicular
/// Rotates the second line to be perpendicular to the first, keeping its midpoint fixed
fn apply_perpendicular(sketch: &mut Sketch, elem1_idx: usize, elem2_idx: usize) -> bool {
    let (perp_dir, mid2, len2) = {
        let elem1 = sketch.elements.get(elem1_idx);
        let elem2 = sketch.elements.get(elem2_idx);

        match (elem1, elem2) {
            (
                Some(SketchElement::Line { start: s1, end: e1, .. }),
                Some(SketchElement::Line { start: s2, end: e2, .. }),
            ) => {
                // Direction of first line
                let dx1 = e1.x - s1.x;
                let dy1 = e1.y - s1.y;
                let len1 = (dx1 * dx1 + dy1 * dy1).sqrt();
                if len1 < TOLERANCE {
                    return true;
                }

                // Perpendicular direction (rotate 90 degrees)
                let perp_dir = (-dy1 / len1, dx1 / len1);

                // Midpoint and length of second line
                let mid2 = ((s2.x + e2.x) / 2.0, (s2.y + e2.y) / 2.0);
                let dx2 = e2.x - s2.x;
                let dy2 = e2.y - s2.y;
                let len2 = (dx2 * dx2 + dy2 * dy2).sqrt();

                // Check if already perpendicular
                let dot = dx1 * dx2 + dy1 * dy2;
                if dot.abs() < TOLERANCE * len1 * len2 {
                    return true;
                }

                (perp_dir, mid2, len2)
            }
            _ => return true,
        }
    };

    // Update second line to be perpendicular to first
    if let Some(SketchElement::Line { start: s, end: e, .. }) = sketch.elements.get_mut(elem2_idx) {
        let half_len = len2 / 2.0;
        s.x = mid2.0 - perp_dir.0 * half_len;
        s.y = mid2.1 - perp_dir.1 * half_len;
        e.x = mid2.0 + perp_dir.0 * half_len;
        e.y = mid2.1 + perp_dir.1 * half_len;
    }

    false
}

/// Make two points coincide
/// Moves both points to their midpoint
fn apply_coincident(sketch: &mut Sketch, point1: &PointRef, point2: &PointRef) -> bool {
    // Get positions of both points
    let pos1 = get_point_position(sketch, point1);
    let pos2 = get_point_position(sketch, point2);

    match (pos1, pos2) {
        (Some(p1), Some(p2)) => {
            let diff = ((p1.0 - p2.0).powi(2) + (p1.1 - p2.1).powi(2)).sqrt();
            if diff < TOLERANCE {
                return true;
            }

            // Move to midpoint
            let mid = ((p1.0 + p2.0) / 2.0, (p1.1 + p2.1) / 2.0);
            set_point_position(sketch, point1, mid);
            set_point_position(sketch, point2, mid);
            false
        }
        _ => true,
    }
}

/// Make two lines equal length, or two circles/arcs equal radius
fn apply_equal(sketch: &mut Sketch, elem1_idx: usize, elem2_idx: usize) -> bool {
    let elem1 = sketch.elements.get(elem1_idx).cloned();
    let elem2 = sketch.elements.get(elem2_idx).cloned();

    match (elem1, elem2) {
        // Two lines: make them equal length
        (
            Some(SketchElement::Line { start: s1, end: e1, .. }),
            Some(SketchElement::Line { start: s2, end: e2, .. }),
        ) => {
            let len1 = ((e1.x - s1.x).powi(2) + (e1.y - s1.y).powi(2)).sqrt();
            let len2 = ((e2.x - s2.x).powi(2) + (e2.y - s2.y).powi(2)).sqrt();

            if (len1 - len2).abs() < TOLERANCE {
                return true; // Already equal
            }

            // Average length
            let avg_len = (len1 + len2) / 2.0;

            // Adjust first line from its midpoint
            let mid1 = ((s1.x + e1.x) / 2.0, (s1.y + e1.y) / 2.0);
            let dir1 = if len1 > TOLERANCE {
                ((e1.x - s1.x) / len1, (e1.y - s1.y) / len1)
            } else {
                (1.0, 0.0)
            };
            if let Some(SketchElement::Line { start, end, .. }) = sketch.elements.get_mut(elem1_idx) {
                start.x = mid1.0 - dir1.0 * avg_len / 2.0;
                start.y = mid1.1 - dir1.1 * avg_len / 2.0;
                end.x = mid1.0 + dir1.0 * avg_len / 2.0;
                end.y = mid1.1 + dir1.1 * avg_len / 2.0;
            }

            // Adjust second line from its midpoint
            let mid2 = ((s2.x + e2.x) / 2.0, (s2.y + e2.y) / 2.0);
            let dir2 = if len2 > TOLERANCE {
                ((e2.x - s2.x) / len2, (e2.y - s2.y) / len2)
            } else {
                (1.0, 0.0)
            };
            if let Some(SketchElement::Line { start, end, .. }) = sketch.elements.get_mut(elem2_idx) {
                start.x = mid2.0 - dir2.0 * avg_len / 2.0;
                start.y = mid2.1 - dir2.1 * avg_len / 2.0;
                end.x = mid2.0 + dir2.0 * avg_len / 2.0;
                end.y = mid2.1 + dir2.1 * avg_len / 2.0;
            }

            false
        }
        // Two circles: make them equal radius
        (
            Some(SketchElement::Circle { radius: r1, .. }),
            Some(SketchElement::Circle { radius: r2, .. }),
        ) => {
            if (r1 - r2).abs() < TOLERANCE {
                return true;
            }

            let avg_r = (r1 + r2) / 2.0;
            if let Some(SketchElement::Circle { radius, .. }) = sketch.elements.get_mut(elem1_idx) {
                *radius = avg_r;
            }
            if let Some(SketchElement::Circle { radius, .. }) = sketch.elements.get_mut(elem2_idx) {
                *radius = avg_r;
            }
            false
        }
        // Two arcs: make them equal radius
        (
            Some(SketchElement::Arc { radius: r1, .. }),
            Some(SketchElement::Arc { radius: r2, .. }),
        ) => {
            if (r1 - r2).abs() < TOLERANCE {
                return true;
            }

            let avg_r = (r1 + r2) / 2.0;
            if let Some(SketchElement::Arc { radius, .. }) = sketch.elements.get_mut(elem1_idx) {
                *radius = avg_r;
            }
            if let Some(SketchElement::Arc { radius, .. }) = sketch.elements.get_mut(elem2_idx) {
                *radius = avg_r;
            }
            false
        }
        _ => true, // Not applicable
    }
}

/// Make a line tangent to a circle or arc
/// Moves the circle/arc center so that it touches the line at a point within the line segment
fn apply_tangent(sketch: &mut Sketch, elem1_idx: usize, elem2_idx: usize) -> bool {
    let elem1 = sketch.elements.get(elem1_idx).cloned();
    let elem2 = sketch.elements.get(elem2_idx).cloned();

    // Try to find line and circle/arc - get circle index too
    let (line_idx, circle_idx, circle_center, circle_radius) = match (&elem1, &elem2) {
        (Some(SketchElement::Line { .. }), Some(SketchElement::Circle { center, radius, .. })) => {
            (elem1_idx, elem2_idx, (center.x, center.y), *radius)
        }
        (Some(SketchElement::Circle { center, radius, .. }), Some(SketchElement::Line { .. })) => {
            (elem2_idx, elem1_idx, (center.x, center.y), *radius)
        }
        (Some(SketchElement::Line { .. }), Some(SketchElement::Arc { center, radius, .. })) => {
            (elem1_idx, elem2_idx, (center.x, center.y), *radius)
        }
        (Some(SketchElement::Arc { center, radius, .. }), Some(SketchElement::Line { .. })) => {
            (elem2_idx, elem1_idx, (center.x, center.y), *radius)
        }
        _ => {

            return true;
        }
    };

    // Get line endpoints
    let (s, e) = if let Some(SketchElement::Line { start, end, .. }) = sketch.elements.get(line_idx) {
        ((start.x, start.y), (end.x, end.y))
    } else {

        return true;
    };

    // Line direction vector and length
    let dx = e.0 - s.0;
    let dy = e.1 - s.1;
    let len = (dx * dx + dy * dy).sqrt();
    if len < TOLERANCE {
        return true;
    }

    // Normal to line (perpendicular, pointing toward circle center)
    let normal = (-dy / len, dx / len);

    // Signed distance from circle center to the infinite line
    let to_center = (circle_center.0 - s.0, circle_center.1 - s.1);
    let dist = to_center.0 * normal.0 + to_center.1 * normal.1;

    if (dist.abs() - circle_radius).abs() < TOLERANCE {
        return true; // Already tangent
    }

    // Move circle center along the normal so that dist == ±radius
    // Preserve the side (sign) of dist.
    let target_dist = if dist >= 0.0 { circle_radius } else { -circle_radius };
    let shift = (dist - target_dist) * 0.5; // damped step

    match sketch.elements.get_mut(circle_idx) {
        Some(SketchElement::Circle { center, .. }) => {
            center.x -= normal.0 * shift;
            center.y -= normal.1 * shift;
        }
        Some(SketchElement::Arc { center, .. }) => {
            center.x -= normal.0 * shift;
            center.y -= normal.1 * shift;
        }
        _ => {}
    }

    false
}

/// Make two circles or arcs concentric (same center)
fn apply_concentric(sketch: &mut Sketch, elem1_idx: usize, elem2_idx: usize) -> bool {
    let (c1, c2) = {
        let elem1 = sketch.elements.get(elem1_idx);
        let elem2 = sketch.elements.get(elem2_idx);

        let center1 = match elem1 {
            Some(SketchElement::Circle { center, .. }) => Some((center.x, center.y)),
            Some(SketchElement::Arc { center, .. }) => Some((center.x, center.y)),
            _ => None,
        };
        let center2 = match elem2 {
            Some(SketchElement::Circle { center, .. }) => Some((center.x, center.y)),
            Some(SketchElement::Arc { center, .. }) => Some((center.x, center.y)),
            _ => None,
        };

        match (center1, center2) {
            (Some(c1), Some(c2)) => (c1, c2),
            _ => return true, // Not circles/arcs
        }
    };

    let dist = ((c1.0 - c2.0).powi(2) + (c1.1 - c2.1).powi(2)).sqrt();
    if dist < TOLERANCE {
        return true; // Already concentric
    }

    // Move both centers to their midpoint
    let mid = ((c1.0 + c2.0) / 2.0, (c1.1 + c2.1) / 2.0);

    match sketch.elements.get_mut(elem1_idx) {
        Some(SketchElement::Circle { center, .. }) => {
            center.x = mid.0;
            center.y = mid.1;
        }
        Some(SketchElement::Arc { center, .. }) => {
            center.x = mid.0;
            center.y = mid.1;
        }
        _ => {}
    }

    match sketch.elements.get_mut(elem2_idx) {
        Some(SketchElement::Circle { center, .. }) => {
            center.x = mid.0;
            center.y = mid.1;
        }
        Some(SketchElement::Arc { center, .. }) => {
            center.x = mid.0;
            center.y = mid.1;
        }
        _ => {}
    }

    false
}

/// Make two elements symmetric about an axis line.
///
/// Iterative approach: each iteration moves both points halfway toward
/// the configuration where p2 == reflect(p1) and p1 == reflect(p2).
/// This converges to the nearest symmetric state.
fn apply_symmetric(sketch: &mut Sketch, elem1_idx: usize, elem2_idx: usize, axis_idx: usize) -> bool {
    // Get axis line
    let axis = match sketch.elements.get(axis_idx) {
        Some(SketchElement::Line { start, end, .. }) => {
            ((start.x, start.y), (end.x, end.y))
        }
        _ => return true, // Axis must be a line
    };

    // Helper: move both scalar values halfway toward the state where
    // p2 == reflect(p1) and p1 == reflect(p2).
    // Fixed point: p1 == reflect(p2) ↔ p2 == reflect(p1).
    fn converge_pair(
        p1: (f64, f64),
        p2: (f64, f64),
        axis: ((f64, f64), (f64, f64)),
    ) -> ((f64, f64), (f64, f64)) {
        let p1_target = reflect_point(p2, axis); // where p1 should go to match p2
        let p2_target = reflect_point(p1, axis); // where p2 should go to match p1
        let new_p1 = ((p1.0 + p1_target.0) / 2.0, (p1.1 + p1_target.1) / 2.0);
        let new_p2 = ((p2.0 + p2_target.0) / 2.0, (p2.1 + p2_target.1) / 2.0);
        (new_p1, new_p2)
    }

    let elem1 = sketch.elements.get(elem1_idx).cloned();
    let elem2 = sketch.elements.get(elem2_idx).cloned();

    match (elem1, elem2) {
        // Two lines
        (
            Some(SketchElement::Line { start: s1, end: e1, .. }),
            Some(SketchElement::Line { start: s2, end: e2, .. }),
        ) => {
            let (new_s1, new_s2) = converge_pair((s1.x, s1.y), (s2.x, s2.y), axis);
            let (new_e1, new_e2) = converge_pair((e1.x, e1.y), (e2.x, e2.y), axis);

            let err = (s1.x - new_s1.0).powi(2) + (s1.y - new_s1.1).powi(2)
                    + (e1.x - new_e1.0).powi(2) + (e1.y - new_e1.1).powi(2)
                    + (s2.x - new_s2.0).powi(2) + (s2.y - new_s2.1).powi(2)
                    + (e2.x - new_e2.0).powi(2) + (e2.y - new_e2.1).powi(2);
            if err < TOLERANCE * TOLERANCE {
                return true;
            }

            if let Some(SketchElement::Line { start, end, .. }) = sketch.elements.get_mut(elem1_idx) {
                start.x = new_s1.0; start.y = new_s1.1;
                end.x   = new_e1.0; end.y   = new_e1.1;
            }
            if let Some(SketchElement::Line { start, end, .. }) = sketch.elements.get_mut(elem2_idx) {
                start.x = new_s2.0; start.y = new_s2.1;
                end.x   = new_e2.0; end.y   = new_e2.1;
            }
            false
        }
        // Two circles: reflected centers, equal radii
        (
            Some(SketchElement::Circle { center: c1, radius: r1, .. }),
            Some(SketchElement::Circle { center: c2, radius: r2, .. }),
        ) => {
            let (new_c1, new_c2) = converge_pair((c1.x, c1.y), (c2.x, c2.y), axis);
            let avg_r = (r1 + r2) / 2.0;

            let err = (c1.x - new_c1.0).powi(2) + (c1.y - new_c1.1).powi(2)
                    + (c2.x - new_c2.0).powi(2) + (c2.y - new_c2.1).powi(2)
                    + (r1 - avg_r).powi(2) + (r2 - avg_r).powi(2);
            if err < TOLERANCE * TOLERANCE {
                return true;
            }

            if let Some(SketchElement::Circle { center, radius, .. }) = sketch.elements.get_mut(elem1_idx) {
                center.x = new_c1.0; center.y = new_c1.1; *radius = avg_r;
            }
            if let Some(SketchElement::Circle { center, radius, .. }) = sketch.elements.get_mut(elem2_idx) {
                center.x = new_c2.0; center.y = new_c2.1; *radius = avg_r;
            }
            false
        }
        _ => true,
    }
}

/// Reflect a point about a line (axis)
fn reflect_point(point: (f64, f64), axis: ((f64, f64), (f64, f64))) -> (f64, f64) {
    let (ax, ay) = axis.0;
    let (bx, by) = axis.1;

    // Direction of axis
    let dx = bx - ax;
    let dy = by - ay;
    let len_sq = dx * dx + dy * dy;
    if len_sq < 1e-12 {
        return point; // Degenerate axis
    }

    // Vector from axis start to point
    let px = point.0 - ax;
    let py = point.1 - ay;

    // Project point onto axis
    let t = (px * dx + py * dy) / len_sq;
    let proj_x = ax + t * dx;
    let proj_y = ay + t * dy;

    // Reflect: point' = 2 * proj - point
    (2.0 * proj_x - point.0, 2.0 * proj_y - point.1)
}

/// Get the position of a point reference
fn get_point_position(sketch: &Sketch, point_ref: &PointRef) -> Option<(f64, f64)> {
    let elem = sketch.elements.get(point_ref.element_index)?;

    match elem {
        SketchElement::Line { start, end, .. } => match point_ref.point_index {
            0 => Some((start.x, start.y)),
            1 => Some((end.x, end.y)),
            _ => None,
        },
        SketchElement::Circle { center, .. } => match point_ref.point_index {
            0 => Some((center.x, center.y)),
            _ => None,
        },
        SketchElement::Arc {
            center,
            radius,
            start_angle,
            end_angle,
            ..
        } => match point_ref.point_index {
            0 => Some((center.x, center.y)),
            1 => Some((
                center.x + radius * start_angle.cos(),
                center.y + radius * start_angle.sin(),
            )),
            2 => Some((
                center.x + radius * end_angle.cos(),
                center.y + radius * end_angle.sin(),
            )),
            _ => None,
        },
        SketchElement::Rectangle {
            corner,
            width,
            height,
            ..
        } => match point_ref.point_index {
            0 => Some((corner.x, corner.y)),
            1 => Some((corner.x + width, corner.y)),
            2 => Some((corner.x + width, corner.y + height)),
            3 => Some((corner.x, corner.y + height)),
            _ => None,
        },
        SketchElement::Polyline { points, .. } | SketchElement::Spline { points, .. } => {
            points.get(point_ref.point_index).map(|p| (p.x, p.y))
        }
        SketchElement::Dimension { .. } => None,
    }
}

/// Set the position of a point reference
fn set_point_position(sketch: &mut Sketch, point_ref: &PointRef, pos: (f64, f64)) {
    if let Some(elem) = sketch.elements.get_mut(point_ref.element_index) {
        match elem {
            SketchElement::Line { start, end, .. } => match point_ref.point_index {
                0 => {
                    start.x = pos.0;
                    start.y = pos.1;
                }
                1 => {
                    end.x = pos.0;
                    end.y = pos.1;
                }
                _ => {}
            },
            SketchElement::Circle { center, .. } => {
                if point_ref.point_index == 0 {
                    center.x = pos.0;
                    center.y = pos.1;
                }
            }
            SketchElement::Arc {
                center,
                radius,
                start_angle,
                end_angle,
                ..
            } => match point_ref.point_index {
                0 => {
                    center.x = pos.0;
                    center.y = pos.1;
                }
                1 => {
                    // Update start angle based on new position
                    let dx = pos.0 - center.x;
                    let dy = pos.1 - center.y;
                    *radius = (dx * dx + dy * dy).sqrt();
                    *start_angle = dy.atan2(dx);
                }
                2 => {
                    // Update end angle based on new position
                    let dx = pos.0 - center.x;
                    let dy = pos.1 - center.y;
                    *end_angle = dy.atan2(dx);
                }
                _ => {}
            },
            SketchElement::Rectangle {
                corner,
                width,
                height,
                ..
            } => match point_ref.point_index {
                0 => {
                    let old_x1 = corner.x + *width;
                    let old_y1 = corner.y + *height;
                    corner.x = pos.0;
                    corner.y = pos.1;
                    *width = old_x1 - pos.0;
                    *height = old_y1 - pos.1;
                }
                1 => {
                    *width = pos.0 - corner.x;
                }
                2 => {
                    *width = pos.0 - corner.x;
                    *height = pos.1 - corner.y;
                }
                3 => {
                    *height = pos.1 - corner.y;
                }
                _ => {}
            },
            SketchElement::Polyline { points, .. } | SketchElement::Spline { points, .. } => {
                if let Some(p) = points.get_mut(point_ref.point_index) {
                    p.x = pos.0;
                    p.y = pos.1;
                }
            }
            SketchElement::Dimension { .. } => {}
        }
    }
}

