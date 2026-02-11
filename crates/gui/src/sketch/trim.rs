//! Trim operations for sketch elements

use kurbo::{Circle as KCircle, Line as KLine, Point};
use shared::{Point2D, Sketch, SketchElement};
use std::io::Write;

use super::geometry::{
    dedup_intersections, find_arc_intersections, find_circle_intersections, find_line_intersections,
    find_polyline_intersections, get_element_endpoints_for_trim, line_arc_intersection,
    line_circle_intersection, line_line_intersection, normalize_angle, param_to_angle,
    point_on_line, to_point,
};
use super::types::{Intersection, TrimResult};

/// Helper to log to file
fn log_trim(msg: &str) {
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/trim_debug.log")
    {
        let _ = writeln!(file, "{}", msg);
    }
}

// ============================================================================
// TRIM operations
// ============================================================================

/// Trim a line at intersection points
pub fn trim_line(
    idx: usize,
    start: [f64; 2],
    end: [f64; 2],
    click: [f64; 2],
    sketch: &Sketch,
) -> TrimResult {
    log_trim(&format!("=== trim_line: idx={}, start={:?}, end={:?}", idx, start, end));
    log_trim(&format!("  sketch has {} elements", sketch.elements.len()));

    let line = KLine::new(to_point(start), to_point(end));
    let ints = find_line_intersections(idx, line, sketch);

    log_trim(&format!("  found {} intersections", ints.len()));
    for (i, int) in ints.iter().enumerate() {
        log_trim(&format!("    int[{}]: point=({:.3}, {:.3}), param={:.3}", i, int.point.x, int.point.y, int.param));
    }

    if ints.is_empty() {
        log_trim("  -> NoChange (no intersections)");
        return TrimResult::NoChange;
    }

    // Find click parameter
    let click_pt = to_point(click);
    let line_vec = line.p1 - line.p0;
    let click_t = (click_pt - line.p0).dot(line_vec) / line_vec.dot(line_vec);

    // Find which segment to remove
    for (i, int) in ints.iter().enumerate() {
        if click_t < int.param {
            if i == 0 {
                // Remove from start to first intersection
                return TrimResult::Replaced(vec![SketchElement::Line {
                    start: Point2D { x: int.point.x, y: int.point.y },
                    end: Point2D { x: end[0], y: end[1] },
                }]);
            } else {
                // Remove segment between intersections
                let prev = &ints[i - 1];
                return TrimResult::Replaced(vec![
                    SketchElement::Line {
                        start: Point2D { x: start[0], y: start[1] },
                        end: Point2D { x: prev.point.x, y: prev.point.y },
                    },
                    SketchElement::Line {
                        start: Point2D { x: int.point.x, y: int.point.y },
                        end: Point2D { x: end[0], y: end[1] },
                    },
                ]);
            }
        }
    }

    // Remove from last intersection to end
    let last = ints.last().unwrap();
    TrimResult::Replaced(vec![SketchElement::Line {
        start: Point2D { x: start[0], y: start[1] },
        end: Point2D { x: last.point.x, y: last.point.y },
    }])
}

/// Trim an arc at intersection points
pub fn trim_arc(
    idx: usize,
    center: [f64; 2],
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    click: [f64; 2],
    sketch: &Sketch,
) -> TrimResult {
    log_trim(&format!("=== trim_arc: idx={}, center={:?}, r={:.3}, angles=[{:.3}, {:.3}]",
        idx, center, radius, start_angle, end_angle));
    log_trim(&format!("  sketch has {} elements", sketch.elements.len()));

    let c = to_point(center);
    let ints = find_arc_intersections(idx, c, radius, start_angle, end_angle, sketch);

    log_trim(&format!("  found {} intersections", ints.len()));
    for (i, int) in ints.iter().enumerate() {
        log_trim(&format!("    int[{}]: point=({:.3}, {:.3}), param={:.3}", i, int.point.x, int.point.y, int.param));
    }

    tracing::info!("trim_arc: found {} intersections", ints.len());

    if ints.is_empty() {
        log_trim("  -> NoChange (no intersections)");
        return TrimResult::NoChange;
    }

    // Find click parameter
    let click_angle = (click[1] - center[1]).atan2(click[0] - center[0]);
    let click_param = super::geometry::angle_to_param(click_angle, start_angle, end_angle);

    // Find which segment to remove
    for (i, int) in ints.iter().enumerate() {
        if click_param < int.param {
            let new_angle = param_to_angle(int.param, start_angle, end_angle);
            if i == 0 {
                // Remove from start to first intersection
                return TrimResult::Replaced(vec![SketchElement::Arc {
                    center: Point2D { x: center[0], y: center[1] },
                    radius,
                    start_angle: new_angle,
                    end_angle,
                }]);
            } else {
                // Remove segment between intersections
                let prev_angle = param_to_angle(ints[i - 1].param, start_angle, end_angle);
                return TrimResult::Replaced(vec![
                    SketchElement::Arc {
                        center: Point2D { x: center[0], y: center[1] },
                        radius,
                        start_angle,
                        end_angle: prev_angle,
                    },
                    SketchElement::Arc {
                        center: Point2D { x: center[0], y: center[1] },
                        radius,
                        start_angle: new_angle,
                        end_angle,
                    },
                ]);
            }
        }
    }

    // Remove from last intersection to end
    let last_angle = param_to_angle(ints.last().unwrap().param, start_angle, end_angle);
    TrimResult::Replaced(vec![SketchElement::Arc {
        center: Point2D { x: center[0], y: center[1] },
        radius,
        start_angle,
        end_angle: last_angle,
    }])
}

