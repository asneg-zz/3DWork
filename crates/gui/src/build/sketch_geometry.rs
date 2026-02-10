//! Sketch geometry helpers (bounds, center calculations)

use shared::{Sketch, SketchElement};

/// Get bounding box of sketch elements
pub fn sketch_bounds(sketch: &Sketch) -> Option<(f64, f64, f64, f64)> {
    if sketch.elements.is_empty() {
        return None;
    }

    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;

    for elem in &sketch.elements {
        match elem {
            SketchElement::Line { start, end } => {
                min_x = min_x.min(start.x).min(end.x);
                min_y = min_y.min(start.y).min(end.y);
                max_x = max_x.max(start.x).max(end.x);
                max_y = max_y.max(start.y).max(end.y);
            }
            SketchElement::Rectangle {
                corner,
                width,
                height,
            } => {
                min_x = min_x.min(corner.x);
                min_y = min_y.min(corner.y);
                max_x = max_x.max(corner.x + width);
                max_y = max_y.max(corner.y + height);
            }
            SketchElement::Circle { center, radius } => {
                min_x = min_x.min(center.x - radius);
                min_y = min_y.min(center.y - radius);
                max_x = max_x.max(center.x + radius);
                max_y = max_y.max(center.y + radius);
            }
            _ => {}
        }
    }

    if min_x < max_x && min_y < max_y {
        Some((min_x, min_y, max_x, max_y))
    } else {
        None
    }
}
