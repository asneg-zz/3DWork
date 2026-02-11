use glam::Vec3;
use shared::{Sketch, SketchElement, SketchPlane, Transform};

use super::picking::Ray;
use crate::state::sketch::{SnapPoint, SnapSettings, SnapType};

/// Intersect a camera ray with a sketch's plane, returning 2D sketch coordinates.
/// Returns None if the ray is parallel to the plane or intersection is behind the camera.
pub fn ray_sketch_plane(
    ray: &Ray,
    sketch: &Sketch,
    transform: &Transform,
) -> Option<[f64; 2]> {
    let (normal, point_on_plane) = sketch_plane_params(sketch, transform);

    let denom = ray.direction.dot(normal);
    if denom.abs() < 1e-6 {
        return None; // Ray parallel to plane
    }

    let t = (point_on_plane - ray.origin).dot(normal) / denom;
    if t < 0.0 {
        return None; // Intersection behind camera
    }

    let hit_3d = ray.origin + ray.direction * t;
    world_to_sketch_2d(hit_3d, sketch, transform)
}

/// Returns (plane_normal, point_on_plane) for a sketch's plane in world space.
fn sketch_plane_params(sketch: &Sketch, transform: &Transform) -> (Vec3, Vec3) {
    let pos = Vec3::new(
        transform.position[0] as f32,
        transform.position[1] as f32,
        transform.position[2] as f32,
    );

    match sketch.plane {
        SketchPlane::Xy => (Vec3::Z, pos + Vec3::new(0.0, 0.0, sketch.offset as f32)),
        SketchPlane::Xz => (Vec3::Y, pos + Vec3::new(0.0, sketch.offset as f32, 0.0)),
        SketchPlane::Yz => (Vec3::X, pos + Vec3::new(sketch.offset as f32, 0.0, 0.0)),
    }
}

/// Convert a 3D world point back to 2D sketch coordinates.
/// Reverse of renderer::sketch_point_to_3d.
fn world_to_sketch_2d(
    world: Vec3,
    sketch: &Sketch,
    transform: &Transform,
) -> Option<[f64; 2]> {
    // Undo transform: local = (world - position) / scale
    let sx = transform.scale[0] as f32;
    let sy = transform.scale[1] as f32;
    let sz = transform.scale[2] as f32;
    if sx.abs() < 1e-9 || sy.abs() < 1e-9 || sz.abs() < 1e-9 {
        return None;
    }

    let local = Vec3::new(
        (world.x - transform.position[0] as f32) / sx,
        (world.y - transform.position[1] as f32) / sy,
        (world.z - transform.position[2] as f32) / sz,
    );

    let (x, y) = match sketch.plane {
        SketchPlane::Xy => (local.x as f64, local.y as f64),
        SketchPlane::Xz => (local.x as f64, local.z as f64),
        SketchPlane::Yz => (local.y as f64, local.z as f64),
    };

    Some([x, y])
}

// ============================================================================
// Snap (привязки)
// ============================================================================

/// Найти ближайшую точку привязки к курсору
pub fn find_snap_point(
    cursor: [f64; 2],
    sketch: &Sketch,
    settings: &SnapSettings,
) -> Option<SnapPoint> {
    if !settings.enabled {
        return None;
    }

    let mut best: Option<(f64, SnapPoint)> = None;

    // Собрать точки привязки от всех элементов
    for (i, elem) in sketch.elements.iter().enumerate() {
        let points = get_element_snap_points(elem, i, settings);
        for sp in points {
            let dist = distance_2d(cursor, sp.point);
            if dist < settings.snap_radius
                && (best.is_none() || dist < best.as_ref().unwrap().0) {
                    best = Some((dist, sp));
                }
        }
    }

    // Если ничего не найдено, попробовать привязку к сетке
    if best.is_none() && settings.grid {
        let snapped = snap_to_grid(cursor, settings.grid_size);
        // Проверить, достаточно ли близко к линии сетки
        let grid_dist = distance_2d(cursor, snapped);
        if grid_dist < settings.snap_radius {
            return Some(SnapPoint {
                point: snapped,
                snap_type: SnapType::Grid,
                source_element: None,
            });
        }
    }

    best.map(|(_, sp)| sp)
}

