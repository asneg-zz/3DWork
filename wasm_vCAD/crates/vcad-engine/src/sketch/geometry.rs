//! Geometric intersection and helper functions using kurbo library

use kurbo::{Circle as KCircle, Line as KLine, Point, Vec2};
use shared::{Point2D, Sketch, SketchElement};
use std::f64::consts::TAU;

use super::types::{Intersection, PolylineIntersection};

// ============================================================================
// Kurbo helpers
// ============================================================================

/// Convert array to kurbo Point
pub fn to_point(p: [f64; 2]) -> Point {
    Point::new(p[0], p[1])
}

/// Normalize angle to [0, TAU)
pub fn normalize_angle(angle: f64) -> f64 {
    let mut a = angle % TAU;
    if a < 0.0 {
        a += TAU;
    }
    a
}

/// Check if angle is within arc range (handles wraparound)
pub fn angle_in_arc_range(angle: f64, start: f64, end: f64) -> bool {
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
pub fn angle_to_param(angle: f64, start: f64, end: f64) -> f64 {
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
pub fn param_to_angle(param: f64, start: f64, end: f64) -> f64 {
    let s = normalize_angle(start);
    let e = normalize_angle(end);
    let span = if s <= e { e - s } else { TAU - s + e };
    normalize_angle(s + param * span)
}

// ============================================================================
// Basic intersection functions
// ============================================================================

/// Line-line intersection
pub fn line_line_intersection(l1: KLine, l2: KLine) -> Option<(f64, f64, Point)> {
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
pub fn line_circle_intersection(line: KLine, circle: KCircle) -> Vec<(f64, Point)> {
    let d = line.p1 - line.p0;
    let f = line.p0 - circle.center;

    let a = d.dot(d);
    let b = 2.0 * f.dot(d);
    let c = f.dot(f) - circle.radius * circle.radius;

    let disc = b * b - 4.0 * a * c;

    // Allow small negative discriminant for tangent points (numerical tolerance)
    if disc < -1e-6 {
        return Vec::new();
    }

    let sqrt_disc = disc.max(0.0).sqrt(); // Clamp to 0 for tangent case
    let mut results = Vec::new();

    for t in [(-b - sqrt_disc) / (2.0 * a), (-b + sqrt_disc) / (2.0 * a)] {
        let pt = line.p0 + d * t;
        results.push((t, pt));
    }

    // Remove duplicates (when disc ≈ 0, tangent point)
    if results.len() == 2 && (results[0].0 - results[1].0).abs() < 1e-6 {
        results.pop();
    }

    results
}

/// Circle-circle intersection points
pub fn circle_circle_intersection(c1: KCircle, c2: KCircle) -> Vec<Point> {
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
pub fn line_arc_intersection(
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
pub fn arc_arc_intersection(
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
pub fn arc_circle_intersection(
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

    let result: Vec<Point> = raw_ints
        .into_iter()
        .filter(|pt| {
            let angle = (pt.y - arc_center.y).atan2(pt.x - arc_center.x);
            let in_range = angle_in_arc_range(angle, start_angle, end_angle);
            in_range
        })
        .collect();

    result
}

// ============================================================================
// Endpoint and point-on-element helpers
// ============================================================================

/// Get all endpoints from a sketch element
pub fn get_element_endpoints_for_trim(elem: &SketchElement) -> Vec<Point> {
    match elem {
        SketchElement::Line { start, end, .. } => {
            vec![Point::new(start.x, start.y), Point::new(end.x, end.y)]
        }
        SketchElement::Arc { center, radius, start_angle, end_angle, .. } => {
            vec![
                Point::new(center.x + radius * start_angle.cos(), center.y + radius * start_angle.sin()),
                Point::new(center.x + radius * end_angle.cos(), center.y + radius * end_angle.sin()),
            ]
        }
        SketchElement::Polyline { points, .. } => {
            points.iter().map(|p| Point::new(p.x, p.y)).collect()
        }
        SketchElement::Spline { points, .. } => {
            points.iter().map(|p| Point::new(p.x, p.y)).collect()
        }
        SketchElement::Rectangle { corner, width, height, .. } => {
            vec![
                Point::new(corner.x, corner.y),
                Point::new(corner.x + width, corner.y),
                Point::new(corner.x + width, corner.y + height),
                Point::new(corner.x, corner.y + height),
            ]
        }
        _ => Vec::new(),
    }
}

/// Check if a point lies on a line segment and return the parameter t
pub fn point_on_line(pt: Point, line: KLine, tolerance: f64) -> Option<f64> {
    let line_vec = line.p1 - line.p0;
    let len_sq = line_vec.dot(line_vec);
    if len_sq < 1e-12 {
        return None;
    }

    let t = (pt - line.p0).dot(line_vec) / len_sq;

    // Check if t is in valid range (not at endpoints of the trimmed element)
    if t <= 1e-6 || t >= 1.0 - 1e-6 {
        return None;
    }

    // Check if the point is actually on the line
    let closest = line.p0 + line_vec * t;
    let dist = (pt - closest).hypot();

    if dist < tolerance {
        Some(t)
    } else {
        None
    }
}

/// Check if a point lies on a circle/arc and return the angle
pub fn point_on_circle(pt: Point, center: Point, radius: f64, tolerance: f64) -> Option<f64> {
    let dist = (pt - center).hypot();
    if (dist - radius).abs() > tolerance {
        return None;
    }
    Some((pt.y - center.y).atan2(pt.x - center.x))
}

/// Remove duplicate intersections (by parameter)
pub fn dedup_intersections(ints: &mut Vec<Intersection>) {
    ints.dedup_by(|a, b| (a.param - b.param).abs() < 1e-6);
}

// ============================================================================
// Find intersections for trimming
// ============================================================================

/// Find all intersections of a LINE with other sketch elements
pub fn find_line_intersections(idx: usize, line: KLine, sketch: &Sketch) -> Vec<Intersection> {
    let mut results = Vec::new();
    let endpoint_tolerance = 0.01; // Tolerance for endpoint detection

    for (i, elem) in sketch.elements.iter().enumerate() {
        if i == idx {
            continue;
        }

        // First, check geometric intersections
        match elem {
            SketchElement::Line { start, end, .. } => {
                let other = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
                if let Some((t, u, pt)) = line_line_intersection(line, other) {
                    // Allow intersection if it's inside our line, regardless of where it is on the other line
                    if t > 1e-6 && t < 1.0 - 1e-6 {
                        // Skip if it's in the middle of both lines (proper intersection already counted)
                        // But include if it's at an endpoint of the other element
                        if u > 1e-6 && u < 1.0 - 1e-6 {
                            results.push(Intersection { param: t, point: pt });
                        }
                    }
                }
            }
            SketchElement::Circle { center, radius, .. } => {
                let circle = KCircle::new(Point::new(center.x, center.y), *radius);
                for (t, pt) in line_circle_intersection(line, circle) {
                    if t > 1e-6 && t < 1.0 - 1e-6 {
                        results.push(Intersection { param: t, point: pt });
                    }
                }
            }
            SketchElement::Arc { center, radius, start_angle, end_angle, .. } => {
                let c = Point::new(center.x, center.y);
                for (t, pt) in line_arc_intersection(line, c, *radius, *start_angle, *end_angle) {
                    if t > 1e-6 && t < 1.0 - 1e-6 {
                        results.push(Intersection { param: t, point: pt });
                    }
                }
            }
            SketchElement::Rectangle { corner, width, height, .. } => {
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
            SketchElement::Polyline { points, .. } => {
                // Intersect with each segment of the polyline
                for j in 0..(points.len().saturating_sub(1)) {
                    let seg = KLine::new(
                        Point::new(points[j].x, points[j].y),
                        Point::new(points[j + 1].x, points[j + 1].y),
                    );
                    if let Some((t, u, pt)) = line_line_intersection(line, seg) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            results.push(Intersection { param: t, point: pt });
                        }
                    }
                }
            }
            SketchElement::Spline { points, .. } => {
                // Intersect with each segment of the spline (control polygon)
                for j in 0..(points.len().saturating_sub(1)) {
                    let seg = KLine::new(
                        Point::new(points[j].x, points[j].y),
                        Point::new(points[j + 1].x, points[j + 1].y),
                    );
                    if let Some((t, u, pt)) = line_line_intersection(line, seg) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            results.push(Intersection { param: t, point: pt });
                        }
                    }
                }
            }
            _ => {}
        }

        // Second, check if any endpoint of the other element lies ON our line
        // This catches cases where previous trims created endpoints at intersection points
        for endpoint in get_element_endpoints_for_trim(elem) {
            if let Some(t) = point_on_line(endpoint, line, endpoint_tolerance) {
                results.push(Intersection { param: t, point: endpoint });
            }
        }
    }

    results.sort_by(|a, b| a.param.partial_cmp(&b.param).unwrap());
    dedup_intersections(&mut results);
    results
}

/// Find all intersections of an ARC with other sketch elements
pub fn find_arc_intersections(
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
            SketchElement::Line { start, end, .. } => {
                let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
                line_arc_intersection(line, center, radius, start_angle, end_angle)
                    .into_iter()
                    .map(|(_, pt)| pt)
                    .collect()
            }
            SketchElement::Circle { center: c, radius: r, .. } => {
                arc_circle_intersection(
                    center,
                    radius,
                    start_angle,
                    end_angle,
                    KCircle::new(Point::new(c.x, c.y), *r),
                )
            }
            SketchElement::Arc { center: c, radius: r, start_angle: s, end_angle: e, .. } => {
                arc_arc_intersection(
                    center, radius, start_angle, end_angle,
                    Point::new(c.x, c.y), *r, *s, *e,
                )
            }
            SketchElement::Rectangle { corner, width, height, .. } => {
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
            SketchElement::Polyline { points, .. } => {
                let mut pts = Vec::new();
                for j in 0..(points.len().saturating_sub(1)) {
                    let seg = KLine::new(
                        Point::new(points[j].x, points[j].y),
                        Point::new(points[j + 1].x, points[j + 1].y),
                    );
                    pts.extend(
                        line_arc_intersection(seg, center, radius, start_angle, end_angle)
                            .into_iter()
                            .map(|(_, pt)| pt),
                    );
                }
                pts
            }
            SketchElement::Spline { points, .. } => {
                let mut pts = Vec::new();
                for j in 0..(points.len().saturating_sub(1)) {
                    let seg = KLine::new(
                        Point::new(points[j].x, points[j].y),
                        Point::new(points[j + 1].x, points[j + 1].y),
                    );
                    pts.extend(
                        line_arc_intersection(seg, center, radius, start_angle, end_angle)
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
            // Allow intersections at arc endpoints (param close to 0 or 1)
            // Only exclude if param is completely outside [0, 1]
            if param >= -1e-6 && param <= 1.0 + 1e-6 {
                let clamped_param = param.clamp(0.0, 1.0);
                results.push(Intersection { param: clamped_param, point: pt });
            }
        }

        // Also check if any endpoint of the other element lies ON our arc
        let endpoint_tolerance = 0.01;
        for endpoint in get_element_endpoints_for_trim(elem) {
            if let Some(angle) = point_on_circle(endpoint, center, radius, endpoint_tolerance) {
                if angle_in_arc_range(angle, start_angle, end_angle) {
                    let param = angle_to_param(angle, start_angle, end_angle);
                    // Allow endpoints at arc endpoints
                    if param >= -1e-6 && param <= 1.0 + 1e-6 {
                        let clamped_param = param.clamp(0.0, 1.0);
                        results.push(Intersection { param: clamped_param, point: endpoint });
                    }
                }
            }
        }
    }

    results.sort_by(|a, b| a.param.partial_cmp(&b.param).unwrap());
    dedup_intersections(&mut results);
    results
}

/// Find all intersections of a CIRCLE with other sketch elements
pub fn find_circle_intersections(
    idx: usize,
    center: Point,
    radius: f64,
    sketch: &Sketch,
) -> Vec<Intersection> {
    let circle = KCircle::new(center, radius);
    let mut results = Vec::new();

    for (i, elem) in sketch.elements.iter().enumerate() {
        if i == idx {
            continue;
        }

        let points: Vec<Point> = match elem {
            SketchElement::Line { start, end, .. } => {
                let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
                line_circle_intersection(line, circle)
                    .into_iter()
                    .filter(|(t, _)| *t >= -1e-6 && *t <= 1.0 + 1e-6)
                    .map(|(_, pt)| pt)
                    .collect()
            }
            SketchElement::Circle { center: c, radius: r, .. } => {
                circle_circle_intersection(circle, KCircle::new(Point::new(c.x, c.y), *r))
            }
            SketchElement::Arc { center: c, radius: r, start_angle: s, end_angle: e, .. } => {
                arc_circle_intersection(
                    Point::new(c.x, c.y), *r, *s, *e, circle,
                )
            }
            SketchElement::Rectangle { corner, width, height, .. } => {
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
            SketchElement::Polyline { points, .. } => {
                let mut pts = Vec::new();
                for j in 0..(points.len().saturating_sub(1)) {
                    let seg = KLine::new(
                        Point::new(points[j].x, points[j].y),
                        Point::new(points[j + 1].x, points[j + 1].y),
                    );
                    pts.extend(
                        line_circle_intersection(seg, circle)
                            .into_iter()
                            .filter(|(t, _)| *t >= -1e-6 && *t <= 1.0 + 1e-6)
                            .map(|(_, pt)| pt),
                    );
                }
                pts
            }
            SketchElement::Spline { points, .. } => {
                let mut pts = Vec::new();
                for j in 0..(points.len().saturating_sub(1)) {
                    let seg = KLine::new(
                        Point::new(points[j].x, points[j].y),
                        Point::new(points[j + 1].x, points[j + 1].y),
                    );
                    pts.extend(
                        line_circle_intersection(seg, circle)
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

        // Also check if any endpoint of the other element lies ON our circle
        let endpoint_tolerance = 0.01;
        for endpoint in get_element_endpoints_for_trim(elem) {
            if let Some(angle) = point_on_circle(endpoint, center, radius, endpoint_tolerance) {
                let angle = normalize_angle(angle);
                results.push(Intersection { param: angle, point: endpoint });
            }
        }
    }

    // Sort by angle
    results.sort_by(|a, b| a.param.partial_cmp(&b.param).unwrap());
    dedup_intersections(&mut results);
    results
}

/// Find all intersections of a POLYLINE with other sketch elements
pub fn find_polyline_intersections(
    idx: usize,
    points: &[Point2D],
    sketch: &Sketch,
) -> Vec<PolylineIntersection> {
    let mut results = Vec::new();

    if points.len() < 2 {
        return results;
    }

    // For each segment of the polyline
    for seg_idx in 0..(points.len() - 1) {
        let seg_start = Point::new(points[seg_idx].x, points[seg_idx].y);
        let seg_end = Point::new(points[seg_idx + 1].x, points[seg_idx + 1].y);
        let seg_line = KLine::new(seg_start, seg_end);

        for (i, elem) in sketch.elements.iter().enumerate() {
            if i == idx {
                continue;
            }

            match elem {
                SketchElement::Line { start, end, .. } => {
                    let other = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
                    if let Some((t, u, pt)) = line_line_intersection(seg_line, other) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            results.push(PolylineIntersection {
                                segment_idx: seg_idx,
                                segment_t: t,
                                point: pt,
                            });
                        }
                    }
                }
                SketchElement::Circle { center, radius, .. } => {
                    let circle = KCircle::new(Point::new(center.x, center.y), *radius);
                    for (t, pt) in line_circle_intersection(seg_line, circle) {
                        if t > 1e-6 && t < 1.0 - 1e-6 {
                            results.push(PolylineIntersection {
                                segment_idx: seg_idx,
                                segment_t: t,
                                point: pt,
                            });
                        }
                    }
                }
                SketchElement::Arc { center, radius, start_angle, end_angle, .. } => {
                    let c = Point::new(center.x, center.y);
                    for (t, pt) in line_arc_intersection(seg_line, c, *radius, *start_angle, *end_angle) {
                        if t > 1e-6 && t < 1.0 - 1e-6 {
                            results.push(PolylineIntersection {
                                segment_idx: seg_idx,
                                segment_t: t,
                                point: pt,
                            });
                        }
                    }
                }
                SketchElement::Rectangle { corner, width, height, .. } => {
                    let corners = [
                        Point::new(corner.x, corner.y),
                        Point::new(corner.x + width, corner.y),
                        Point::new(corner.x + width, corner.y + height),
                        Point::new(corner.x, corner.y + height),
                    ];
                    for j in 0..4 {
                        let side = KLine::new(corners[j], corners[(j + 1) % 4]);
                        if let Some((t, u, pt)) = line_line_intersection(seg_line, side) {
                            if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                                results.push(PolylineIntersection {
                                    segment_idx: seg_idx,
                                    segment_t: t,
                                    point: pt,
                                });
                            }
                        }
                    }
                }
                SketchElement::Polyline { points: other_points, .. } => {
                    // Intersect with each segment of the other polyline
                    for j in 0..(other_points.len().saturating_sub(1)) {
                        let other_seg = KLine::new(
                            Point::new(other_points[j].x, other_points[j].y),
                            Point::new(other_points[j + 1].x, other_points[j + 1].y),
                        );
                        if let Some((t, u, pt)) = line_line_intersection(seg_line, other_seg) {
                            if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                                results.push(PolylineIntersection {
                                    segment_idx: seg_idx,
                                    segment_t: t,
                                    point: pt,
                                });
                            }
                        }
                    }
                }
                SketchElement::Spline { points: spline_points, .. } => {
                    // Intersect with each segment of the spline (control polygon)
                    for j in 0..(spline_points.len().saturating_sub(1)) {
                        let spline_seg = KLine::new(
                            Point::new(spline_points[j].x, spline_points[j].y),
                            Point::new(spline_points[j + 1].x, spline_points[j + 1].y),
                        );
                        if let Some((t, u, pt)) = line_line_intersection(seg_line, spline_seg) {
                            if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                                results.push(PolylineIntersection {
                                    segment_idx: seg_idx,
                                    segment_t: t,
                                    point: pt,
                                });
                            }
                        }
                    }
                }
                _ => {}
            }

            // Also check if any endpoint of the other element lies ON this segment
            let endpoint_tolerance = 0.01;
            for endpoint in get_element_endpoints_for_trim(elem) {
                if let Some(t) = point_on_line(endpoint, seg_line, endpoint_tolerance) {
                    results.push(PolylineIntersection {
                        segment_idx: seg_idx,
                        segment_t: t,
                        point: endpoint,
                    });
                }
            }
        }
    }

    // Sort by segment index first, then by t within segment
    results.sort_by(|a, b| {
        match a.segment_idx.cmp(&b.segment_idx) {
            std::cmp::Ordering::Equal => a.segment_t.partial_cmp(&b.segment_t).unwrap(),
            other => other,
        }
    });

    // Dedup
    results.dedup_by(|a, b| {
        a.segment_idx == b.segment_idx && (a.segment_t - b.segment_t).abs() < 1e-6
    });

    results
}

// ============================================================================
// Element intersection for validation
// ============================================================================

/// Find intersection points between two sketch elements
pub fn find_element_intersections(elem1: &SketchElement, elem2: &SketchElement) -> Vec<Point> {
    match (elem1, elem2) {
        // Line - Line
        (SketchElement::Line { start: s1, end: e1, .. }, SketchElement::Line { start: s2, end: e2, .. }) => {
            let l1 = KLine::new(Point::new(s1.x, s1.y), Point::new(e1.x, e1.y));
            let l2 = KLine::new(Point::new(s2.x, s2.y), Point::new(e2.x, e2.y));
            if let Some((t, u, pt)) = line_line_intersection(l1, l2) {
                if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                    return vec![pt];
                }
            }
            Vec::new()
        }
        // Line - Circle
        (SketchElement::Line { start, end, .. }, SketchElement::Circle { center, radius, .. }) |
        (SketchElement::Circle { center, radius, .. }, SketchElement::Line { start, end, .. }) => {
            let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
            let circle = KCircle::new(Point::new(center.x, center.y), *radius);
            line_circle_intersection(line, circle)
                .into_iter()
                .filter(|(t, _)| *t > 1e-6 && *t < 1.0 - 1e-6)
                .map(|(_, pt)| pt)
                .collect()
        }
        // Line - Arc
        (SketchElement::Line { start, end, .. }, SketchElement::Arc { center, radius, start_angle, end_angle, .. }) |
        (SketchElement::Arc { center, radius, start_angle, end_angle, .. }, SketchElement::Line { start, end, .. }) => {
            let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
            let c = Point::new(center.x, center.y);
            line_arc_intersection(line, c, *radius, *start_angle, *end_angle)
                .into_iter()
                .filter(|(t, _)| *t > 1e-6 && *t < 1.0 - 1e-6)
                .map(|(_, pt)| pt)
                .collect()
        }
        // Line - Rectangle
        (SketchElement::Line { start, end, .. }, SketchElement::Rectangle { corner, width, height, .. }) |
        (SketchElement::Rectangle { corner, width, height, .. }, SketchElement::Line { start, end, .. }) => {
            let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
            let corners = [
                Point::new(corner.x, corner.y),
                Point::new(corner.x + width, corner.y),
                Point::new(corner.x + width, corner.y + height),
                Point::new(corner.x, corner.y + height),
            ];
            let mut pts = Vec::new();
            for j in 0..4 {
                let side = KLine::new(corners[j], corners[(j + 1) % 4]);
                if let Some((t, u, pt)) = line_line_intersection(line, side) {
                    if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                        pts.push(pt);
                    }
                }
            }
            pts
        }
        // Line - Polyline
        (SketchElement::Line { start, end, .. }, SketchElement::Polyline { points, .. }) |
        (SketchElement::Polyline { points, .. }, SketchElement::Line { start, end, .. }) => {
            let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
            let mut pts = Vec::new();
            for j in 0..(points.len().saturating_sub(1)) {
                let seg = KLine::new(
                    Point::new(points[j].x, points[j].y),
                    Point::new(points[j + 1].x, points[j + 1].y),
                );
                if let Some((t, u, pt)) = line_line_intersection(line, seg) {
                    if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                        pts.push(pt);
                    }
                }
            }
            pts
        }
        // Line - Spline
        (SketchElement::Line { start, end, .. }, SketchElement::Spline { points, .. }) |
        (SketchElement::Spline { points, .. }, SketchElement::Line { start, end, .. }) => {
            let line = KLine::new(Point::new(start.x, start.y), Point::new(end.x, end.y));
            let mut pts = Vec::new();
            for j in 0..(points.len().saturating_sub(1)) {
                let seg = KLine::new(
                    Point::new(points[j].x, points[j].y),
                    Point::new(points[j + 1].x, points[j + 1].y),
                );
                if let Some((t, u, pt)) = line_line_intersection(line, seg) {
                    if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                        pts.push(pt);
                    }
                }
            }
            pts
        }
        // Circle - Circle
        (SketchElement::Circle { center: c1, radius: r1, .. }, SketchElement::Circle { center: c2, radius: r2, .. }) => {
            circle_circle_intersection(
                KCircle::new(Point::new(c1.x, c1.y), *r1),
                KCircle::new(Point::new(c2.x, c2.y), *r2),
            )
        }
        // Circle - Arc
        (SketchElement::Circle { center, radius, .. }, SketchElement::Arc { center: ac, radius: ar, start_angle, end_angle, .. }) |
        (SketchElement::Arc { center: ac, radius: ar, start_angle, end_angle, .. }, SketchElement::Circle { center, radius, .. }) => {
            arc_circle_intersection(
                Point::new(ac.x, ac.y), *ar, *start_angle, *end_angle,
                KCircle::new(Point::new(center.x, center.y), *radius),
            )
        }
        // Circle - Rectangle
        (SketchElement::Circle { center, radius, .. }, SketchElement::Rectangle { corner, width, height, .. }) |
        (SketchElement::Rectangle { corner, width, height, .. }, SketchElement::Circle { center, radius, .. }) => {
            let circle = KCircle::new(Point::new(center.x, center.y), *radius);
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
                        .filter(|(t, _)| *t > 1e-6 && *t < 1.0 - 1e-6)
                        .map(|(_, pt)| pt),
                );
            }
            pts
        }
        // Circle - Polyline
        (SketchElement::Circle { center, radius, .. }, SketchElement::Polyline { points, .. }) |
        (SketchElement::Polyline { points, .. }, SketchElement::Circle { center, radius, .. }) => {
            let circle = KCircle::new(Point::new(center.x, center.y), *radius);
            let mut pts = Vec::new();
            for j in 0..(points.len().saturating_sub(1)) {
                let seg = KLine::new(
                    Point::new(points[j].x, points[j].y),
                    Point::new(points[j + 1].x, points[j + 1].y),
                );
                pts.extend(
                    line_circle_intersection(seg, circle)
                        .into_iter()
                        .filter(|(t, _)| *t > 1e-6 && *t < 1.0 - 1e-6)
                        .map(|(_, pt)| pt),
                );
            }
            pts
        }
        // Circle - Spline
        (SketchElement::Circle { center, radius, .. }, SketchElement::Spline { points, .. }) |
        (SketchElement::Spline { points, .. }, SketchElement::Circle { center, radius, .. }) => {
            let circle = KCircle::new(Point::new(center.x, center.y), *radius);
            let mut pts = Vec::new();
            for j in 0..(points.len().saturating_sub(1)) {
                let seg = KLine::new(
                    Point::new(points[j].x, points[j].y),
                    Point::new(points[j + 1].x, points[j + 1].y),
                );
                pts.extend(
                    line_circle_intersection(seg, circle)
                        .into_iter()
                        .filter(|(t, _)| *t > 1e-6 && *t < 1.0 - 1e-6)
                        .map(|(_, pt)| pt),
                );
            }
            pts
        }
        // Arc - Arc
        (SketchElement::Arc { center: c1, radius: r1, start_angle: s1, end_angle: e1, .. },
         SketchElement::Arc { center: c2, radius: r2, start_angle: s2, end_angle: e2, .. }) => {
            arc_arc_intersection(
                Point::new(c1.x, c1.y), *r1, *s1, *e1,
                Point::new(c2.x, c2.y), *r2, *s2, *e2,
            )
        }
        // Arc - Rectangle
        (SketchElement::Arc { center, radius, start_angle, end_angle, .. }, SketchElement::Rectangle { corner, width, height, .. }) |
        (SketchElement::Rectangle { corner, width, height, .. }, SketchElement::Arc { center, radius, start_angle, end_angle, .. }) => {
            let c = Point::new(center.x, center.y);
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
                    line_arc_intersection(side, c, *radius, *start_angle, *end_angle)
                        .into_iter()
                        .map(|(_, pt)| pt),
                );
            }
            pts
        }
        // Arc - Polyline
        (SketchElement::Arc { center, radius, start_angle, end_angle, .. }, SketchElement::Polyline { points, .. }) |
        (SketchElement::Polyline { points, .. }, SketchElement::Arc { center, radius, start_angle, end_angle, .. }) => {
            let c = Point::new(center.x, center.y);
            let mut pts = Vec::new();
            for j in 0..(points.len().saturating_sub(1)) {
                let seg = KLine::new(
                    Point::new(points[j].x, points[j].y),
                    Point::new(points[j + 1].x, points[j + 1].y),
                );
                pts.extend(
                    line_arc_intersection(seg, c, *radius, *start_angle, *end_angle)
                        .into_iter()
                        .map(|(_, pt)| pt),
                );
            }
            pts
        }
        // Arc - Spline
        (SketchElement::Arc { center, radius, start_angle, end_angle, .. }, SketchElement::Spline { points, .. }) |
        (SketchElement::Spline { points, .. }, SketchElement::Arc { center, radius, start_angle, end_angle, .. }) => {
            let c = Point::new(center.x, center.y);
            let mut pts = Vec::new();
            for j in 0..(points.len().saturating_sub(1)) {
                let seg = KLine::new(
                    Point::new(points[j].x, points[j].y),
                    Point::new(points[j + 1].x, points[j + 1].y),
                );
                pts.extend(
                    line_arc_intersection(seg, c, *radius, *start_angle, *end_angle)
                        .into_iter()
                        .map(|(_, pt)| pt),
                );
            }
            pts
        }
        // Rectangle - Rectangle
        (SketchElement::Rectangle { corner: c1, width: w1, height: h1, .. },
         SketchElement::Rectangle { corner: c2, width: w2, height: h2, .. }) => {
            let corners1 = [
                Point::new(c1.x, c1.y),
                Point::new(c1.x + w1, c1.y),
                Point::new(c1.x + w1, c1.y + h1),
                Point::new(c1.x, c1.y + h1),
            ];
            let corners2 = [
                Point::new(c2.x, c2.y),
                Point::new(c2.x + w2, c2.y),
                Point::new(c2.x + w2, c2.y + h2),
                Point::new(c2.x, c2.y + h2),
            ];
            let mut pts = Vec::new();
            for i in 0..4 {
                let side1 = KLine::new(corners1[i], corners1[(i + 1) % 4]);
                for j in 0..4 {
                    let side2 = KLine::new(corners2[j], corners2[(j + 1) % 4]);
                    if let Some((t, u, pt)) = line_line_intersection(side1, side2) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            pts.push(pt);
                        }
                    }
                }
            }
            pts
        }
        // Rectangle - Polyline
        (SketchElement::Rectangle { corner, width, height, .. }, SketchElement::Polyline { points, .. }) |
        (SketchElement::Polyline { points, .. }, SketchElement::Rectangle { corner, width, height, .. }) => {
            let corners = [
                Point::new(corner.x, corner.y),
                Point::new(corner.x + width, corner.y),
                Point::new(corner.x + width, corner.y + height),
                Point::new(corner.x, corner.y + height),
            ];
            let mut pts = Vec::new();
            for i in 0..4 {
                let side = KLine::new(corners[i], corners[(i + 1) % 4]);
                for j in 0..(points.len().saturating_sub(1)) {
                    let seg = KLine::new(
                        Point::new(points[j].x, points[j].y),
                        Point::new(points[j + 1].x, points[j + 1].y),
                    );
                    if let Some((t, u, pt)) = line_line_intersection(side, seg) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            pts.push(pt);
                        }
                    }
                }
            }
            pts
        }
        // Rectangle - Spline
        (SketchElement::Rectangle { corner, width, height, .. }, SketchElement::Spline { points, .. }) |
        (SketchElement::Spline { points, .. }, SketchElement::Rectangle { corner, width, height, .. }) => {
            let corners = [
                Point::new(corner.x, corner.y),
                Point::new(corner.x + width, corner.y),
                Point::new(corner.x + width, corner.y + height),
                Point::new(corner.x, corner.y + height),
            ];
            let mut pts = Vec::new();
            for i in 0..4 {
                let side = KLine::new(corners[i], corners[(i + 1) % 4]);
                for j in 0..(points.len().saturating_sub(1)) {
                    let seg = KLine::new(
                        Point::new(points[j].x, points[j].y),
                        Point::new(points[j + 1].x, points[j + 1].y),
                    );
                    if let Some((t, u, pt)) = line_line_intersection(side, seg) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            pts.push(pt);
                        }
                    }
                }
            }
            pts
        }
        // Polyline - Polyline
        (SketchElement::Polyline { points: pts1, .. }, SketchElement::Polyline { points: pts2, .. }) => {
            let mut pts = Vec::new();
            for i in 0..(pts1.len().saturating_sub(1)) {
                let seg1 = KLine::new(
                    Point::new(pts1[i].x, pts1[i].y),
                    Point::new(pts1[i + 1].x, pts1[i + 1].y),
                );
                for j in 0..(pts2.len().saturating_sub(1)) {
                    let seg2 = KLine::new(
                        Point::new(pts2[j].x, pts2[j].y),
                        Point::new(pts2[j + 1].x, pts2[j + 1].y),
                    );
                    if let Some((t, u, pt)) = line_line_intersection(seg1, seg2) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            pts.push(pt);
                        }
                    }
                }
            }
            pts
        }
        // Polyline - Spline
        (SketchElement::Polyline { points: pts1, .. }, SketchElement::Spline { points: pts2, .. }) |
        (SketchElement::Spline { points: pts2, .. }, SketchElement::Polyline { points: pts1, .. }) => {
            let mut pts = Vec::new();
            for i in 0..(pts1.len().saturating_sub(1)) {
                let seg1 = KLine::new(
                    Point::new(pts1[i].x, pts1[i].y),
                    Point::new(pts1[i + 1].x, pts1[i + 1].y),
                );
                for j in 0..(pts2.len().saturating_sub(1)) {
                    let seg2 = KLine::new(
                        Point::new(pts2[j].x, pts2[j].y),
                        Point::new(pts2[j + 1].x, pts2[j + 1].y),
                    );
                    if let Some((t, u, pt)) = line_line_intersection(seg1, seg2) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            pts.push(pt);
                        }
                    }
                }
            }
            pts
        }
        // Spline - Spline
        (SketchElement::Spline { points: pts1, .. }, SketchElement::Spline { points: pts2, .. }) => {
            let mut pts = Vec::new();
            for i in 0..(pts1.len().saturating_sub(1)) {
                let seg1 = KLine::new(
                    Point::new(pts1[i].x, pts1[i].y),
                    Point::new(pts1[i + 1].x, pts1[i + 1].y),
                );
                for j in 0..(pts2.len().saturating_sub(1)) {
                    let seg2 = KLine::new(
                        Point::new(pts2[j].x, pts2[j].y),
                        Point::new(pts2[j + 1].x, pts2[j + 1].y),
                    );
                    if let Some((t, u, pt)) = line_line_intersection(seg1, seg2) {
                        if t > 1e-6 && t < 1.0 - 1e-6 && u > 1e-6 && u < 1.0 - 1e-6 {
                            pts.push(pt);
                        }
                    }
                }
            }
            pts
        }
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

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

