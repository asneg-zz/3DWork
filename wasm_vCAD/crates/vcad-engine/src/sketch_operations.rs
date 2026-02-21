/// WASM bindings for sketch operations
use wasm_bindgen::prelude::*;
use shared::{Sketch, SketchElement, Point2D};
use serde::{Serialize, Deserialize};

/// Catmull-Rom spline interpolation for hit detection
fn interpolate_catmull_rom(points: &[Point2D], segments_per_span: usize) -> Vec<Point2D> {
    if points.len() < 2 {
        return points.to_vec();
    }
    if points.len() == 2 {
        return points.to_vec();
    }

    let tension = 0.5;
    let mut result = Vec::new();

    for i in 0..points.len() - 1 {
        let p0 = if i == 0 { &points[0] } else { &points[i - 1] };
        let p1 = &points[i];
        let p2 = &points[i + 1];
        let p3 = if i + 2 >= points.len() { &points[points.len() - 1] } else { &points[i + 2] };

        for j in 0..segments_per_span {
            let t = j as f64 / segments_per_span as f64;
            let t2 = t * t;
            let t3 = t2 * t;

            let x = tension * (
                (2.0 * p1.x) +
                (-p0.x + p2.x) * t +
                (2.0 * p0.x - 5.0 * p1.x + 4.0 * p2.x - p3.x) * t2 +
                (-p0.x + 3.0 * p1.x - 3.0 * p2.x + p3.x) * t3
            );
            let y = tension * (
                (2.0 * p1.y) +
                (-p0.y + p2.y) * t +
                (2.0 * p0.y - 5.0 * p1.y + 4.0 * p2.y - p3.y) * t2 +
                (-p0.y + 3.0 * p1.y - 3.0 * p2.y + p3.y) * t3
            );

            result.push(Point2D { x, y });
        }
    }

    // Add last point
    result.push(points[points.len() - 1].clone());
    result
}

/// Trim element at click point (finds intersections automatically)
#[wasm_bindgen]
pub fn sketch_trim_element(
    sketch_json: &str,
    element_index: usize,
    click_x: f64,
    click_y: f64,
) -> Result<JsValue, JsValue> {
    let mut sketch: Sketch = serde_json::from_str(sketch_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse sketch: {}", e)))?;

    if element_index >= sketch.elements.len() {
        return Err(JsValue::from_str("Element index out of bounds"));
    }

    let click = [click_x, click_y];
    let element = &sketch.elements[element_index];

    // Call appropriate trim function based on element type
    let trim_result = match element {
        shared::SketchElement::Line { start, end, .. } => {
            crate::sketch::trim::trim_line(
                element_index,
                [start.x, start.y],
                [end.x, end.y],
                click,
                &sketch,
            )
        }
        shared::SketchElement::Circle { center, radius, .. } => {
            crate::sketch::trim::trim_circle(
                element_index,
                [center.x, center.y],
                *radius,
                click,
                &sketch,
            )
        }
        shared::SketchElement::Arc { center, radius, start_angle, end_angle, .. } => {
            crate::sketch::trim::trim_arc(
                element_index,
                [center.x, center.y],
                *radius,
                *start_angle,
                *end_angle,
                click,
                &sketch,
            )
        }
        shared::SketchElement::Rectangle { corner, width, height, .. } => {
            crate::sketch::trim::trim_rectangle(
                element_index,
                [corner.x, corner.y],
                *width,
                *height,
                click,
                &sketch,
            )
        }
        shared::SketchElement::Polyline { points, .. } => {
            let pts: Vec<shared::Point2D> = points.iter().map(|p| shared::Point2D { x: p.x, y: p.y }).collect();
            crate::sketch::trim::trim_polyline(
                element_index,
                &pts,
                click,
                &sketch,
            )
        }
        shared::SketchElement::Spline { points, .. } => {
            // Treat spline as polyline for trimming (uses control points)
            let pts: Vec<shared::Point2D> = points.iter().map(|p| shared::Point2D { x: p.x, y: p.y }).collect();
            crate::sketch::trim::trim_spline(
                element_index,
                &pts,
                click,
                &sketch,
            )
        }
        _ => {
            return Err(JsValue::from_str("Unsupported element type for trim"));
        }
    };

    // Apply trim result
    match trim_result {
        crate::sketch::types::TrimResult::Removed => {
            sketch.elements.remove(element_index);
        }
        crate::sketch::types::TrimResult::Replaced(new_elements) => {
            sketch.elements.remove(element_index);
            for (i, elem) in new_elements.into_iter().enumerate() {
                sketch.elements.insert(element_index + i, elem);
            }
        }
        crate::sketch::types::TrimResult::NoChange => {
            return Err(JsValue::from_str("No intersection found to trim"));
        }
    }

    let json = serde_json::to_string(&sketch)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))?;

    Ok(JsValue::from_str(&json))
}