/// Получить характерные точки привязки для элемента
fn get_element_snap_points(
    elem: &SketchElement,
    elem_index: usize,
    settings: &SnapSettings,
) -> Vec<SnapPoint> {
    let mut points = Vec::new();

    match elem {
        SketchElement::Line { start, end } => {
            if settings.endpoint {
                points.push(SnapPoint {
                    point: [start.x, start.y],
                    snap_type: SnapType::Endpoint,
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    point: [end.x, end.y],
                    snap_type: SnapType::Endpoint,
                    source_element: Some(elem_index),
                });
            }
            if settings.midpoint {
                let mid = [(start.x + end.x) / 2.0, (start.y + end.y) / 2.0];
                points.push(SnapPoint {
                    point: mid,
                    snap_type: SnapType::Midpoint,
                    source_element: Some(elem_index),
                });
            }
        }

        SketchElement::Circle { center, radius } => {
            if settings.center {
                points.push(SnapPoint {
                    point: [center.x, center.y],
                    snap_type: SnapType::Center,
                    source_element: Some(elem_index),
                });
            }
            if settings.quadrant {
                // 4 точки на круге: 0°, 90°, 180°, 270°
                let quads = [
                    [center.x + radius, center.y],       // 0° (право)
                    [center.x, center.y + radius],       // 90° (верх)
                    [center.x - radius, center.y],       // 180° (лево)
                    [center.x, center.y - radius],       // 270° (низ)
                ];
                for q in quads {
                    points.push(SnapPoint {
                        point: q,
                        snap_type: SnapType::Quadrant,
                        source_element: Some(elem_index),
                    });
                }
            }
        }

        SketchElement::Arc { center, radius, start_angle, end_angle } => {
            if settings.center {
                points.push(SnapPoint {
                    point: [center.x, center.y],
                    snap_type: SnapType::Center,
                    source_element: Some(elem_index),
                });
            }
            if settings.endpoint {
                // Начальная и конечная точки дуги
                let start_pt = [
                    center.x + radius * start_angle.cos(),
                    center.y + radius * start_angle.sin(),
                ];
                let end_pt = [
                    center.x + radius * end_angle.cos(),
                    center.y + radius * end_angle.sin(),
                ];
                points.push(SnapPoint {
                    point: start_pt,
                    snap_type: SnapType::Endpoint,
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    point: end_pt,
                    snap_type: SnapType::Endpoint,
                    source_element: Some(elem_index),
                });
            }
        }

        SketchElement::Rectangle { corner, width, height } => {
            if settings.endpoint {
                // 4 угла прямоугольника
                let corners = [
                    [corner.x, corner.y],
                    [corner.x + width, corner.y],
                    [corner.x + width, corner.y + height],
                    [corner.x, corner.y + height],
                ];
                for c in corners {
                    points.push(SnapPoint {
                        point: c,
                        snap_type: SnapType::Endpoint,
                        source_element: Some(elem_index),
                    });
                }
            }
            if settings.midpoint {
                // Середины сторон
                let mids = [
                    [corner.x + width / 2.0, corner.y],              // низ
                    [corner.x + width, corner.y + height / 2.0],     // право
                    [corner.x + width / 2.0, corner.y + height],     // верх
                    [corner.x, corner.y + height / 2.0],             // лево
                ];
                for m in mids {
                    points.push(SnapPoint {
                        point: m,
                        snap_type: SnapType::Midpoint,
                        source_element: Some(elem_index),
                    });
                }
            }
            if settings.center {
                // Центр прямоугольника
                points.push(SnapPoint {
                    point: [corner.x + width / 2.0, corner.y + height / 2.0],
                    snap_type: SnapType::Center,
                    source_element: Some(elem_index),
                });
            }
        }

        SketchElement::Polyline { points: poly_pts } => {
            if settings.endpoint {
                for pt in poly_pts {
                    points.push(SnapPoint {
                        point: [pt.x, pt.y],
                        snap_type: SnapType::Endpoint,
                        source_element: Some(elem_index),
                    });
                }
            }
            if settings.midpoint && poly_pts.len() >= 2 {
                for i in 0..poly_pts.len() - 1 {
                    let mid = [
                        (poly_pts[i].x + poly_pts[i + 1].x) / 2.0,
                        (poly_pts[i].y + poly_pts[i + 1].y) / 2.0,
                    ];
                    points.push(SnapPoint {
                        point: mid,
                        snap_type: SnapType::Midpoint,
                        source_element: Some(elem_index),
                    });
                }
            }
        }

        SketchElement::Spline { points: spline_pts } => {
            // Для сплайна только контрольные точки
            if settings.endpoint {
                for pt in spline_pts {
                    points.push(SnapPoint {
                        point: [pt.x, pt.y],
                        snap_type: SnapType::Endpoint,
                        source_element: Some(elem_index),
                    });
                }
            }
        }

        SketchElement::Dimension { from, to, .. } => {
            // Точки размера
            if settings.endpoint {
                points.push(SnapPoint {
                    point: [from.x, from.y],
                    snap_type: SnapType::Endpoint,
                    source_element: Some(elem_index),
                });
                points.push(SnapPoint {
                    point: [to.x, to.y],
                    snap_type: SnapType::Endpoint,
                    source_element: Some(elem_index),
                });
            }
        }
    }

    points
}

