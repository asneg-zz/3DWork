//! Sketch modification operations: Trim, Fillet, Offset
//! Using kurbo library for geometry calculations

use kurbo::{Circle as KCircle, Line as KLine, Point, Vec2};
use shared::{Point2D, Sketch, SketchElement};
use std::f64::consts::{PI, TAU};

/// Result of a trim operation
#[allow(dead_code)]
pub enum TrimResult {
    /// The element was completely removed
    Removed,
    /// The element was trimmed and replaced with new element(s)
    Replaced(Vec<SketchElement>),
    /// Nothing happened (no intersection found)
    NoChange,
}

/// Result of a fillet operation
#[allow(dead_code)]
pub struct FilletResult {
    /// The arc that forms the fillet
    pub fillet_arc: SketchElement,
    /// Modified first element (trimmed to fillet)
    pub elem1: Option<SketchElement>,
    /// Modified second element (trimmed to fillet)
    pub elem2: Option<SketchElement>,
}

// ============================================================================
// Kurbo helpers
// ============================================================================

fn to_point(p: [f64; 2]) -> Point {
    Point::new(p[0], p[1])
}

fn normalize_angle(angle: f64) -> f64 {
    let mut a = angle % TAU;
    if a < 0.0 {
        a += TAU;
    }
    a
}

/// Check if angle is within arc range (handles wraparound)
fn angle_in_arc_range(angle: f64, start: f64, end: f64) -> bool {
    let a = normalize_angle(angle);
    let s = normalize_angle(start);
    let e = normalize_angle(end);

    if s <= e {
        a >= s - 1e-9 && a <= e + 1e-9
    } else {
        a >= s - 1e-9 || a <= e + 1e-9
    }
}

/// Get parameter (0..1) for angle within arc range
fn angle_to_param(angle: f64, start: f64, end: f64) -> f64 {
    let a = normalize_angle(angle);
    let s = normalize_angle(start);
    let e = normalize_angle(end);

    let span = if s <= e { e - s } else { TAU - s + e };
    if span.abs() < 1e-10 {
        return 0.0;
    }

    let from_start = if s <= e {
        a - s
    } else if a >= s {
        a - s
    } else {
        TAU - s + a
    };

    (from_start / span).clamp(0.0, 1.0)
}

/// Convert parameter back to angle
fn param_to_angle(param: f64, start: f64, end: f64) -> f64 {
    let s = normalize_angle(start);
    let e = normalize_angle(end);
    let span = if s <= e { e - s } else { TAU - s + e };
    normalize_angle(s + param * span)
}

// ============================================================================
// Intersection functions using kurbo
// ============================================================================

/// Line-line intersection
fn line_line_intersection(l1: KLine, l2: KLine) -> Option<(f64, f64, Point)> {
    let d1 = l1.p1 - l1.p0;
    let d2 = l2.p1 - l2.p0;
    let cross = d1.x * d2.y - d1.y * d2.x;

    if cross.abs() < 1e-10 {
        return None;
    }

    let d = l2.p0 - l1.p0;
    let t = (d.x * d2.y - d.y * d2.x) / cross;
    let u = (d.x * d1.y - d.y * d1.x) / cross;

    let pt = l1.p0 + d1 * t;
    Some((t, u, pt))
}

/// Line-circle intersection, returns (t, point) pairs where t is line parameter
fn line_circle_intersection(line: KLine, circle: KCircle) -> Vec<(f64, Point)> {
    let d = line.p1 - line.p0;
    let f = line.p0 - circle.center;

    let a = d.dot(d);
    let b = 2.0 * f.dot(d);
    let c = f.dot(f) - circle.radius * circle.radius;

    let disc = b * b - 4.0 * a * c;
    if disc < 0.0 {
        return Vec::new();
    }

    let sqrt_disc = disc.sqrt();
    let mut results = Vec::new();

    for t in [(-b - sqrt_disc) / (2.0 * a), (-b + sqrt_disc) / (2.0 * a)] {
        let pt = line.p0 + d * t;
        results.push((t, pt));
    }

    // Remove duplicates (when disc ≈ 0)
    if results.len() == 2 && (results[0].0 - results[1].0).abs() < 1e-9 {
        results.pop();
    }

    results
}