/// Create fillet between two lines
#[wasm_bindgen]
pub fn sketch_fillet_lines(
    sketch_json: &str,
    element1_index: usize,
    element2_index: usize,
    radius: f64,
) -> Result<JsValue, JsValue> {
    let mut sketch: Sketch = serde_json::from_str(sketch_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse sketch: {}", e)))?;

    let result = crate::sketch::fillet::fillet_lines(
        element1_index,
        element2_index,
        radius,
        &sketch,
    );

    if let Some(fillet_result) = result {
        // Update elements
        if let Some(elem1) = fillet_result.elem1 {
            sketch.elements[element1_index] = elem1;
        }
        if let Some(elem2) = fillet_result.elem2 {
            sketch.elements[element2_index] = elem2;
        }
        sketch.elements.push(fillet_result.fillet_arc);

        let json = serde_json::to_string(&sketch)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))?;

        Ok(JsValue::from_str(&json))
    } else {
        Err(JsValue::from_str("Fillet failed"))
    }
}

/// Offset element
#[wasm_bindgen]
pub fn sketch_offset_element(
    sketch_json: &str,
    element_index: usize,
    distance: f64,
    click_x: f64,
    click_y: f64,
) -> Result<JsValue, JsValue> {
    let mut sketch: Sketch = serde_json::from_str(sketch_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse sketch: {}", e)))?;

    if element_index >= sketch.elements.len() {
        return Err(JsValue::from_str("Element index out of bounds"));
    }

    let element = &sketch.elements[element_index];
    let click_point = [click_x, click_y];
    let offset = crate::sketch::offset::offset_element(element, distance, click_point);

    if let Some(new_elements) = offset {
        sketch.elements.extend(new_elements);

        let json = serde_json::to_string(&sketch)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))?;

        Ok(JsValue::from_str(&json))
    } else {
        Err(JsValue::from_str("Offset failed"))
    }
}

/// Reflect element about axis
#[wasm_bindgen]
pub fn sketch_mirror_element(
    sketch_json: &str,
    element_index: usize,
    axis_start_x: f64,
    axis_start_y: f64,
    axis_end_x: f64,
    axis_end_y: f64,
) -> Result<JsValue, JsValue> {
    let mut sketch: Sketch = serde_json::from_str(sketch_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse sketch: {}", e)))?;

    if element_index >= sketch.elements.len() {
        return Err(JsValue::from_str("Element index out of bounds"));
    }

    let element = &sketch.elements[element_index];
    let axis = ((axis_start_x, axis_start_y), (axis_end_x, axis_end_y));

    let mirrored = crate::sketch::geometry::reflect_element_about_line(element, axis);
    sketch.elements.push(mirrored);

    let json = serde_json::to_string(&sketch)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))?;

    Ok(JsValue::from_str(&json))
}