/// Trim a polyline at intersection points
pub fn trim_polyline(
    idx: usize,
    points: &[Point2D],
    click: [f64; 2],
    sketch: &Sketch,
) -> TrimResult {
    if points.len() < 2 {
        return TrimResult::NoChange;
    }

    let ints = find_polyline_intersections(idx, points, sketch);

    tracing::info!("trim_polyline: found {} intersections", ints.len());

    if ints.is_empty() {
        return TrimResult::NoChange;
    }

    // Find which segment the click is closest to
    let click_pt = to_point(click);
    let mut best_seg_idx = 0;
    let mut best_t = 0.0;
    let mut best_dist = f64::MAX;

    for seg_idx in 0..(points.len() - 1) {
        let seg_start = Point::new(points[seg_idx].x, points[seg_idx].y);
        let seg_end = Point::new(points[seg_idx + 1].x, points[seg_idx + 1].y);
        let seg_vec = seg_end - seg_start;
        let seg_len_sq = seg_vec.dot(seg_vec);

        if seg_len_sq < 1e-12 {
            continue;
        }

        let t = ((click_pt - seg_start).dot(seg_vec) / seg_len_sq).clamp(0.0, 1.0);
        let closest = seg_start + seg_vec * t;
        let dist = (click_pt - closest).hypot();

        if dist < best_dist {
            best_dist = dist;
            best_seg_idx = seg_idx;
            best_t = t;
        }
    }

    tracing::info!(
        "trim_polyline: click closest to segment {}, t={:.3}",
        best_seg_idx,
        best_t
    );

    // Convert click position to a global parameter for comparison
    // Global parameter = segment_idx + t within segment
    let click_global_param = best_seg_idx as f64 + best_t;

    // Find the surrounding intersections
    let mut prev_int: Option<&super::types::PolylineIntersection> = None;
    let mut next_int: Option<&super::types::PolylineIntersection> = None;

    for int in &ints {
        let int_global_param = int.segment_idx as f64 + int.segment_t;

        if int_global_param < click_global_param {
            prev_int = Some(int);
        } else if next_int.is_none() {
            next_int = Some(int);
            break;
        }
    }

    tracing::info!(
        "trim_polyline: prev_int={:?}, next_int={:?}",
        prev_int.map(|i| (i.segment_idx, i.segment_t)),
        next_int.map(|i| (i.segment_idx, i.segment_t))
    );

    // Build the result polylines
    let mut result = Vec::new();

    // Part before the clicked segment (from start to prev_int)
    if let Some(prev) = prev_int {
        let mut new_points = Vec::new();

        // Add all points before the intersection segment
        for i in 0..=prev.segment_idx {
            new_points.push(points[i].clone());
        }

        // Add the intersection point
        new_points.push(Point2D {
            x: prev.point.x,
            y: prev.point.y,
        });

        if new_points.len() >= 2 {
            result.push(SketchElement::Polyline { points: new_points });
        }
    }

    // Part after the clicked segment (from next_int to end)
    if let Some(next) = next_int {
        let mut new_points = Vec::new();

        // Add the intersection point
        new_points.push(Point2D {
            x: next.point.x,
            y: next.point.y,
        });

        // Add all points after the intersection segment
        for i in (next.segment_idx + 1)..points.len() {
            new_points.push(points[i].clone());
        }

        if new_points.len() >= 2 {
            result.push(SketchElement::Polyline { points: new_points });
        }
    }

    // Handle edge cases
    if result.is_empty() {
        // Only one intersection - determine which part to keep
        if let Some(prev) = prev_int {
            // Keep the part from start to intersection
            let mut new_points = Vec::new();
            for i in 0..=prev.segment_idx {
                new_points.push(points[i].clone());
            }
            new_points.push(Point2D {
                x: prev.point.x,
                y: prev.point.y,
            });
            if new_points.len() >= 2 {
                return TrimResult::Replaced(vec![SketchElement::Polyline { points: new_points }]);
            }
        } else if let Some(next) = next_int {
            // Keep the part from intersection to end
            let mut new_points = Vec::new();
            new_points.push(Point2D {
                x: next.point.x,
                y: next.point.y,
            });
            for i in (next.segment_idx + 1)..points.len() {
                new_points.push(points[i].clone());
            }
            if new_points.len() >= 2 {
                return TrimResult::Replaced(vec![SketchElement::Polyline { points: new_points }]);
            }
        }
        return TrimResult::NoChange;
    }

    TrimResult::Replaced(result)
}