/// Circle-circle intersection points
fn circle_circle_intersection(c1: KCircle, c2: KCircle) -> Vec<Point> {
    let d_vec = c2.center - c1.center;
    let d = d_vec.hypot();

    if d > c1.radius + c2.radius + 1e-9 {
        return Vec::new(); // Too far apart
    }
    if d < (c1.radius - c2.radius).abs() - 1e-9 {
        return Vec::new(); // One inside other
    }
    if d < 1e-9 {
        return Vec::new(); // Concentric
    }

    let a = (c1.radius * c1.radius - c2.radius * c2.radius + d * d) / (2.0 * d);
    let h_sq = c1.radius * c1.radius - a * a;
    if h_sq < 0.0 {
        return Vec::new();
    }
    let h = h_sq.sqrt();

    let p2 = c1.center + d_vec * (a / d);
    let perp = Vec2::new(-d_vec.y / d, d_vec.x / d);

    let mut results = vec![p2 + perp * h, p2 - perp * h];

    // Remove duplicates
    if results.len() == 2 && (results[0] - results[1]).hypot() < 1e-9 {
        results.pop();
    }

    results
}

/// Line-arc intersection (filters circle intersection by arc angle range)
fn line_arc_intersection(
    line: KLine,
    center: Point,
    radius: f64,
    start_angle: f64,
    end_angle: f64,
) -> Vec<(f64, Point)> {
    let circle = KCircle::new(center, radius);
    line_circle_intersection(line, circle)
        .into_iter()
        .filter(|(t, pt)| {
            // Must be on line segment
            if *t < -1e-6 || *t > 1.0 + 1e-6 {
                return false;
            }
            // Must be on arc
            let angle = (pt.y - center.y).atan2(pt.x - center.x);
            angle_in_arc_range(angle, start_angle, end_angle)
        })
        .collect()
}

/// Arc-arc intersection
fn arc_arc_intersection(
    c1: Point,
    r1: f64,
    start1: f64,
    end1: f64,
    c2: Point,
    r2: f64,
    start2: f64,
    end2: f64,
) -> Vec<Point> {
    circle_circle_intersection(KCircle::new(c1, r1), KCircle::new(c2, r2))
        .into_iter()
        .filter(|pt| {
            let angle1 = (pt.y - c1.y).atan2(pt.x - c1.x);
            let angle2 = (pt.y - c2.y).atan2(pt.x - c2.x);
            angle_in_arc_range(angle1, start1, end1) && angle_in_arc_range(angle2, start2, end2)
        })
        .collect()
}

/// Arc-circle intersection
fn arc_circle_intersection(
    arc_center: Point,
    arc_radius: f64,
    start_angle: f64,
    end_angle: f64,
    circle: KCircle,
) -> Vec<Point> {
    // First get raw circle-circle intersections
    let raw_ints = circle_circle_intersection(
        KCircle::new(arc_center, arc_radius),
        circle,
    );

    tracing::info!("    arc_circle_intersection: arc center=({:.2},{:.2}) r={:.2} angles={:.2}..{:.2}, circle center=({:.2},{:.2}) r={:.2}",
        arc_center.x, arc_center.y, arc_radius, start_angle, end_angle,
        circle.center.x, circle.center.y, circle.radius);
    tracing::info!("    raw circle-circle intersections: {}", raw_ints.len());

    let result: Vec<Point> = raw_ints
        .into_iter()
        .filter(|pt| {
            let angle = (pt.y - arc_center.y).atan2(pt.x - arc_center.x);
            let in_range = angle_in_arc_range(angle, start_angle, end_angle);
            tracing::info!("      point ({:.2},{:.2}) angle={:.2} in_range={}", pt.x, pt.y, angle, in_range);
            in_range
        })
        .collect();

    tracing::info!("    filtered to {} points", result.len());
    result
}

// ============================================================================
// Find intersections for trimming
// ============================================================================

/// Intersection info with parameter along the element being trimmed
#[derive(Clone)]
struct Intersection {
    param: f64,    // 0..1 parameter along element
    point: Point,
}

