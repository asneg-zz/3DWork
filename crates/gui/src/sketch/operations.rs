//! Sketch modification operations: Trim, Fillet, Offset
//!
//! Note: These operations are currently disabled during V2 architecture migration.
//! They will be re-enabled once the core sketch editing is stabilized.

#![allow(dead_code)]

use shared::{Point2D, Sketch, SketchElement};

/// Result of a trim operation
pub enum TrimResult {
    /// The element was completely removed
    Removed,
    /// The element was trimmed and replaced with new element(s)
    Replaced(Vec<SketchElement>),
    /// Nothing happened (no intersection found)
    NoChange,
}

/// Result of a fillet operation
pub struct FilletResult {
    /// The arc that forms the fillet
    pub fillet_arc: SketchElement,
    /// Modified first element (trimmed to fillet)
    pub elem1: Option<SketchElement>,
    /// Modified second element (trimmed to fillet)
    pub elem2: Option<SketchElement>,
}

// ============================================================================
// Geometry helpers
// ============================================================================

fn distance_2d(a: [f64; 2], b: [f64; 2]) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    (dx * dx + dy * dy).sqrt()
}

fn normalize_2d(v: [f64; 2]) -> [f64; 2] {
    let len = (v[0] * v[0] + v[1] * v[1]).sqrt();
    if len < 1e-10 {
        [0.0, 0.0]
    } else {
        [v[0] / len, v[1] / len]
    }
}

fn dot_2d(a: [f64; 2], b: [f64; 2]) -> f64 {
    a[0] * b[0] + a[1] * b[1]
}

fn cross_2d(a: [f64; 2], b: [f64; 2]) -> f64 {
    a[0] * b[1] - a[1] * b[0]
}

/// Find intersection of two line segments
/// Returns parameter t for first line (0..1) and u for second (0..1)
fn line_line_intersection(
    p1: [f64; 2],
    p2: [f64; 2],
    p3: [f64; 2],
    p4: [f64; 2],
) -> Option<(f64, f64, [f64; 2])> {
    let d1 = [p2[0] - p1[0], p2[1] - p1[1]];
    let d2 = [p4[0] - p3[0], p4[1] - p3[1]];

    let cross = cross_2d(d1, d2);
    if cross.abs() < 1e-10 {
        return None; // Parallel lines
    }

    let d = [p3[0] - p1[0], p3[1] - p1[1]];
    let t = cross_2d(d, d2) / cross;
    let u = cross_2d(d, d1) / cross;

    let pt = [p1[0] + t * d1[0], p1[1] + t * d1[1]];
    Some((t, u, pt))
}

/// Find intersection of a line with a circle
/// Returns parameter t values for the line where it intersects the circle
fn line_circle_intersection(
    line_start: [f64; 2],
    line_end: [f64; 2],
    center: [f64; 2],
    radius: f64,
) -> Vec<(f64, [f64; 2])> {
    let d = [line_end[0] - line_start[0], line_end[1] - line_start[1]];
    let f = [line_start[0] - center[0], line_start[1] - center[1]];

    let a = dot_2d(d, d);
    let b = 2.0 * dot_2d(f, d);
    let c = dot_2d(f, f) - radius * radius;

    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return Vec::new();
    }

    let mut results = Vec::new();
    let sqrt_disc = discriminant.sqrt();

    let t1 = (-b - sqrt_disc) / (2.0 * a);
    let t2 = (-b + sqrt_disc) / (2.0 * a);

    for t in [t1, t2] {
        let pt = [line_start[0] + t * d[0], line_start[1] + t * d[1]];
        results.push((t, pt));
    }

    results
}

// ============================================================================
// TRIM operation
// ============================================================================

/// Check if a point lies on a line segment, returns parameter t if it does
fn point_on_line_segment(point: [f64; 2], line_start: [f64; 2], line_end: [f64; 2], tolerance: f64) -> Option<f64> {
    let line_vec = [line_end[0] - line_start[0], line_end[1] - line_start[1]];
    let line_len_sq = line_vec[0] * line_vec[0] + line_vec[1] * line_vec[1];
    if line_len_sq < 1e-12 {
        return None;
    }

    let point_vec = [point[0] - line_start[0], point[1] - line_start[1]];
    let t = dot_2d(point_vec, line_vec) / line_len_sq;

    // Check if t is within segment (with small margin to exclude endpoints of the line being trimmed)
    if !(1e-6..=1.0 - 1e-6).contains(&t) {
        return None;
    }

    // Check distance from point to line
    let closest = [line_start[0] + t * line_vec[0], line_start[1] + t * line_vec[1]];
    let dist = distance_2d(point, closest);

    if dist < tolerance {
        Some(t)
    } else {
        None
    }
}

