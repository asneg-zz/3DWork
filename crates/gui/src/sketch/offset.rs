//! Offset operations for sketch elements

use kurbo::{Point, Vec2};
use shared::{Point2D, SketchElement};

use super::geometry::to_point;

// ============================================================================
// OFFSET operation
// ============================================================================

/// Create an offset copy of a line
#[allow(dead_code)]
pub fn offset_line(line: &SketchElement, distance: f64, click_side: [f64; 2]) -> Option<SketchElement> {
    let (start, end) = match line {
        SketchElement::Line { start, end } => (Point::new(start.x, start.y), Point::new(end.x, end.y)),
        _ => return None,
    };

    let dir = end - start;
    let len = dir.hypot();
    if len < 1e-10 {
        return None;
    }

    let perp = Vec2::new(-dir.y / len, dir.x / len);
    let mid = start.lerp(end, 0.5);
    let to_click = to_point(click_side) - mid;

    let side = if to_click.dot(perp) > 0.0 { 1.0 } else { -1.0 };
    let offset = perp * distance * side;

    Some(SketchElement::Line {
        start: Point2D { x: start.x + offset.x, y: start.y + offset.y },
        end: Point2D { x: end.x + offset.x, y: end.y + offset.y },
    })
}

/// Create an offset copy of a circle
#[allow(dead_code)]
pub fn offset_circle(circle: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<SketchElement> {
    let (center, radius) = match circle {
        SketchElement::Circle { center, radius } => (Point::new(center.x, center.y), *radius),
        _ => return None,
    };

    let click = to_point(click_point);
    let click_dist = (click - center).hypot();

    let new_radius = if click_dist < radius {
        (radius - distance).max(0.01)
    } else {
        radius + distance
    };

    Some(SketchElement::Circle {
        center: Point2D { x: center.x, y: center.y },
        radius: new_radius,
    })
}

/// Generic offset for any element
#[allow(dead_code)]
pub fn offset_element(element: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<Vec<SketchElement>> {
    match element {
        SketchElement::Line { .. } => offset_line(element, distance, click_point).map(|e| vec![e]),
        SketchElement::Circle { .. } => offset_circle(element, distance, click_point).map(|e| vec![e]),
        _ => None,
    }
}