/// Linear pattern
#[wasm_bindgen]
pub fn sketch_linear_pattern(
    sketch_json: &str,
    element_index: usize,
    count: usize,
    dx: f64,
    dy: f64,
) -> Result<JsValue, JsValue> {
    let mut sketch: Sketch = serde_json::from_str(sketch_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse sketch: {}", e)))?;

    if element_index >= sketch.elements.len() {
        return Err(JsValue::from_str("Element index out of bounds"));
    }

    let element = &sketch.elements[element_index];
    let copies = crate::sketch::pattern::linear_pattern(element, count, dx, dy);

    sketch.elements.extend(copies);

    let json = serde_json::to_string(&sketch)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))?;

    Ok(JsValue::from_str(&json))
}

/// Circular pattern
#[wasm_bindgen]
pub fn sketch_circular_pattern(
    sketch_json: &str,
    element_index: usize,
    count: usize,
    center_x: f64,
    center_y: f64,
    angle: f64,
) -> Result<JsValue, JsValue> {
    let mut sketch: Sketch = serde_json::from_str(sketch_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse sketch: {}", e)))?;

    if element_index >= sketch.elements.len() {
        return Err(JsValue::from_str("Element index out of bounds"));
    }

    let element = &sketch.elements[element_index];
    let center = [center_x, center_y];
    let copies = crate::sketch::pattern::circular_pattern(element, count, angle, center);

    sketch.elements.extend(copies);

    let json = serde_json::to_string(&sketch)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))?;

    Ok(JsValue::from_str(&json))
}

// ========== UI Helper Functions ==========