/// Find all intersection points of a line with other elements
fn find_line_intersections(
    line_idx: usize,
    line_start: [f64; 2],
    line_end: [f64; 2],
    sketch: &Sketch,
) -> Vec<(f64, [f64; 2])> {
    let mut intersections = Vec::new();
    let tolerance = 1e-4; // Tolerance for endpoint connections

    for (i, elem) in sketch.elements.iter().enumerate() {
        if i == line_idx {
            continue;
        }

        match elem {
            SketchElement::Line { start, end } => {
                let p3 = [start.x, start.y];
                let p4 = [end.x, end.y];

                // Check for true intersection (lines cross each other)
                if let Some((t, u, pt)) = line_line_intersection(line_start, line_end, p3, p4) {
                    // Only count if intersection is within both segments
                    if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                        intersections.push((t, pt));
                    }
                }

                // Also check if endpoints of the other line lie on our line
                // This handles the case where lines connect at endpoints
                if let Some(t) = point_on_line_segment(p3, line_start, line_end, tolerance) {
                    intersections.push((t, p3));
                }
                if let Some(t) = point_on_line_segment(p4, line_start, line_end, tolerance) {
                    intersections.push((t, p4));
                }
            }
            SketchElement::Circle { center, radius } => {
                let c = [center.x, center.y];
                for (t, pt) in line_circle_intersection(line_start, line_end, c, *radius) {
                    if t > 1e-6 && t < 1.0 - 1e-6 {
                        intersections.push((t, pt));
                    }
                }
            }
            SketchElement::Rectangle { corner, width, height } => {
                // Check all 4 sides
                let corners = [
                    [corner.x, corner.y],
                    [corner.x + width, corner.y],
                    [corner.x + width, corner.y + height],
                    [corner.x, corner.y + height],
                ];
                for j in 0..4 {
                    let p3 = corners[j];
                    let p4 = corners[(j + 1) % 4];
                    if let Some((t, u, pt)) = line_line_intersection(line_start, line_end, p3, p4)
                    {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            intersections.push((t, pt));
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // Sort by parameter t
    intersections.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    // Remove duplicates (points that are very close to each other)
    let mut deduped: Vec<(f64, [f64; 2])> = Vec::new();
    for (t, pt) in intersections {
        let dominated = deduped.iter().any(|(dt, _)| (t - dt).abs() < 1e-4);
        if !dominated {
            deduped.push((t, pt));
        }
    }

    deduped
}

/// Trim a line segment at intersection points.
/// click_t is the parameter (0..1) where the user clicked on the line.
/// Returns new elements that should replace the original.
pub fn trim_line(
    line_idx: usize,
    line_start: [f64; 2],
    line_end: [f64; 2],
    click_point: [f64; 2],
    sketch: &Sketch,
) -> TrimResult {
    let intersections = find_line_intersections(line_idx, line_start, line_end, sketch);

    if intersections.is_empty() {
        return TrimResult::NoChange;
    }

    // Find click_t (parameter where user clicked)
    let line_vec = [line_end[0] - line_start[0], line_end[1] - line_start[1]];
    let line_len = (line_vec[0] * line_vec[0] + line_vec[1] * line_vec[1]).sqrt();
    let click_vec = [click_point[0] - line_start[0], click_point[1] - line_start[1]];
    let click_t = dot_2d(click_vec, line_vec) / (line_len * line_len);

    // Find which segment the click is in
    for (i, (t, _pt)) in intersections.iter().enumerate() {
        if click_t < *t {
            // Click is between prev and t - remove this segment
            if i == 0 {
                // Remove from start to first intersection
                let new_start = intersections[0].1;
                return TrimResult::Replaced(vec![SketchElement::Line {
                    start: Point2D {
                        x: new_start[0],
                        y: new_start[1],
                    },
                    end: Point2D {
                        x: line_end[0],
                        y: line_end[1],
                    },
                }]);
            } else {
                // Remove segment between two intersections - split into two lines
                return TrimResult::Replaced(vec![
                    // Line from start to previous intersection
                    SketchElement::Line {
                        start: Point2D {
                            x: line_start[0],
                            y: line_start[1],
                        },
                        end: Point2D {
                            x: intersections[i - 1].1[0],
                            y: intersections[i - 1].1[1],
                        },
                    },
                    // Line from current intersection to end
                    SketchElement::Line {
                        start: Point2D {
                            x: intersections[i].1[0],
                            y: intersections[i].1[1],
                        },
                        end: Point2D {
                            x: line_end[0],
                            y: line_end[1],
                        },
                    },
                ]);
            }
        }
    }

    // Click is after last intersection - remove from last intersection to end
    let last_pt = intersections.last().unwrap().1;
    TrimResult::Replaced(vec![SketchElement::Line {
        start: Point2D {
            x: line_start[0],
            y: line_start[1],
        },
        end: Point2D {
            x: last_pt[0],
            y: last_pt[1],
        },
    }])
}

// ============================================================================
// FILLET operation
// ============================================================================

/// Create a fillet (arc) at the intersection of two lines
pub fn fillet_lines(
    line1_idx: usize,
    line2_idx: usize,
    radius: f64,
    sketch: &Sketch,
) -> Option<FilletResult> {
    let elem1 = sketch.elements.get(line1_idx)?;
    let elem2 = sketch.elements.get(line2_idx)?;

    let (p1, p2) = match elem1 {
        SketchElement::Line { start, end } => ([start.x, start.y], [end.x, end.y]),
        _ => return None,
    };

    let (p3, p4) = match elem2 {
        SketchElement::Line { start, end } => ([start.x, start.y], [end.x, end.y]),
        _ => return None,
    };

    // Find intersection point
    let (t1, t2, intersection) = line_line_intersection(p1, p2, p3, p4)?;

    // Direction vectors (from p1 to p2, and p3 to p4)
    let d1_raw = normalize_2d([p2[0] - p1[0], p2[1] - p1[1]]);
    let d2_raw = normalize_2d([p4[0] - p3[0], p4[1] - p3[1]]);

    // Choose directions pointing AWAY from intersection (toward line endpoints)
    // If t < 0.5, intersection is closer to start, so away direction is toward end (same as d_raw)
    // If t >= 0.5, intersection is closer to end, so away direction is toward start (reverse d_raw)
    let d1 = if t1 < 0.5 {
        d1_raw  // toward p2 (away from intersection)
    } else {
        [-d1_raw[0], -d1_raw[1]]  // toward p1 (away from intersection)
    };
    let d2 = if t2 < 0.5 {
        d2_raw  // toward p4 (away from intersection)
    } else {
        [-d2_raw[0], -d2_raw[1]]  // toward p3 (away from intersection)
    };

    // Bisector direction (for fillet center)
    let bisector = normalize_2d([d1[0] + d2[0], d1[1] + d2[1]]);

    // Angle between lines
    let cos_half = dot_2d(d1, bisector);
    if cos_half.abs() < 1e-6 {
        return None; // Lines are parallel
    }

    // Distance from intersection to fillet center
    let dist_to_center = radius / (1.0 - cos_half * cos_half).sqrt().max(1e-6);

    // Fillet center
    let center = [
        intersection[0] + bisector[0] * dist_to_center,
        intersection[1] + bisector[1] * dist_to_center,
    ];

    // Tangent points on each line
    let tangent1 = [
        intersection[0] + d1[0] * (dist_to_center * cos_half),
        intersection[1] + d1[1] * (dist_to_center * cos_half),
    ];
    let tangent2 = [
        intersection[0] + d2[0] * (dist_to_center * cos_half),
        intersection[1] + d2[1] * (dist_to_center * cos_half),
    ];

    // Calculate arc angles
    let mut start_angle = (tangent1[1] - center[1]).atan2(tangent1[0] - center[0]);
    let mut end_angle = (tangent2[1] - center[1]).atan2(tangent2[0] - center[0]);

    // Ensure the arc goes the short way (less than PI)
    // The arc should curve toward the intersection point
    let mut angle_span = end_angle - start_angle;
    if angle_span < 0.0 {
        angle_span += std::f64::consts::TAU;
    }

    // If span > PI, we're going the long way - swap start and end
    if angle_span > std::f64::consts::PI {
        std::mem::swap(&mut start_angle, &mut end_angle);
    }

    // Create the fillet arc
    let fillet_arc = SketchElement::Arc {
        center: Point2D {
            x: center[0],
            y: center[1],
        },
        radius,
        start_angle,
        end_angle,
    };

    // Create trimmed lines - keep the part AWAY from intersection (far end to tangent point)
    let new_line1 = if t1 < 0.5 {
        // Intersection closer to p1, keep p2 side: tangent1 -> p2
        Some(SketchElement::Line {
            start: Point2D {
                x: tangent1[0],
                y: tangent1[1],
            },
            end: Point2D { x: p2[0], y: p2[1] },
        })
    } else {
        // Intersection closer to p2, keep p1 side: p1 -> tangent1
        Some(SketchElement::Line {
            start: Point2D { x: p1[0], y: p1[1] },
            end: Point2D {
                x: tangent1[0],
                y: tangent1[1],
            },
        })
    };

    let new_line2 = if t2 < 0.5 {
        // Intersection closer to p3, keep p4 side: tangent2 -> p4
        Some(SketchElement::Line {
            start: Point2D {
                x: tangent2[0],
                y: tangent2[1],
            },
            end: Point2D { x: p4[0], y: p4[1] },
        })
    } else {
        // Intersection closer to p4, keep p3 side: p3 -> tangent2
        Some(SketchElement::Line {
            start: Point2D { x: p3[0], y: p3[1] },
            end: Point2D {
                x: tangent2[0],
                y: tangent2[1],
            },
        })
    };

    Some(FilletResult {
        fillet_arc,
        elem1: new_line1,
        elem2: new_line2,
    })
}

// ============================================================================
// OFFSET operation
// ============================================================================

/// Create an offset copy of a line
pub fn offset_line(line: &SketchElement, distance: f64, click_side: [f64; 2]) -> Option<SketchElement> {
    let (start, end) = match line {
        SketchElement::Line { start, end } => ([start.x, start.y], [end.x, end.y]),
        _ => return None,
    };

    // Line direction and perpendicular
    let dir = [end[0] - start[0], end[1] - start[1]];
    let len = (dir[0] * dir[0] + dir[1] * dir[1]).sqrt();
    if len < 1e-10 {
        return None;
    }

    // Perpendicular (normalize and rotate 90 degrees)
    let perp = [-dir[1] / len, dir[0] / len];

    // Determine which side based on click position
    let mid = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0];
    let to_click = [click_side[0] - mid[0], click_side[1] - mid[1]];
    let side = if dot_2d(to_click, perp) > 0.0 {
        1.0
    } else {
        -1.0
    };

    let offset = [perp[0] * distance * side, perp[1] * distance * side];

    Some(SketchElement::Line {
        start: Point2D {
            x: start[0] + offset[0],
            y: start[1] + offset[1],
        },
        end: Point2D {
            x: end[0] + offset[0],
            y: end[1] + offset[1],
        },
    })
}

/// Create an offset copy of a circle
pub fn offset_circle(circle: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<SketchElement> {
    let (center, radius) = match circle {
        SketchElement::Circle { center, radius } => ([center.x, center.y], *radius),
        _ => return None,
    };

    // Determine if click is inside or outside
    let click_dist = distance_2d(center, click_point);
    let new_radius = if click_dist < radius {
        // Click inside - shrink
        (radius - distance).max(0.01)
    } else {
        // Click outside - grow
        radius + distance
    };

    Some(SketchElement::Circle {
        center: Point2D {
            x: center[0],
            y: center[1],
        },
        radius: new_radius,
    })
}

/// Create an offset copy of a rectangle (as 4 lines)
pub fn offset_rectangle(rect: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<Vec<SketchElement>> {
    let (corner, width, height) = match rect {
        SketchElement::Rectangle { corner, width, height } => {
            ([corner.x, corner.y], *width, *height)
        }
        _ => return None,
    };

    // Determine if click is inside or outside
    let inside = click_point[0] > corner[0]
        && click_point[0] < corner[0] + width
        && click_point[1] > corner[1]
        && click_point[1] < corner[1] + height;

    let d = if inside { -distance } else { distance };

    let new_corner = [corner[0] - d, corner[1] - d];
    let new_width = (width + 2.0 * d).max(0.01);
    let new_height = (height + 2.0 * d).max(0.01);

    Some(vec![SketchElement::Rectangle {
        corner: Point2D {
            x: new_corner[0],
            y: new_corner[1],
        },
        width: new_width,
        height: new_height,
    }])
}

/// Generic offset for any element
pub fn offset_element(element: &SketchElement, distance: f64, click_point: [f64; 2]) -> Option<Vec<SketchElement>> {
    match element {
        SketchElement::Line { .. } => offset_line(element, distance, click_point).map(|e| vec![e]),
        SketchElement::Circle { .. } => offset_circle(element, distance, click_point).map(|e| vec![e]),
        SketchElement::Rectangle { .. } => offset_rectangle(element, distance, click_point),
        _ => None,
    }
}