/// Привязать точку к сетке
fn snap_to_grid(point: [f64; 2], grid_size: f64) -> [f64; 2] {
    [
        (point[0] / grid_size).round() * grid_size,
        (point[1] / grid_size).round() * grid_size,
    ]
}

/// Расстояние между двумя 2D точками
fn distance_2d(a: [f64; 2], b: [f64; 2]) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    (dx * dx + dy * dy).sqrt()
}

// ============================================================================
// Hit testing for trim tool
// ============================================================================

/// Result of hit-testing a sketch element
#[derive(Debug, Clone)]
pub struct ElementHit {
    pub element_index: usize,
    pub distance: f64,
}

/// Hit-test all elements and return the closest one within tolerance
pub fn hit_test_elements(
    click_point: [f64; 2],
    sketch: &Sketch,
    tolerance: f64,
) -> Option<ElementHit> {
    let mut best: Option<ElementHit> = None;

    for (i, elem) in sketch.elements.iter().enumerate() {
        let dist = distance_to_element(click_point, elem);
        if dist < tolerance {
            if best.is_none() || dist < best.as_ref().unwrap().distance {
                best = Some(ElementHit {
                    element_index: i,
                    distance: dist,
                });
            }
        }
    }

    best
}

/// Calculate distance from a point to a sketch element
fn distance_to_element(point: [f64; 2], element: &SketchElement) -> f64 {
    match element {
        SketchElement::Line { start, end } => {
            distance_to_line_segment(point, [start.x, start.y], [end.x, end.y])
        }
        SketchElement::Circle { center, radius } => {
            let dist_to_center = distance_2d(point, [center.x, center.y]);
            (dist_to_center - radius).abs()
        }
        SketchElement::Arc {
            center,
            radius,
            start_angle,
            end_angle,
        } => distance_to_arc(
            point,
            [center.x, center.y],
            *radius,
            *start_angle,
            *end_angle,
        ),
        SketchElement::Rectangle {
            corner,
            width,
            height,
        } => {
            // Check distance to all 4 sides
            let corners = [
                [corner.x, corner.y],
                [corner.x + width, corner.y],
                [corner.x + width, corner.y + height],
                [corner.x, corner.y + height],
            ];
            let mut min_dist = f64::MAX;
            for j in 0..4 {
                let d = distance_to_line_segment(point, corners[j], corners[(j + 1) % 4]);
                if d < min_dist {
                    min_dist = d;
                }
            }
            min_dist
        }
        SketchElement::Polyline { points } => {
            if points.len() < 2 {
                return f64::MAX;
            }
            let mut min_dist = f64::MAX;
            for i in 0..points.len() - 1 {
                let d = distance_to_line_segment(
                    point,
                    [points[i].x, points[i].y],
                    [points[i + 1].x, points[i + 1].y],
                );
                if d < min_dist {
                    min_dist = d;
                }
            }
            min_dist
        }
        _ => f64::MAX, // Spline, Dimension - not trimmable
    }
}

/// Distance from a point to a line segment
fn distance_to_line_segment(point: [f64; 2], line_start: [f64; 2], line_end: [f64; 2]) -> f64 {
    let line_vec = [line_end[0] - line_start[0], line_end[1] - line_start[1]];
    let point_vec = [point[0] - line_start[0], point[1] - line_start[1]];

    let line_len_sq = line_vec[0] * line_vec[0] + line_vec[1] * line_vec[1];
    if line_len_sq < 1e-12 {
        return distance_2d(point, line_start);
    }

    let t = (point_vec[0] * line_vec[0] + point_vec[1] * line_vec[1]) / line_len_sq;
    let t_clamped = t.clamp(0.0, 1.0);

    let closest = [
        line_start[0] + t_clamped * line_vec[0],
        line_start[1] + t_clamped * line_vec[1],
    ];

    distance_2d(point, closest)
}

/// Distance from a point to an arc
fn distance_to_arc(
    point: [f64; 2],
    center: [f64; 2],
    radius: f64,
    start_angle: f64,
    end_angle: f64,
) -> f64 {
    let dx = point[0] - center[0];
    let dy = point[1] - center[1];
    let angle = dy.atan2(dx);
    let dist_to_center = (dx * dx + dy * dy).sqrt();

    // Check if point's angle is within arc range
    if angle_in_arc_range(angle, start_angle, end_angle) {
        // Point projects onto the arc - return distance to arc curve
        (dist_to_center - radius).abs()
    } else {
        // Point doesn't project onto arc - return distance to closest endpoint
        let start_pt = [
            center[0] + radius * start_angle.cos(),
            center[1] + radius * start_angle.sin(),
        ];
        let end_pt = [
            center[0] + radius * end_angle.cos(),
            center[1] + radius * end_angle.sin(),
        ];
        distance_2d(point, start_pt).min(distance_2d(point, end_pt))
    }
}