/// Find all intersections of a LINE with other sketch elements
fn find_line_intersections(idx: usize, line: KLine, sketch: &Sketch) -> Vec<Intersection> {
    let mut results = Vec::new();

    for (i, elem) in sketch.elements.iter().enumerate() {
        if i == idx {
            continue;
        }

        match elem {
            SketchElement::Line { start, end } => {
                let other = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
                if let Some((t, u, pt)) = line_line_intersection(line, other) {
                    if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                        results.push(Intersection { param: t, point: pt });
                    }
                }
            }
            SketchElement::Circle { center, radius } => {
                let circle = KCircle::new(Point::new(center.x, center.y), *radius);
                for (t, pt) in line_circle_intersection(line, circle) {
                    if t > 1e-6 && t < 1.0 - 1e-6 {
                        results.push(Intersection { param: t, point: pt });
                    }
                }
            }
            SketchElement::Arc { center, radius, start_angle, end_angle } => {
                let c = Point::new(center.x, center.y);
                for (t, pt) in line_arc_intersection(line, c, *radius, *start_angle, *end_angle) {
                    if t > 1e-6 && t < 1.0 - 1e-6 {
                        results.push(Intersection { param: t, point: pt });
                    }
                }
            }
            SketchElement::Rectangle { corner, width, height } => {
                let corners = [
                    Point::new(corner.x, corner.y),
                    Point::new(corner.x + width, corner.y),
                    Point::new(corner.x + width, corner.y + height),
                    Point::new(corner.x, corner.y + height),
                ];
                for j in 0..4 {
                    let side = KLine::new(corners[j], corners[(j + 1) % 4]);
                    if let Some((t, u, pt)) = line_line_intersection(line, side) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            results.push(Intersection { param: t, point: pt });
                        }
                    }
                }
            }
            _ => {}
        }
    }

    results.sort_by(|a, b| a.param.partial_cmp(&b.param).unwrap());
    dedup_intersections(&mut results);
    results
}

/// Find all intersections of an ARC with other sketch elements
fn find_arc_intersections(
    idx: usize,
    center: Point,
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    sketch: &Sketch,
) -> Vec<Intersection> {
    let mut results = Vec::new();

    for (i, elem) in sketch.elements.iter().enumerate() {
        if i == idx {
            continue;
        }

        let points: Vec<Point> = match elem {
            SketchElement::Line { start, end } => {
                let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
                line_arc_intersection(line, center, radius, start_angle, end_angle)
                    .into_iter()
                    .map(|(_, pt)| pt)
                    .collect()
            }
            SketchElement::Circle { center: c, radius: r } => {
                arc_circle_intersection(
                    center,
                    radius,
                    start_angle,
                    end_angle,
                    KCircle::new(Point::new(c.x, c.y), *r),
                )
            }
            SketchElement::Arc { center: c, radius: r, start_angle: s, end_angle: e } => {
                arc_arc_intersection(
                    center, radius, start_angle, end_angle,
                    Point::new(c.x, c.y), *r, *s, *e,
                )
            }
            SketchElement::Rectangle { corner, width, height } => {
                let corners = [
                    Point::new(corner.x, corner.y),
                    Point::new(corner.x + width, corner.y),
                    Point::new(corner.x + width, corner.y + height),
                    Point::new(corner.x, corner.y + height),
                ];
                let mut pts = Vec::new();
                for j in 0..4 {
                    let side = KLine::new(corners[j], corners[(j + 1) % 4]);
                    pts.extend(
                        line_arc_intersection(side, center, radius, start_angle, end_angle)
                            .into_iter()
                            .map(|(_, pt)| pt),
                    );
                }
                pts
            }
            _ => Vec::new(),
        };

        for pt in points {
            let angle = (pt.y - center.y).atan2(pt.x - center.x);
            let param = angle_to_param(angle, start_angle, end_angle);
            if param > 1e-6 && param < 1.0 - 1e-6 {
                results.push(Intersection { param, point: pt });
            }
        }
    }

    results.sort_by(|a, b| a.param.partial_cmp(&b.param).unwrap());
    dedup_intersections(&mut results);
    results
}

