//! Sketch validation functions for extrusion and other operations

use shared::{Sketch, SketchElement};

use super::geometry::find_element_intersections;
use super::types::SketchValidation;

// ============================================================================
// SKETCH VALIDATION (for extrusion)
// ============================================================================

/// Validate sketch for extrusion operation
/// Checks if the sketch is closed and has no self-intersections
#[allow(dead_code)]
pub fn validate_sketch_for_extrusion(sketch: &Sketch) -> SketchValidation {
    if sketch.elements.is_empty() {
        return SketchValidation {
            is_valid: false,
            is_closed: false,
            has_self_intersections: false,
            error_message: Some("Sketch is empty".to_string()),
        };
    }

    // Single closed element (Circle, Rectangle) is always valid
    if sketch.elements.len() == 1 {
        match &sketch.elements[0] {
            SketchElement::Circle { .. } | SketchElement::Rectangle { .. } => {
                return SketchValidation {
                    is_valid: true,
                    is_closed: true,
                    has_self_intersections: false,
                    error_message: None,
                };
            }
            _ => {}
        }
    }

    // Check if contour is closed
    let is_closed = check_contour_closed(sketch);
    if !is_closed {
        return SketchValidation {
            is_valid: false,
            is_closed: false,
            has_self_intersections: false,
            error_message: Some("Contour is not closed".to_string()),
        };
    }

    // Check for self-intersections
    let has_self_intersections = check_self_intersections(sketch);
    if has_self_intersections {
        return SketchValidation {
            is_valid: false,
            is_closed: true,
            has_self_intersections: true,
            error_message: Some("Contour has self-intersections".to_string()),
        };
    }

    SketchValidation {
        is_valid: true,
        is_closed: true,
        has_self_intersections: false,
        error_message: None,
    }
}

/// Check if sketch elements form a closed contour
#[allow(dead_code)]
pub fn check_contour_closed(sketch: &Sketch) -> bool {
    // Filter chainable elements
    let chainable: Vec<&SketchElement> = sketch.elements.iter().filter(|e| {
        matches!(e,
            SketchElement::Line { .. } |
            SketchElement::Arc { .. } |
            SketchElement::Polyline { .. }
        )
    }).collect();

    if chainable.is_empty() {
        // Only circles/rectangles - they are closed by definition
        return sketch.elements.iter().all(|e| {
            matches!(e, SketchElement::Circle { .. } | SketchElement::Rectangle { .. })
        });
    }

    // Get endpoints of all chainable elements
    let mut endpoints: Vec<([f64; 2], [f64; 2])> = Vec::new();
    for elem in &chainable {
        if let Some((start, end)) = get_element_endpoints(elem) {
            endpoints.push((start, end));
        }
    }

    if endpoints.is_empty() {
        return false;
    }

    // Try to form a chain starting from first element
    let mut used = vec![false; endpoints.len()];
    let mut current_end = endpoints[0].1;
    let chain_start = endpoints[0].0;
    used[0] = true;
    let mut chain_len = 1;

    const TOLERANCE: f64 = 1e-4;

    // Greedy chaining
    loop {
        let mut found = false;
        for i in 0..endpoints.len() {
            if used[i] {
                continue;
            }
            let (start, end) = endpoints[i];
            if points_close(current_end, start, TOLERANCE) {
                current_end = end;
                used[i] = true;
                chain_len += 1;
                found = true;
                break;
            } else if points_close(current_end, end, TOLERANCE) {
                // Reversed direction
                current_end = start;
                used[i] = true;
                chain_len += 1;
                found = true;
                break;
            }
        }
        if !found {
            break;
        }
    }

    // Check if chain is closed (end connects to start) and all elements used
    chain_len == endpoints.len() && points_close(current_end, chain_start, TOLERANCE)
}

/// Check if sketch has self-intersections (elements crossing each other improperly)
#[allow(dead_code)]
pub fn check_self_intersections(sketch: &Sketch) -> bool {
    let elements = &sketch.elements;
    let n = elements.len();

    for i in 0..n {
        for j in (i + 1)..n {
            // Skip adjacent elements (they share endpoints)
            let adjacent = (j == (i + 1) % n) || (i == 0 && j == n - 1);

            let intersections = find_element_intersections(&elements[i], &elements[j]);

            if adjacent {
                // Adjacent elements can have 1 intersection at shared endpoint
                if intersections.len() > 1 {
                    return true;
                }
            } else {
                // Non-adjacent elements should not intersect
                if !intersections.is_empty() {
                    return true;
                }
            }
        }
    }

    false
}

/// Get start and end points of a chainable element
#[allow(dead_code)]
fn get_element_endpoints(elem: &SketchElement) -> Option<([f64; 2], [f64; 2])> {
    match elem {
        SketchElement::Line { start, end, .. } => {
            Some(([start.x, start.y], [end.x, end.y]))
        }
        SketchElement::Arc { center, radius, start_angle, end_angle, .. } => {
            let start = [
                center.x + radius * start_angle.cos(),
                center.y + radius * start_angle.sin(),
            ];
            let end = [
                center.x + radius * end_angle.cos(),
                center.y + radius * end_angle.sin(),
            ];
            Some((start, end))
        }
        SketchElement::Polyline { points, .. } => {
            if points.len() >= 2 {
                let first = &points[0];
                let last = &points[points.len() - 1];
                Some(([first.x, first.y], [last.x, last.y]))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Check if two points are close within tolerance
#[allow(dead_code)]
fn points_close(a: [f64; 2], b: [f64; 2], tol: f64) -> bool {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    dx * dx + dy * dy < tol * tol
}