/// Trim a rectangle at intersection points (converts to lines)
/// Rectangle is decomposed into 4 sides and we trim the clicked side
pub fn trim_rectangle(
    idx: usize,
    corner: [f64; 2],
    width: f64,
    height: f64,
    click: [f64; 2],
    sketch: &Sketch,
) -> TrimResult {
    // Decompose rectangle into 4 corners and find which side was clicked
    let corners = [
        [corner[0], corner[1]],
        [corner[0] + width, corner[1]],
        [corner[0] + width, corner[1] + height],
        [corner[0], corner[1] + height],
    ];

    let click_pt = to_point(click);
    let mut best_side = 0;
    let mut best_dist = f64::MAX;
    let mut best_t = 0.0;

    // Find which side the click is closest to
    for i in 0..4 {
        let j = (i + 1) % 4;
        let p0 = Point::new(corners[i][0], corners[i][1]);
        let p1 = Point::new(corners[j][0], corners[j][1]);
        let line_vec = p1 - p0;
        let len_sq = line_vec.dot(line_vec);

        if len_sq < 1e-12 {
            continue;
        }

        let t = ((click_pt - p0).dot(line_vec) / len_sq).clamp(0.0, 1.0);
        let closest = p0 + line_vec * t;
        let dist = (click_pt - closest).hypot();

        if dist < best_dist {
            best_dist = dist;
            best_side = i;
            best_t = t;
        }
    }

    tracing::info!(
        "trim_rectangle: click closest to side {}, t={:.3}, dist={:.3}",
        best_side,
        best_t,
        best_dist
    );

    // Find intersections on the clicked side
    let side_start = corners[best_side];
    let side_end = corners[(best_side + 1) % 4];
    let side_line = KLine::new(
        Point::new(side_start[0], side_start[1]),
        Point::new(side_end[0], side_end[1]),
    );

    let mut side_ints: Vec<Intersection> = Vec::new();

    for (i, elem) in sketch.elements.iter().enumerate() {
        if i == idx {
            continue;
        }

        match elem {
            SketchElement::Line { start, end } => {
                let other = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
                if let Some((t, u, pt)) = line_line_intersection(side_line, other) {
                    if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                        side_ints.push(Intersection { param: t, point: pt });
                    }
                }
            }
            SketchElement::Circle { center: c, radius: r } => {
                let circle = KCircle::new(Point::new(c.x, c.y), *r);
                for (t, pt) in line_circle_intersection(side_line, circle) {
                    if t > 1e-6 && t < 1.0 - 1e-6 {
                        side_ints.push(Intersection { param: t, point: pt });
                    }
                }
            }
            SketchElement::Arc { center: c, radius: r, start_angle, end_angle } => {
                let cp = Point::new(c.x, c.y);
                for (t, pt) in line_arc_intersection(side_line, cp, *r, *start_angle, *end_angle) {
                    if t > 1e-6 && t < 1.0 - 1e-6 {
                        side_ints.push(Intersection { param: t, point: pt });
                    }
                }
            }
            SketchElement::Polyline { points } => {
                for j in 0..(points.len().saturating_sub(1)) {
                    let seg = KLine::new(
                        Point::new(points[j].x, points[j].y),
                        Point::new(points[j + 1].x, points[j + 1].y),
                    );
                    if let Some((t, u, pt)) = line_line_intersection(side_line, seg) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            side_ints.push(Intersection { param: t, point: pt });
                        }
                    }
                }
            }
            _ => {}
        }

        // Also check if any endpoint of the other element lies ON this side
        let endpoint_tolerance = 0.01;
        for endpoint in get_element_endpoints_for_trim(elem) {
            if let Some(t) = point_on_line(endpoint, side_line, endpoint_tolerance) {
                side_ints.push(Intersection { param: t, point: endpoint });
            }
        }
    }

    side_ints.sort_by(|a, b| a.param.partial_cmp(&b.param).unwrap());
    dedup_intersections(&mut side_ints);

    tracing::info!("trim_rectangle: found {} intersections on side {}", side_ints.len(), best_side);

    if side_ints.is_empty() {
        return TrimResult::NoChange;
    }

    // Build resulting lines
    let mut result: Vec<SketchElement> = Vec::new();

    // Add the other 3 sides (not trimmed)
    for i in 0..4 {
        if i != best_side {
            let p0 = &corners[i];
            let p1 = &corners[(i + 1) % 4];
            result.push(SketchElement::Line {
                start: Point2D { x: p0[0], y: p0[1] },
                end: Point2D { x: p1[0], y: p1[1] },
            });
        }
    }

    // Trim the clicked side
    // Find which segment the click is in
    for (i, int) in side_ints.iter().enumerate() {
        if best_t < int.param {
            if i == 0 {
                // Keep from first intersection to end
                result.push(SketchElement::Line {
                    start: Point2D { x: int.point.x, y: int.point.y },
                    end: Point2D { x: side_end[0], y: side_end[1] },
                });
            } else {
                // Keep start to prev intersection and from this intersection to end
                let prev = &side_ints[i - 1];
                result.push(SketchElement::Line {
                    start: Point2D { x: side_start[0], y: side_start[1] },
                    end: Point2D { x: prev.point.x, y: prev.point.y },
                });
                result.push(SketchElement::Line {
                    start: Point2D { x: int.point.x, y: int.point.y },
                    end: Point2D { x: side_end[0], y: side_end[1] },
                });
            }
            return TrimResult::Replaced(result);
        }
    }

    // Click is after all intersections - keep from start to last intersection
    let last = side_ints.last().unwrap();
    result.push(SketchElement::Line {
        start: Point2D { x: side_start[0], y: side_start[1] },
        end: Point2D { x: last.point.x, y: last.point.y },
    });

    TrimResult::Replaced(result)
}