/// Find all intersections of a CIRCLE with other sketch elements
fn find_circle_intersections(
    idx: usize,
    center: Point,
    radius: f64,
    sketch: &Sketch,
) -> Vec<Intersection> {
    let circle = KCircle::new(center, radius);
    let mut results = Vec::new();

    tracing::info!("find_circle_intersections: circle idx={}, center=({:.2},{:.2}), r={:.2}, {} elements in sketch",
        idx, center.x, center.y, radius, sketch.elements.len());

    for (i, elem) in sketch.elements.iter().enumerate() {
        if i == idx {
            continue;
        }

        // Log element type for debugging
        let elem_type = match elem {
            SketchElement::Line { .. } => "Line",
            SketchElement::Circle { .. } => "Circle",
            SketchElement::Arc { .. } => "Arc",
            SketchElement::Rectangle { .. } => "Rectangle",
            SketchElement::Spline { .. } => "Spline",
            SketchElement::Polyline { .. } => "Polyline",
            SketchElement::Dimension { .. } => "Dimension",
        };
        tracing::info!("  Element[{}] type: {}", i, elem_type);

        let points: Vec<Point> = match elem {
            SketchElement::Line { start, end } => {
                let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
                let all_ints = line_circle_intersection(line, circle);
                tracing::info!("    Line ({:.2},{:.2})->({:.2},{:.2}): {} raw intersections, t values: {:?}",
                    start.x, start.y, end.x, end.y,
                    all_ints.len(),
                    all_ints.iter().map(|(t, _)| *t).collect::<Vec<_>>());
                all_ints
                    .into_iter()
                    .filter(|(t, _)| *t >= -1e-6 && *t <= 1.0 + 1e-6)
                    .map(|(_, pt)| pt)
                    .collect()
            }
            SketchElement::Circle { center: c, radius: r } => {
                circle_circle_intersection(circle, KCircle::new(Point::new(c.x, c.y), *r))
            }
            SketchElement::Arc { center: c, radius: r, start_angle: s, end_angle: e } => {
                arc_circle_intersection(
                    Point::new(c.x, c.y), *r, *s, *e, circle,
                )
            }
            SketchElement::Rectangle { corner, width, height } => {
                let corners = [
                    Point::new(corner.x, corner.y),
                    Point::new(corner.x + width, corner.y),
                    Point::new(corner.x + width, corner.y + height),
                    Point::new(corner.x, corner.y + height),
                ];
                let mut pts = Vec::new();
                for j in 0..4 {
                    let side = KLine::new(corners[j], corners[(j + 1) % 4]);
                    pts.extend(
                        line_circle_intersection(side, circle)
                            .into_iter()
                            .filter(|(t, _)| *t >= -1e-6 && *t <= 1.0 + 1e-6)
                            .map(|(_, pt)| pt),
                    );
                }
                pts
            }
            _ => Vec::new(),
        };

        for pt in points {
            let angle = normalize_angle((pt.y - center.y).atan2(pt.x - center.x));
            results.push(Intersection { param: angle, point: pt });
        }
    }

    // Sort by angle
    results.sort_by(|a, b| a.param.partial_cmp(&b.param).unwrap());
    dedup_intersections(&mut results);
    results
}

