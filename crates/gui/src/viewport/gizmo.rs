use glam::Vec3;

use super::camera::ArcBallCamera;
use super::mesh::LineMeshData;
use super::picking::Ray;

/// Which axis a gizmo handle belongs to
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GizmoAxis {
    X,
    Y,
    Z,
}

/// State of the translation gizmo
#[derive(Default)]
pub struct GizmoState {
    /// Currently dragged axis
    pub active_axis: Option<GizmoAxis>,
    /// Whether a gizmo drag is in progress
    pub dragging: bool,
    /// ID of the object being moved
    pub drag_object_id: Option<String>,
}


impl GizmoState {
    pub fn end_drag(&mut self) {
        self.active_axis = None;
        self.dragging = false;
        self.drag_object_id = None;
    }
}

/// Test if a ray hits one of the gizmo axes.
/// Returns the axis if the ray passes within `threshold` distance of an axis line.
pub fn gizmo_hit_test(ray: &Ray, center: Vec3, axis_length: f32) -> Option<GizmoAxis> {
    let axes = [
        (GizmoAxis::X, Vec3::X),
        (GizmoAxis::Y, Vec3::Y),
        (GizmoAxis::Z, Vec3::Z),
    ];

    let threshold = 0.15;
    let mut best: Option<(GizmoAxis, f32)> = None;

    for (axis_id, axis_dir) in &axes {
        let line_start = center;
        let line_end = center + *axis_dir * axis_length;

        let dist = ray_line_distance(ray, line_start, line_end);

        if dist < threshold
            && best.as_ref().is_none_or(|(_, d)| dist < *d) {
                best = Some((*axis_id, dist));
            }
    }

    best.map(|(axis, _)| axis)
}

/// Compute the world-space translation delta for a gizmo drag.
/// Projects the screen-space drag delta along the axis direction in screen space.
pub fn compute_drag_delta(
    camera: &ArcBallCamera,
    center: Vec3,
    axis: GizmoAxis,
    screen_delta: egui::Vec2,
    rect: egui::Rect,
) -> Vec3 {
    let axis_dir = match axis {
        GizmoAxis::X => Vec3::X,
        GizmoAxis::Y => Vec3::Y,
        GizmoAxis::Z => Vec3::Z,
    };

    // Project axis direction to screen space
    let p0 = camera.project(center.to_array(), rect);
    let p1 = camera.project((center + axis_dir).to_array(), rect);

    let (Some(screen_p0), Some(screen_p1)) = (p0, p1) else {
        return Vec3::ZERO;
    };

    let screen_axis = egui::vec2(screen_p1.x - screen_p0.x, screen_p1.y - screen_p0.y);
    let screen_axis_len = screen_axis.length();

    if screen_axis_len < 1.0 {
        return Vec3::ZERO;
    }

    let screen_axis_norm = screen_axis / screen_axis_len;

    // Dot product of screen drag delta with screen axis direction
    let projected = screen_delta.dot(screen_axis_norm);

    // Convert back to world units: 1 world unit = screen_axis_len pixels
    let world_delta = projected / screen_axis_len;

    axis_dir * world_delta
}

/// Build gizmo line mesh at the given center point.
pub fn build_gizmo_lines(center: Vec3, length: f32) -> LineMeshData {
    let mut vertices = Vec::new();

    let red = [0.9_f32, 0.2, 0.2, 1.0];
    let green = [0.2_f32, 0.8, 0.2, 1.0];
    let blue = [0.2_f32, 0.3, 0.9, 1.0];

    // X axis line
    push_line_vert(&mut vertices, center.x, center.y, center.z, red);
    push_line_vert(&mut vertices, center.x + length, center.y, center.z, red);

    // Y axis line
    push_line_vert(&mut vertices, center.x, center.y, center.z, green);
    push_line_vert(&mut vertices, center.x, center.y + length, center.z, green);

    // Z axis line
    push_line_vert(&mut vertices, center.x, center.y, center.z, blue);
    push_line_vert(&mut vertices, center.x, center.y, center.z + length, blue);

    // Arrowhead lines for X
    let arrow = length * 0.15;
    let tip_x = center.x + length;
    push_line_vert(&mut vertices, tip_x, center.y, center.z, red);
    push_line_vert(&mut vertices, tip_x - arrow, center.y + arrow * 0.5, center.z, red);
    push_line_vert(&mut vertices, tip_x, center.y, center.z, red);
    push_line_vert(&mut vertices, tip_x - arrow, center.y - arrow * 0.5, center.z, red);

    // Arrowhead lines for Y
    let tip_y = center.y + length;
    push_line_vert(&mut vertices, center.x, tip_y, center.z, green);
    push_line_vert(&mut vertices, center.x + arrow * 0.5, tip_y - arrow, center.z, green);
    push_line_vert(&mut vertices, center.x, tip_y, center.z, green);
    push_line_vert(&mut vertices, center.x - arrow * 0.5, tip_y - arrow, center.z, green);

    // Arrowhead lines for Z
    let tip_z = center.z + length;
    push_line_vert(&mut vertices, center.x, center.y, tip_z, blue);
    push_line_vert(&mut vertices, center.x, center.y + arrow * 0.5, tip_z - arrow, blue);
    push_line_vert(&mut vertices, center.x, center.y, tip_z, blue);
    push_line_vert(&mut vertices, center.x, center.y - arrow * 0.5, tip_z - arrow, blue);

    LineMeshData { vertices }
}

// ── Helpers ──────────────────────────────────────────────────

fn push_line_vert(v: &mut Vec<f32>, px: f32, py: f32, pz: f32, c: [f32; 4]) {
    v.extend_from_slice(&[px, py, pz, c[0], c[1], c[2], c[3]]);
}

/// Minimum distance between a ray and a line segment.
fn ray_line_distance(ray: &Ray, line_start: Vec3, line_end: Vec3) -> f32 {
    let u = ray.direction;
    let v = line_end - line_start;
    let w = ray.origin - line_start;

    let a = u.dot(u); // always >= 0
    let b = u.dot(v);
    let c = v.dot(v); // always >= 0
    let d = u.dot(w);
    let e = v.dot(w);

    let denom = a * c - b * b;

    let (sc, tc);

    if denom < 1e-7 {
        // Nearly parallel
        sc = 0.0;
        tc = if b > c { d / b } else { e / c };
    } else {
        sc = (b * e - c * d) / denom;
        tc = (a * e - b * d) / denom;
    }

    // Clamp tc to [0,1] (line segment)
    let tc = tc.clamp(0.0, 1.0);
    // Only consider positive ray parameter
    let sc = sc.max(0.0);

    let closest_ray = ray.origin + u * sc;
    let closest_line = line_start + v * tc;

    (closest_ray - closest_line).length()
}