/// Find element at point (hit detection for UI)
/// Returns element index or -1 if no element found
#[wasm_bindgen]
pub fn sketch_find_element_at_point(
    sketch_json: &str,
    point_x: f64,
    point_y: f64,
    threshold: f64,
) -> Result<i32, JsValue> {
    let sketch: Sketch = serde_json::from_str(sketch_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse sketch: {}", e)))?;

    let point = [point_x, point_y];

    // Search in reverse order (top elements first)
    for (i, element) in sketch.elements.iter().enumerate().rev() {
        let hit = match element {
            SketchElement::Line { start, end, .. } => {
                // Distance from point to line segment
                let dx = end.x - start.x;
                let dy = end.y - start.y;
                let len_sq = dx * dx + dy * dy;

                if len_sq == 0.0 {
                    continue;
                }

                let t = ((point[0] - start.x) * dx + (point[1] - start.y) * dy) / len_sq;
                let t = t.max(0.0).min(1.0);

                let proj_x = start.x + t * dx;
                let proj_y = start.y + t * dy;
                let dist = ((point[0] - proj_x).powi(2) + (point[1] - proj_y).powi(2)).sqrt();

                dist < threshold
            }
            SketchElement::Circle { center, radius, .. } => {
                let dist = ((point[0] - center.x).powi(2) + (point[1] - center.y).powi(2)).sqrt();
                (dist - radius).abs() < threshold
            }
            SketchElement::Arc { center, radius, start_angle, end_angle, .. } => {
                let dist = ((point[0] - center.x).powi(2) + (point[1] - center.y).powi(2)).sqrt();
                if (dist - radius).abs() > threshold {
                    false
                } else {
                    // Check if point is within arc angle range
                    let angle = (point[1] - center.y).atan2(point[0] - center.x);
                    crate::sketch::geometry::angle_in_arc_range(angle, *start_angle, *end_angle)
                }
            }
            SketchElement::Rectangle { corner, width, height, .. } => {
                let x = point[0];
                let y = point[1];
                let on_edge =
                    ((x - corner.x).abs() < threshold && y >= corner.y && y <= corner.y + height) ||
                    ((x - (corner.x + width)).abs() < threshold && y >= corner.y && y <= corner.y + height) ||
                    ((y - corner.y).abs() < threshold && x >= corner.x && x <= corner.x + width) ||
                    ((y - (corner.y + height)).abs() < threshold && x >= corner.x && x <= corner.x + width);
                on_edge
            }
            SketchElement::Polyline { points, .. } => {
                // Check each segment
                for j in 0..points.len() - 1 {
                    let start = &points[j];
                    let end = &points[j + 1];

                    let dx = end.x - start.x;
                    let dy = end.y - start.y;
                    let len_sq = dx * dx + dy * dy;

                    if len_sq == 0.0 {
                        continue;
                    }

                    let t = ((point[0] - start.x) * dx + (point[1] - start.y) * dy) / len_sq;
                    let t = t.max(0.0).min(1.0);

                    let proj_x = start.x + t * dx;
                    let proj_y = start.y + t * dy;
                    let dist = ((point[0] - proj_x).powi(2) + (point[1] - proj_y).powi(2)).sqrt();

                    if dist < threshold {
                        return Ok(i as i32);
                    }
                }
                false
            }
            SketchElement::Spline { points, .. } => {
                // Interpolate spline using Catmull-Rom and check interpolated segments
                let interpolated = interpolate_catmull_rom(points, 8);
                for j in 0..interpolated.len() - 1 {
                    let start = &interpolated[j];
                    let end = &interpolated[j + 1];

                    let dx = end.x - start.x;
                    let dy = end.y - start.y;
                    let len_sq = dx * dx + dy * dy;

                    if len_sq == 0.0 {
                        continue;
                    }

                    let t = ((point[0] - start.x) * dx + (point[1] - start.y) * dy) / len_sq;
                    let t = t.max(0.0).min(1.0);

                    let proj_x = start.x + t * dx;
                    let proj_y = start.y + t * dy;
                    let dist = ((point[0] - proj_x).powi(2) + (point[1] - proj_y).powi(2)).sqrt();

                    if dist < threshold {
                        return Ok(i as i32);
                    }
                }
                false
            }
            _ => false,
        };

        if hit {
            return Ok(i as i32);
        }
    }

    Ok(-1)
}

#[derive(serde::Serialize)]
struct ArcParams {
    center_x: f64,
    center_y: f64,
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    valid: bool,
}

/// Calculate arc parameters from 3 points
#[wasm_bindgen]
pub fn sketch_calculate_arc_from_3_points(
    p1_x: f64,
    p1_y: f64,
    p2_x: f64,
    p2_y: f64,
    p3_x: f64,
    p3_y: f64,
) -> Result<JsValue, JsValue> {
    // Calculate circle center from 3 points using perpendicular bisectors
    let ax = p2_x - p1_x;
    let ay = p2_y - p1_y;
    let bx = p3_x - p2_x;
    let by = p3_y - p2_y;

    let ma = ay / ax;
    let mb = by / bx;

    // Check if points are collinear
    if (ma - mb).abs() < 0.0001 {
        let result = ArcParams {
            center_x: 0.0,
            center_y: 0.0,
            radius: 0.0,
            start_angle: 0.0,
            end_angle: 0.0,
            valid: false,
        };
        return serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)));
    }

    let cx = (ma * mb * (p1_y - p3_y) + mb * (p1_x + p2_x) - ma * (p2_x + p3_x)) / (2.0 * (mb - ma));
    let cy = -(cx - (p1_x + p2_x) / 2.0) / ma + (p1_y + p2_y) / 2.0;

    let radius = ((p1_x - cx).powi(2) + (p1_y - cy).powi(2)).sqrt();

    // Calculate angles
    let start_angle = (p1_y - cy).atan2(p1_x - cx);
    let end_angle = (p3_y - cy).atan2(p3_x - cx);

    let result = ArcParams {
        center_x: cx,
        center_y: cy,
        radius,
        start_angle,
        end_angle,
        valid: true,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// ========== Snap Points System ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapPoint {
    pub x: f64,
    pub y: f64,
    pub snap_type: String,  // "endpoint", "midpoint", "center", "quadrant", "grid"
    pub source_element: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SnapSettings {
    pub enabled: bool,
    pub endpoint: bool,
    pub midpoint: bool,
    pub center: bool,
    pub quadrant: bool,
    pub grid: bool,
    pub grid_size: f64,
    pub snap_radius: f64,
}

/// Get all snap points for a sketch (for cursor snapping in UI)
#[wasm_bindgen]
pub fn sketch_get_snap_points(
    sketch_json: &str,
    cursor_x: f64,
    cursor_y: f64,
    settings_json: &str,
) -> Result<JsValue, JsValue> {
    let sketch: Sketch = serde_json::from_str(sketch_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse sketch: {}", e)))?;

    let settings: SnapSettings = serde_json::from_str(settings_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse settings: {}", e)))?;

    if !settings.enabled {
        return serde_wasm_bindgen::to_value(&Vec::<SnapPoint>::new())
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)));
    }

    let cursor = [cursor_x, cursor_y];
    let mut all_points = Vec::new();

    // Collect snap points from all elements
    for (i, element) in sketch.elements.iter().enumerate() {
        all_points.extend(get_element_snap_points(element, i, &settings));
    }

    // Filter by distance to cursor
    let mut nearby: Vec<SnapPoint> = all_points
        .into_iter()
        .filter(|sp| {
            let dist = ((sp.x - cursor[0]).powi(2) + (sp.y - cursor[1]).powi(2)).sqrt();
            dist < settings.snap_radius
        })
        .collect();

    // Sort by distance (closest first)
    nearby.sort_by(|a, b| {
        let dist_a = ((a.x - cursor[0]).powi(2) + (a.y - cursor[1]).powi(2)).sqrt();
        let dist_b = ((b.x - cursor[0]).powi(2) + (b.y - cursor[1]).powi(2)).sqrt();
        dist_a.partial_cmp(&dist_b).unwrap()
    });

    // If no element snap found, try grid snap
    if nearby.is_empty() && settings.grid {
        let snapped_x = (cursor[0] / settings.grid_size).round() * settings.grid_size;
        let snapped_y = (cursor[1] / settings.grid_size).round() * settings.grid_size;
        let grid_dist = ((cursor[0] - snapped_x).powi(2) + (cursor[1] - snapped_y).powi(2)).sqrt();

        if grid_dist < settings.snap_radius {
            nearby.push(SnapPoint {
                x: snapped_x,
                y: snapped_y,
                snap_type: "grid".to_string(),
                source_element: None,
            });
        }
    }

    serde_wasm_bindgen::to_value(&nearby)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Get snap points for a single element
fn get_element_snap_points(
    elem: &SketchElement,
    elem_index: usize,
    settings: &SnapSettings,
) -> Vec<SnapPoint> {
    let mut points = Vec::new();

    match elem {
        SketchElement::Line { start, end, .. } => {
            if settings.endpoint {
                points.push(SnapPoint {
                    x: start.x,
                    y: start.y,
                    snap_type: "endpoint".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: end.x,
                    y: end.y,
                    snap_type: "endpoint".to_string(),
                    source_element: Some(elem_index),
                });
            }
            if settings.midpoint {
                points.push(SnapPoint {
                    x: (start.x + end.x) / 2.0,
                    y: (start.y + end.y) / 2.0,
                    snap_type: "midpoint".to_string(),
                    source_element: Some(elem_index),
                });
            }
        }

        SketchElement::Circle { center, radius, .. } => {
            if settings.center {
                points.push(SnapPoint {
                    x: center.x,
                    y: center.y,
                    snap_type: "center".to_string(),
                    source_element: Some(elem_index),
                });
            }
            if settings.quadrant {
                // 4 quadrant points: 0°, 90°, 180°, 270°
                points.push(SnapPoint {
                    x: center.x + radius,
                    y: center.y,
                    snap_type: "quadrant".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: center.x,
                    y: center.y + radius,
                    snap_type: "quadrant".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: center.x - radius,
                    y: center.y,
                    snap_type: "quadrant".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: center.x,
                    y: center.y - radius,
                    snap_type: "quadrant".to_string(),
                    source_element: Some(elem_index),
                });
            }
        }

        SketchElement::Arc { center, radius, start_angle, end_angle, .. } => {
            if settings.center {
                points.push(SnapPoint {
                    x: center.x,
                    y: center.y,
                    snap_type: "center".to_string(),
                    source_element: Some(elem_index),
                });
            }
            if settings.endpoint {
                // Start and end points of arc
                let start_x = center.x + radius * start_angle.cos();
                let start_y = center.y + radius * start_angle.sin();
                let end_x = center.x + radius * end_angle.cos();
                let end_y = center.y + radius * end_angle.sin();

                points.push(SnapPoint {
                    x: start_x,
                    y: start_y,
                    snap_type: "endpoint".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: end_x,
                    y: end_y,
                    snap_type: "endpoint".to_string(),
                    source_element: Some(elem_index),
                });
            }
        }

        SketchElement::Rectangle { corner, width, height, .. } => {
            if settings.endpoint {
                // 4 corners
                points.push(SnapPoint {
                    x: corner.x,
                    y: corner.y,
                    snap_type: "endpoint".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: corner.x + width,
                    y: corner.y,
                    snap_type: "endpoint".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: corner.x + width,
                    y: corner.y + height,
                    snap_type: "endpoint".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: corner.x,
                    y: corner.y + height,
                    snap_type: "endpoint".to_string(),
                    source_element: Some(elem_index),
                });
            }
            if settings.midpoint {
                // Midpoints of sides
                points.push(SnapPoint {
                    x: corner.x + width / 2.0,
                    y: corner.y,
                    snap_type: "midpoint".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: corner.x + width,
                    y: corner.y + height / 2.0,
                    snap_type: "midpoint".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: corner.x + width / 2.0,
                    y: corner.y + height,
                    snap_type: "midpoint".to_string(),
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    x: corner.x,
                    y: corner.y + height / 2.0,
                    snap_type: "midpoint".to_string(),
                    source_element: Some(elem_index),
                });
            }
            if settings.center {
                points.push(SnapPoint {
                    x: corner.x + width / 2.0,
                    y: corner.y + height / 2.0,
                    snap_type: "center".to_string(),
                    source_element: Some(elem_index),
                });
            }
        }

        SketchElement::Polyline { points: poly_pts, .. } => {
            if settings.endpoint {
                for pt in poly_pts {
                    points.push(SnapPoint {
                        x: pt.x,
                        y: pt.y,
                        snap_type: "endpoint".to_string(),
                        source_element: Some(elem_index),
                    });
                }
            }
            if settings.midpoint && poly_pts.len() >= 2 {
                for i in 0..poly_pts.len() - 1 {
                    points.push(SnapPoint {
                        x: (poly_pts[i].x + poly_pts[i + 1].x) / 2.0,
                        y: (poly_pts[i].y + poly_pts[i + 1].y) / 2.0,
                        snap_type: "midpoint".to_string(),
                        source_element: Some(elem_index),
                    });
                }
            }
        }

        SketchElement::Spline { points: spline_pts, .. } => {
            if settings.endpoint {
                for pt in spline_pts {
                    points.push(SnapPoint {
                        x: pt.x,
                        y: pt.y,
                        snap_type: "endpoint".to_string(),
                        source_element: Some(elem_index),
                    });
                }
            }
        }

        _ => {}
    }

    points
}

// ========== Constraint Solving ==========

/// Solve all constraints in the sketch
/// Returns updated sketch with constraints satisfied
#[wasm_bindgen]
pub fn sketch_solve_constraints(
    sketch_json: &str,
) -> Result<JsValue, JsValue> {
    let mut sketch: Sketch = serde_json::from_str(sketch_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse sketch: {}", e)))?;

    // Call constraint solver from sketch module
    let satisfied = crate::sketch::constraints::solve_constraints(&mut sketch);

    if !satisfied {
        tracing::warn!("Constraint solver did not converge within max iterations");
    }

    let json = serde_json::to_string(&sketch)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))?;

    Ok(JsValue::from_str(&json))
}
