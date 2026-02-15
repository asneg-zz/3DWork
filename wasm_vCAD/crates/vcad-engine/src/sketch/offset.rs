//! Offset operations for sketch elements
//!
//! Simple, reliable implementations without external dependencies

use kurbo::{Point, Vec2};
use shared::{Point2D, SketchElement};

use super::geometry::to_point;

// ============================================================================
// OFFSET OPERATIONS - Simple implementations
// ============================================================================

/// Create an offset copy of a line
#[allow(dead_code)]
pub fn offset_line(line: &SketchElement, distance: f64, click_side: [f64; 2]) -> Option<SketchElement> {
    let (start, end) = match line {
        SketchElement::Line { start, end, .. } => (Point::new(start.x, start.y), Point::new(end.x, end.y)),
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
        id: None,
        start: Point2D { x: start.x + offset.x, y: start.y + offset.y },
        end: Point2D { x: end.x + offset.x, y: end.y + offset.y },
    })
}

/// Create an offset copy of a circle
#[allow(dead_code)]
pub fn offset_circle(circle: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<SketchElement> {
    let (center, radius) = match circle {
        SketchElement::Circle { center, radius, .. } => (Point::new(center.x, center.y), *radius),
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
        id: None,
        center: Point2D { x: center.x, y: center.y },
        radius: new_radius,
    })
}

/// Create an offset copy of an arc
#[allow(dead_code)]
pub fn offset_arc(arc: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<SketchElement> {
    let (center, radius, start_angle, end_angle) = match arc {
        SketchElement::Arc { center, radius, start_angle, end_angle, .. } =>
            (Point::new(center.x, center.y), *radius, *start_angle, *end_angle),
        _ => return None,
    };

    let click = to_point(click_point);
    let click_dist = (click - center).hypot();

    let new_radius = if click_dist < radius {
        (radius - distance).max(0.01)
    } else {
        radius + distance
    };

    Some(SketchElement::Arc {
        id: None,
        center: Point2D { x: center.x, y: center.y },
        radius: new_radius,
        start_angle,
        end_angle,
    })
}

/// Create an offset copy of a polyline (simple implementation)
#[allow(dead_code)]
pub fn offset_polyline(polyline: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<Vec<SketchElement>> {
    let points = match polyline {
        SketchElement::Polyline { id: None, points } => points,
        _ => return None,
    };

    if points.len() < 2 {
        return None;
    }

    // Determine offset direction based on first segment
    let first = Point::new(points[0].x, points[0].y);
    let second = Point::new(points[1].x, points[1].y);
    let dir = second - first;
    let len = dir.hypot();
    if len < 1e-10 {
        return None;
    }
    let perp = Vec2::new(-dir.y / len, dir.x / len);
    let mid = first.lerp(second, 0.5);
    let to_click = to_point(click_point) - mid;
    let side = if to_click.dot(perp) > 0.0 { 1.0 } else { -1.0 };

    // Offset each segment
    let mut offset_points = Vec::new();

    for i in 0..points.len() - 1 {
        let start = Point::new(points[i].x, points[i].y);
        let end = Point::new(points[i + 1].x, points[i + 1].y);

        let dir = end - start;
        let len = dir.hypot();
        if len < 1e-10 {
            continue;
        }

        let perp = Vec2::new(-dir.y / len, dir.x / len);
        let offset = perp * distance * side;

        if i == 0 {
            offset_points.push(Point2D { x: start.x + offset.x, y: start.y + offset.y });
        }
        offset_points.push(Point2D { x: end.x + offset.x, y: end.y + offset.y });
    }

    if offset_points.len() < 2 {
        return None;
    }

    Some(vec![SketchElement::Polyline { id: None, points: offset_points }])
}

/// Create an offset copy of a rectangle (simple implementation)
#[allow(dead_code)]
pub fn offset_rectangle(rect: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<Vec<SketchElement>> {
    let (corner, width, height) = match rect {
        SketchElement::Rectangle { corner, width, height, .. } => (corner, *width, *height),
        _ => return None,
    };

    // Determine if click is inside or outside
    let center = Point::new(corner.x + width / 2.0, corner.y + height / 2.0);
    let click = to_point(click_point);
    let to_click = click - center;
    let inside = to_click.x.abs() < width / 2.0 && to_click.y.abs() < height / 2.0;

    // Calculate offset direction
    let offset_dist = if inside { -distance } else { distance };

    // Calculate new rectangle with offset
    let new_corner_x = corner.x - offset_dist;
    let new_corner_y = corner.y - offset_dist;
    let new_width = width + 2.0 * offset_dist;
    let new_height = height + 2.0 * offset_dist;

    // Check if offset results in degenerate rectangle
    if new_width <= 0.01 || new_height <= 0.01 {
        return None;
    }

    // Create 4 lines for the offset rectangle (sharp corners)
    let points = vec![
        Point2D { x: new_corner_x, y: new_corner_y },
        Point2D { x: new_corner_x + new_width, y: new_corner_y },
        Point2D { x: new_corner_x + new_width, y: new_corner_y + new_height },
        Point2D { x: new_corner_x, y: new_corner_y + new_height },
        Point2D { x: new_corner_x, y: new_corner_y }, // Close the path
    ];

    Some(vec![SketchElement::Polyline { id: None, points }])
}

/// Create an offset copy of a spline (approximate with polyline)
#[allow(dead_code)]
pub fn offset_spline(spline: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<Vec<SketchElement>> {
    let control_points = match spline {
        SketchElement::Spline { id: None, points } => points,
        _ => return None,
    };

    if control_points.len() < 2 {
        return None;
    }

    // Use control points as approximation and offset as polyline
    let approximation = SketchElement::Polyline { id: None, points: control_points.clone() };
    offset_polyline(&approximation, distance, click_point)
}

/// Generic offset for any element
#[allow(dead_code)]
pub fn offset_element(element: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<Vec<SketchElement>> {
    match element {
        SketchElement::Line { .. } => offset_line(element, distance, click_point).map(|e| vec![e]),
        SketchElement::Circle { .. } => offset_circle(element, distance, click_point).map(|e| vec![e]),
        SketchElement::Arc { .. } => offset_arc(element, distance, click_point).map(|e| vec![e]),
        SketchElement::Polyline { .. } => offset_polyline(element, distance, click_point),
        SketchElement::Rectangle { .. } => offset_rectangle(element, distance, click_point),
        SketchElement::Spline { .. } => offset_spline(element, distance, click_point),
        SketchElement::Dimension { .. } => {
            tracing::warn!("Dimensions cannot be offset");
            None
        }
    }
}