/// Trim a circle at intersection points (converts to arc)
pub fn trim_circle(
    idx: usize,
    center: [f64; 2],
    radius: f64,
    click: [f64; 2],
    sketch: &Sketch,
) -> TrimResult {
    let c = to_point(center);
    let ints = find_circle_intersections(idx, c, radius, sketch);

    tracing::info!("trim_circle: found {} intersections, angles: {:?}",
        ints.len(),
        ints.iter().map(|i| i.param).collect::<Vec<_>>());

    if ints.len() < 2 {
        return TrimResult::NoChange;
    }

    // Find click angle
    let click_angle = normalize_angle((click[1] - center[1]).atan2(click[0] - center[0]));
    tracing::info!("trim_circle: click_angle = {:.2} rad ({:.1}°)", click_angle, click_angle.to_degrees());

    // Find which segment the click is in
    let n = ints.len();
    for i in 0..n {
        let start_angle = ints[i].param;
        let end_angle = ints[(i + 1) % n].param;

        let in_segment = if start_angle <= end_angle {
            click_angle >= start_angle && click_angle <= end_angle
        } else {
            click_angle >= start_angle || click_angle <= end_angle
        };

        if in_segment {
            tracing::info!("trim_circle: click is in segment {} ({:.2} to {:.2})", i, start_angle, end_angle);

            if n == 2 {
                // Simple case: 2 intersections, create single arc for the other segment
                tracing::info!("trim_circle: 2 intersections, creating single arc {:.2} to {:.2}", end_angle, start_angle);
                return TrimResult::Replaced(vec![SketchElement::Arc {
                    center: Point2D { x: center[0], y: center[1] },
                    radius,
                    start_angle: end_angle,
                    end_angle: start_angle,
                }]);
            } else {
                // Multiple intersections: create arcs for all OTHER segments
                let mut arcs = Vec::new();
                for j in 0..n {
                    if j == i {
                        continue; // Skip the clicked segment
                    }
                    let arc_start = ints[j].param;
                    let arc_end = ints[(j + 1) % n].param;
                    tracing::info!("trim_circle: keeping segment {} as arc {:.2} to {:.2}", j, arc_start, arc_end);
                    arcs.push(SketchElement::Arc {
                        center: Point2D { x: center[0], y: center[1] },
                        radius,
                        start_angle: arc_start,
                        end_angle: arc_end,
                    });
                }
                return TrimResult::Replaced(arcs);
            }
        }
    }

    tracing::warn!("trim_circle: click_angle {:.2} not found in any segment", click_angle);
    TrimResult::NoChange
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_trim_arc_with_line() {
        let sketch = Sketch {
            elements: vec![
                SketchElement::Arc {
                    center: Point2D { x: 0.0, y: 0.0 },
                    radius: 1.0,
                    start_angle: 0.0,
                    end_angle: PI,
                },
                SketchElement::Line {
                    start: Point2D { x: 0.0, y: -2.0 },
                    end: Point2D { x: 0.0, y: 2.0 },
                },
            ],
            ..Default::default()
        };

        let result = trim_arc(0, [0.0, 0.0], 1.0, 0.0, PI, [0.5, 0.5], &sketch);
        assert!(matches!(result, TrimResult::Replaced(_)));
    }
}