fn dedup_intersections(ints: &mut Vec<Intersection>) {
    ints.dedup_by(|a, b| (a.param - b.param).abs() < 1e-6);
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
    let line = KLine::new(to_point(start), to_point(end));
    let ints = find_line_intersections(idx, line, sketch);

    if ints.is_empty() {
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
    let c = to_point(center);
    let ints = find_arc_intersections(idx, c, radius, start_angle, end_angle, sketch);

    tracing::info!("trim_arc: found {} intersections", ints.len());

    if ints.is_empty() {
        return TrimResult::NoChange;
    }

    // Find click parameter
    let click_angle = (click[1] - center[1]).atan2(click[0] - center[0]);
    let click_param = angle_to_param(click_angle, start_angle, end_angle);

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

// ============================================================================
// SKETCH VALIDATION (for extrusion)
// ============================================================================

/// Result of sketch validation for extrusion
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SketchValidation {
    pub is_valid: bool,
    pub is_closed: bool,
    pub has_self_intersections: bool,
    pub error_message: Option<String>,
}

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
        SketchElement::Line { start, end } => {
            Some(([start.x, start.y], [end.x, end.y]))
        }
        SketchElement::Arc { center, radius, start_angle, end_angle } => {
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
        SketchElement::Polyline { points } => {
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

/// Find intersection points between two sketch elements
#[allow(dead_code)]
fn find_element_intersections(elem1: &SketchElement, elem2: &SketchElement) -> Vec<Point> {
    match (elem1, elem2) {
        (SketchElement::Line { start: s1, end: e1 }, SketchElement::Line { start: s2, end: e2 }) => {
            let l1 = KLine::new(Point::new(s1.x, s1.y), Point::new(e1.x, e1.y));
            let l2 = KLine::new(Point::new(s2.x, s2.y), Point::new(e2.x, e2.y));
            if let Some((t, u, pt)) = line_line_intersection(l1, l2) {
                // Check if intersection is strictly inside both segments (not at endpoints)
                if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                    return vec![pt];
                }
            }
            Vec::new()
        }
        (SketchElement::Line { start, end }, SketchElement::Circle { center, radius }) |
        (SketchElement::Circle { center, radius }, SketchElement::Line { start, end }) => {
            let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
            let circle = KCircle::new(Point::new(center.x, center.y), *radius);
            line_circle_intersection(line, circle)
                .into_iter()
                .filter(|(t, _)| *t > 1e-6 && *t < 1.0 - 1e-6)
                .map(|(_, pt)| pt)
                .collect()
        }
        (SketchElement::Line { start, end }, SketchElement::Arc { center, radius, start_angle, end_angle }) |
        (SketchElement::Arc { center, radius, start_angle, end_angle }, SketchElement::Line { start, end }) => {
            let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
            let c = Point::new(center.x, center.y);
            line_arc_intersection(line, c, *radius, *start_angle, *end_angle)
                .into_iter()
                .filter(|(t, _)| *t > 1e-6 && *t < 1.0 - 1e-6)
                .map(|(_, pt)| pt)
                .collect()
        }
        (SketchElement::Circle { center: c1, radius: r1 }, SketchElement::Circle { center: c2, radius: r2 }) => {
            circle_circle_intersection(
                KCircle::new(Point::new(c1.x, c1.y), *r1),
                KCircle::new(Point::new(c2.x, c2.y), *r2),
            )
        }
        (SketchElement::Arc { center: c1, radius: r1, start_angle: s1, end_angle: e1 },
         SketchElement::Arc { center: c2, radius: r2, start_angle: s2, end_angle: e2 }) => {
            arc_arc_intersection(
                Point::new(c1.x, c1.y), *r1, *s1, *e1,
                Point::new(c2.x, c2.y), *r2, *s2, *e2,
            )
        }
        (SketchElement::Circle { center, radius }, SketchElement::Arc { center: ac, radius: ar, start_angle, end_angle }) |
        (SketchElement::Arc { center: ac, radius: ar, start_angle, end_angle }, SketchElement::Circle { center, radius }) => {
            arc_circle_intersection(
                Point::new(ac.x, ac.y), *ar, *start_angle, *end_angle,
                KCircle::new(Point::new(center.x, center.y), *radius),
            )
        }
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn test_circle_circle_intersection() {
        let c1 = KCircle::new(Point::new(0.0, 0.0), 1.0);
        let c2 = KCircle::new(Point::new(1.0, 0.0), 1.0);
        let ints = circle_circle_intersection(c1, c2);
        assert_eq!(ints.len(), 2);
    }

    #[test]
    fn test_arc_arc_intersection() {
        let ints = arc_arc_intersection(
            Point::new(0.0, 0.0), 1.0, 0.0, PI,
            Point::new(1.0, 0.0), 1.0, PI / 2.0, 3.0 * PI / 2.0,
        );
        assert!(!ints.is_empty());
    }
}