// ============================================================================
// Mirror operations
// ============================================================================

/// Reflect a point about a line (axis)
pub fn reflect_point_about_line(point: (f64, f64), axis: ((f64, f64), (f64, f64))) -> (f64, f64) {
    let (ax, ay) = axis.0;
    let (bx, by) = axis.1;

    // Direction of axis
    let dx = bx - ax;
    let dy = by - ay;
    let len_sq = dx * dx + dy * dy;
    if len_sq < 1e-12 {
        return point; // Degenerate axis
    }

    // Vector from axis start to point
    let px = point.0 - ax;
    let py = point.1 - ay;

    // Project point onto axis
    let t = (px * dx + py * dy) / len_sq;
    let proj_x = ax + t * dx;
    let proj_y = ay + t * dy;

    // Reflect: point' = 2 * proj - point
    (2.0 * proj_x - point.0, 2.0 * proj_y - point.1)
}

/// Reflect a sketch element about a line (axis)
pub fn reflect_element_about_line(element: &SketchElement, axis: ((f64, f64), (f64, f64))) -> SketchElement {
    match element {
        SketchElement::Line { start, end, .. } => {
            let reflected_start = reflect_point_about_line((start.x, start.y), axis);
            let reflected_end = reflect_point_about_line((end.x, end.y), axis);
            SketchElement::Line {
                id: None,
                start: Point2D {
                    x: reflected_start.0,
                    y: reflected_start.1,
                },
                end: Point2D {
                    x: reflected_end.0,
                    y: reflected_end.1,
                },
            }
        }
        SketchElement::Circle { center, radius, .. } => {
            let reflected_center = reflect_point_about_line((center.x, center.y), axis);
            SketchElement::Circle {
                id: None,
                center: Point2D {
                    x: reflected_center.0,
                    y: reflected_center.1,
                },
                radius: *radius,
            }
        }
        SketchElement::Arc {
            center,
            radius,
            start_angle,
            end_angle,
            ..
        } => {
            let reflected_center = reflect_point_about_line((center.x, center.y), axis);

            // Reflect angles: flip both angles and swap them
            // When reflecting across a line, angles need to be mirrored too
            let (ax, ay) = axis.0;
            let (bx, by) = axis.1;
            let axis_angle = (by - ay).atan2(bx - ax);

            // Reflect angles relative to axis angle
            let new_start = 2.0 * axis_angle - end_angle;
            let new_end = 2.0 * axis_angle - start_angle;

            SketchElement::Arc {
                id: None,
                center: Point2D {
                    x: reflected_center.0,
                    y: reflected_center.1,
                },
                radius: *radius,
                start_angle: new_start,
                end_angle: new_end,
            }
        }
        SketchElement::Rectangle { corner, width, height, .. } => {
            let reflected_corner = reflect_point_about_line((corner.x, corner.y), axis);
            SketchElement::Rectangle {
                id: None,
                corner: Point2D {
                    x: reflected_corner.0,
                    y: reflected_corner.1,
                },
                width: *width,
                height: *height,
            }
        }
        SketchElement::Polyline { points, .. } => {
            let reflected_points: Vec<Point2D> = points
                .iter()
                .map(|p| {
                    let reflected = reflect_point_about_line((p.x, p.y), axis);
                    Point2D {
                        x: reflected.0,
                        y: reflected.1,
                    }
                })
                .collect();
            SketchElement::Polyline {
                id: None,
                points: reflected_points,
            }
        }
        SketchElement::Spline { points, .. } => {
            let reflected_points: Vec<Point2D> = points
                .iter()
                .map(|p| {
                    let reflected = reflect_point_about_line((p.x, p.y), axis);
                    Point2D {
                        x: reflected.0,
                        y: reflected.1,
                    }
                })
                .collect();
            SketchElement::Spline {
                id: None,
                points: reflected_points,
            }
        }
        SketchElement::Dimension { from, to, value, parameter_name, dimension_line_pos, target_element, dimension_type } => {
            let reflected_from = reflect_point_about_line((from.x, from.y), axis);
            let reflected_to = reflect_point_about_line((to.x, to.y), axis);
            let reflected_dim_line_pos = dimension_line_pos.as_ref().map(|pos| {
                let reflected = reflect_point_about_line((pos.x, pos.y), axis);
                Point2D {
                    x: reflected.0,
                    y: reflected.1,
                }
            });
            SketchElement::Dimension {
                from: Point2D {
                    x: reflected_from.0,
                    y: reflected_from.1,
                },
                to: Point2D {
                    x: reflected_to.0,
                    y: reflected_to.1,
                },
                value: *value,
                parameter_name: parameter_name.clone(),
                dimension_line_pos: reflected_dim_line_pos,
                target_element: *target_element,
                dimension_type: *dimension_type,
            }
        }
    }
}
