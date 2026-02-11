//! Fillet operation for sketch elements

use kurbo::{Line as KLine, Point};
use shared::{Point2D, Sketch, SketchElement};
use std::f64::consts::{PI, TAU};

use super::geometry::line_line_intersection;
use super::types::FilletResult;

// ============================================================================
// FILLET operation
// ============================================================================

/// Create a fillet (arc) at the intersection of two lines
#[allow(dead_code)]
pub fn fillet_lines(
    line1_idx: usize,
    line2_idx: usize,
    radius: f64,
    sketch: &Sketch,
) -> Option<FilletResult> {
    let elem1 = sketch.elements.get(line1_idx)?;
    let elem2 = sketch.elements.get(line2_idx)?;

    let (l1_start, l1_end) = match elem1 {
        SketchElement::Line { start, end } => (Point::new(start.x, start.y), Point::new(end.x, end.y)),
        _ => return None,
    };

    let (l2_start, l2_end) = match elem2 {
        SketchElement::Line { start, end } => (Point::new(start.x, start.y), Point::new(end.x, end.y)),
        _ => return None,
    };

    let l1 = KLine::new(l1_start, l1_end);
    let l2 = KLine::new(l2_start, l2_end);

    let (t1, t2, intersection) = line_line_intersection(l1, l2)?;

    // Direction vectors
    let d1 = (l1.p1 - l1.p0).normalize();
    let d2 = (l2.p1 - l2.p0).normalize();

    // Choose directions pointing away from intersection
    let d1 = if t1 < 0.5 { d1 } else { -d1 };
    let d2 = if t2 < 0.5 { d2 } else { -d2 };

    // Bisector
    let bisector = (d1 + d2).normalize();
    let cos_half = d1.dot(bisector);
    if cos_half.abs() < 1e-6 {
        return None;
    }

    let dist_to_center = radius / (1.0 - cos_half * cos_half).sqrt().max(1e-6);
    let center = intersection + bisector * dist_to_center;

    let tangent1 = intersection + d1 * (dist_to_center * cos_half);
    let tangent2 = intersection + d2 * (dist_to_center * cos_half);

    let mut start_angle = (tangent1.y - center.y).atan2(tangent1.x - center.x);
    let mut end_angle = (tangent2.y - center.y).atan2(tangent2.x - center.x);

    // Ensure short arc
    let mut span = end_angle - start_angle;
    if span < 0.0 { span += TAU; }
    if span > PI {
        std::mem::swap(&mut start_angle, &mut end_angle);
    }

    let fillet_arc = SketchElement::Arc {
        center: Point2D { x: center.x, y: center.y },
        radius,
        start_angle,
        end_angle,
    };

    let new_line1 = if t1 < 0.5 {
        SketchElement::Line {
            start: Point2D { x: tangent1.x, y: tangent1.y },
            end: Point2D { x: l1_end.x, y: l1_end.y },
        }
    } else {
        SketchElement::Line {
            start: Point2D { x: l1_start.x, y: l1_start.y },
            end: Point2D { x: tangent1.x, y: tangent1.y },
        }
    };

    let new_line2 = if t2 < 0.5 {
        SketchElement::Line {
            start: Point2D { x: tangent2.x, y: tangent2.y },
            end: Point2D { x: l2_end.x, y: l2_end.y },
        }
    } else {
        SketchElement::Line {
            start: Point2D { x: l2_start.x, y: l2_start.y },
            end: Point2D { x: tangent2.x, y: tangent2.y },
        }
    };

    Some(FilletResult {
        fillet_arc,
        elem1: Some(new_line1),
        elem2: Some(new_line2),
    })
}
