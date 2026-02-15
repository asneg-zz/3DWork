//! Pattern operations for sketch elements
//!
//! Linear pattern: copies elements along a direction with fixed spacing
//! Circular pattern: copies elements around a center point with angular spacing

use shared::{Point2D, SketchElement};

/// Apply linear pattern to an element
/// Returns a list of copied elements (not including the original)
pub fn linear_pattern(
    element: &SketchElement,
    count: usize,
    spacing: f64,
    direction: f64, // radians, 0 = along X
) -> Vec<SketchElement> {
    if count < 2 {
        return Vec::new();
    }

    let dx = spacing * direction.cos();
    let dy = spacing * direction.sin();

    let mut result = Vec::with_capacity(count - 1);

    for i in 1..count {
        let offset_x = dx * i as f64;
        let offset_y = dy * i as f64;
        if let Some(translated) = translate_element(element, offset_x, offset_y) {
            result.push(translated);
        }
    }

    result
}

/// Apply circular pattern to an element
/// Returns a list of copied elements (not including the original)
pub fn circular_pattern(
    element: &SketchElement,
    count: usize,
    total_angle: f64, // degrees
    center: [f64; 2],
) -> Vec<SketchElement> {
    if count < 2 {
        return Vec::new();
    }

    let angle_step = total_angle.to_radians() / count as f64;

    let mut result = Vec::with_capacity(count - 1);

    for i in 1..count {
        let angle = angle_step * i as f64;
        if let Some(rotated) = rotate_element(element, center, angle) {
            result.push(rotated);
        }
    }

    result
}

/// Translate an element by (dx, dy)
fn translate_element(element: &SketchElement, dx: f64, dy: f64) -> Option<SketchElement> {
    match element {
        SketchElement::Line { start, end, .. } => Some(SketchElement::Line {
        id: None,
            start: Point2D { x: start.x + dx, y: start.y + dy },
            end: Point2D { x: end.x + dx, y: end.y + dy },
        }),
        SketchElement::Circle { center, radius, .. } => Some(SketchElement::Circle {
        id: None,
            center: Point2D { x: center.x + dx, y: center.y + dy },
            radius: *radius,
        }),
        SketchElement::Arc { center, radius, start_angle, end_angle, .. } => Some(SketchElement::Arc {
        id: None,
            center: Point2D { x: center.x + dx, y: center.y + dy },
            radius: *radius,
            start_angle: *start_angle,
            end_angle: *end_angle,
        }),
        SketchElement::Rectangle { corner, width, height, .. } => Some(SketchElement::Rectangle {
        id: None,
            corner: Point2D { x: corner.x + dx, y: corner.y + dy },
            width: *width,
            height: *height,
        }),
        SketchElement::Polyline { points, .. } => {
            let translated_points: Vec<Point2D> = points
                .iter()
                .map(|p| Point2D { x: p.x + dx, y: p.y + dy })
                .collect();
            Some(SketchElement::Polyline { id: None, points: translated_points })
        }
        SketchElement::Spline { points, .. } => {
            let translated_points: Vec<Point2D> = points
                .iter()
                .map(|p| Point2D { x: p.x + dx, y: p.y + dy })
                .collect();
            Some(SketchElement::Spline { id: None, points: translated_points })
        }
        SketchElement::Dimension { .. } => None, // Don't copy dimensions
    }
}

/// Rotate an element around a center point
fn rotate_element(element: &SketchElement, center: [f64; 2], angle: f64) -> Option<SketchElement> {
    let rotate_point = |p: &Point2D| -> Point2D {
        let dx = p.x - center[0];
        let dy = p.y - center[1];
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        Point2D {
            x: center[0] + dx * cos_a - dy * sin_a,
            y: center[1] + dx * sin_a + dy * cos_a,
        }
    };

    match element {
        SketchElement::Line { start, end, .. } => Some(SketchElement::Line {
        id: None,
            start: rotate_point(start),
            end: rotate_point(end),
        }),
        SketchElement::Circle { center: c, radius, .. } => Some(SketchElement::Circle {
        id: None,
            center: rotate_point(c),
            radius: *radius,
        }),
        SketchElement::Arc { center: c, radius, start_angle, end_angle, .. } => Some(SketchElement::Arc {
        id: None,
            center: rotate_point(c),
            radius: *radius,
            start_angle: start_angle + angle,
            end_angle: end_angle + angle,
        }),
        SketchElement::Rectangle { corner, width, height, .. } => {
            // For rectangles, we rotate all 4 corners and create a polyline
            // (rotated rectangle is no longer axis-aligned)
            let corners = [
                Point2D { x: corner.x, y: corner.y },
                Point2D { x: corner.x + width, y: corner.y },
                Point2D { x: corner.x + width, y: corner.y + height },
                Point2D { x: corner.x, y: corner.y + height },
                Point2D { x: corner.x, y: corner.y }, // close the shape
            ];
            let rotated_corners: Vec<Point2D> = corners.iter().map(|p| rotate_point(p)).collect();
            Some(SketchElement::Polyline { id: None, points: rotated_corners })
        }
        SketchElement::Polyline { points, .. } => {
            let rotated_points: Vec<Point2D> = points.iter().map(|p| rotate_point(p)).collect();
            Some(SketchElement::Polyline { id: None, points: rotated_points })
        }
        SketchElement::Spline { points, .. } => {
            let rotated_points: Vec<Point2D> = points.iter().map(|p| rotate_point(p)).collect();
            Some(SketchElement::Spline { id: None, points: rotated_points })
        }
        SketchElement::Dimension { .. } => None, // Don't copy dimensions
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_linear_pattern_line() {
        let line = SketchElement::Line {
        id: None,
            start: Point2D { x: 0.0, y: 0.0 },
            end: Point2D { x: 1.0, y: 0.0 },
        };

        let copies = linear_pattern(&line, 3, 2.0, 0.0); // 3 copies along X
        assert_eq!(copies.len(), 2);

        if let SketchElement::Line { start, end, .. } = &copies[0] {
            assert!((start.x - 2.0).abs() < 1e-10);
            assert!((end.x - 3.0).abs() < 1e-10);
        } else {
            panic!("Expected Line");
        }

        if let SketchElement::Line { start, end, .. } = &copies[1] {
            assert!((start.x - 4.0).abs() < 1e-10);
            assert!((end.x - 5.0).abs() < 1e-10);
        } else {
            panic!("Expected Line");
        }
    }

    #[test]
    fn test_circular_pattern_line() {
        let line = SketchElement::Line {
        id: None,
            start: Point2D { x: 1.0, y: 0.0 },
            end: Point2D { x: 2.0, y: 0.0 },
        };

        let copies = circular_pattern(&line, 4, 360.0, [0.0, 0.0]);
        assert_eq!(copies.len(), 3);

        // First copy should be at 90 degrees
        if let SketchElement::Line { start, end, .. } = &copies[0] {
            assert!((start.x).abs() < 1e-10);
            assert!((start.y - 1.0).abs() < 1e-10);
        } else {
            panic!("Expected Line");
        }
    }

    #[test]
    fn test_linear_pattern_count_one() {
        let line = SketchElement::Line {
        id: None,
            start: Point2D { x: 0.0, y: 0.0 },
            end: Point2D { x: 1.0, y: 0.0 },
        };

        let copies = linear_pattern(&line, 1, 2.0, 0.0);
        assert!(copies.is_empty());
    }
}