/// Normalize angle to [0, 2π) range
fn normalize_angle(angle: f64) -> f64 {
    let tau = std::f64::consts::TAU;
    let mut a = angle % tau;
    if a < 0.0 {
        a += tau;
    }
    a
}

/// Check if an angle is within an arc's range (handles wraparound)
fn angle_in_arc_range(angle: f64, start_angle: f64, end_angle: f64) -> bool {
    let a = normalize_angle(angle);
    let s = normalize_angle(start_angle);
    let e = normalize_angle(end_angle);

    if s <= e {
        a >= s && a <= e
    } else {
        // Arc crosses 0
        a >= s || a <= e
    }
}

// ============================================================================
// Hit testing for control points (drag endpoints)
// ============================================================================

/// Result of hit-testing a control point on a sketch element
#[derive(Debug, Clone)]
pub struct PointHit {
    /// Index of the element containing this point
    pub element_index: usize,
    /// Index of the point within the element (0=start, 1=end for Line, etc.)
    pub point_index: usize,
    /// 2D position of the point
    pub position: [f64; 2],
    /// Distance from cursor to this point
    pub distance: f64,
}

/// Get all control points for a sketch element that can be dragged
/// Returns Vec of (point_index, position)
pub fn get_element_control_points(elem: &SketchElement) -> Vec<(usize, [f64; 2])> {
    match elem {
        SketchElement::Line { start, end } => {
            vec![
                (0, [start.x, start.y]), // start point
                (1, [end.x, end.y]),     // end point
            ]
        }
        SketchElement::Circle { center, .. } => {
            vec![
                (0, [center.x, center.y]), // center only
            ]
        }
        SketchElement::Arc { center, radius, start_angle, end_angle } => {
            let start_pt = [
                center.x + radius * start_angle.cos(),
                center.y + radius * start_angle.sin(),
            ];
            let end_pt = [
                center.x + radius * end_angle.cos(),
                center.y + radius * end_angle.sin(),
            ];
            vec![
                (0, [center.x, center.y]), // center
                (1, start_pt),              // start point on arc
                (2, end_pt),                // end point on arc
            ]
        }
        SketchElement::Rectangle { corner, width, height } => {
            vec![
                (0, [corner.x, corner.y]),                      // bottom-left
                (1, [corner.x + width, corner.y]),              // bottom-right
                (2, [corner.x + width, corner.y + height]),     // top-right
                (3, [corner.x, corner.y + height]),             // top-left
            ]
        }
        SketchElement::Polyline { points } => {
            points.iter().enumerate()
                .map(|(i, pt)| (i, [pt.x, pt.y]))
                .collect()
        }
        SketchElement::Spline { points } => {
            points.iter().enumerate()
                .map(|(i, pt)| (i, [pt.x, pt.y]))
                .collect()
        }
        SketchElement::Dimension { .. } => {
            // Dimension points are not draggable
            vec![]
        }
    }
}

/// Hit-test all control points of all elements and return the closest one within tolerance
pub fn hit_test_element_points(
    click_point: [f64; 2],
    sketch: &Sketch,
    tolerance: f64,
) -> Option<PointHit> {
    let mut best: Option<PointHit> = None;

    for (elem_idx, elem) in sketch.elements.iter().enumerate() {
        let control_points = get_element_control_points(elem);
        for (point_idx, pos) in control_points {
            let dist = distance_2d(click_point, pos);
            if dist < tolerance {
                if best.is_none() || dist < best.as_ref().unwrap().distance {
                    best = Some(PointHit {
                        element_index: elem_idx,
                        point_index: point_idx,
                        position: pos,
                        distance: dist,
                    });
                }
            }
        }
    }

    best
}

/// Hit-test control points only for specific elements (e.g., selected or hovered)
pub fn hit_test_element_points_filtered(
    click_point: [f64; 2],
    sketch: &Sketch,
    element_indices: &[usize],
    tolerance: f64,
) -> Option<PointHit> {
    let mut best: Option<PointHit> = None;

    for &elem_idx in element_indices {
        if let Some(elem) = sketch.elements.get(elem_idx) {
            let control_points = get_element_control_points(elem);
            for (point_idx, pos) in control_points {
                let dist = distance_2d(click_point, pos);
                if dist < tolerance {
                    if best.is_none() || dist < best.as_ref().unwrap().distance {
                        best = Some(PointHit {
                            element_index: elem_idx,
                            point_index: point_idx,
                            position: pos,
                            distance: dist,
                        });
                    }
                }
            }
        }
    }

    best
}

