//! Viewport overlay drawing (axis labels, sketch preview, ViewCube, etc.)

use egui::Painter;
use glam::{Mat4, Vec3};

use crate::i18n::t;
use crate::state::settings::DimensionSettings;
use crate::state::sketch::SketchTool;
use crate::state::OperationType;
use crate::state::AppState;

use super::camera::{ArcBallCamera, StandardView};
use super::renderer;
use super::sketch_utils::find_sketch_data_ex;

/// Draw axis labels in the viewport
pub fn draw_axis_labels(painter: &Painter, rect: egui::Rect, camera: &ArcBallCamera) {
    let labels = [
        ([1.6_f32, 0.0, 0.0], "X", egui::Color32::from_rgb(220, 70, 70)),
        ([0.0, 1.6, 0.0], "Y", egui::Color32::from_rgb(70, 200, 70)),
        ([0.0, 0.0, 1.6], "Z", egui::Color32::from_rgb(70, 110, 220)),
    ];

    for (pos, label, color) in &labels {
        if let Some(screen) = camera.project(*pos, rect) {
            if rect.contains(screen) {
                painter.text(
                    screen,
                    egui::Align2::LEFT_BOTTOM,
                    *label,
                    egui::FontId::monospace(12.0),
                    *color,
                );
            }
        }
    }
}

// ============================================================================
// ViewCube (навигационный куб)
// ============================================================================

/// ViewCube face information
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewCubeFace {
    Front,
    Back,
    Left,
    Right,
    Top,
    Bottom,
}

impl ViewCubeFace {
    pub fn to_standard_view(self) -> StandardView {
        match self {
            ViewCubeFace::Front => StandardView::Front,
            ViewCubeFace::Back => StandardView::Back,
            ViewCubeFace::Left => StandardView::Left,
            ViewCubeFace::Right => StandardView::Right,
            ViewCubeFace::Top => StandardView::Top,
            ViewCubeFace::Bottom => StandardView::Bottom,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ViewCubeFace::Front => t("view.front"),
            ViewCubeFace::Back => t("view.back"),
            ViewCubeFace::Left => t("view.left"),
            ViewCubeFace::Right => t("view.right"),
            ViewCubeFace::Top => t("view.top"),
            ViewCubeFace::Bottom => t("view.bottom"),
        }
    }

    fn normal(self) -> Vec3 {
        match self {
            ViewCubeFace::Front => Vec3::new(0.0, 0.0, 1.0),
            ViewCubeFace::Back => Vec3::new(0.0, 0.0, -1.0),
            ViewCubeFace::Right => Vec3::new(1.0, 0.0, 0.0),
            ViewCubeFace::Left => Vec3::new(-1.0, 0.0, 0.0),
            ViewCubeFace::Top => Vec3::new(0.0, 1.0, 0.0),
            ViewCubeFace::Bottom => Vec3::new(0.0, -1.0, 0.0),
        }
    }
}

/// ViewCube state for rendering and interaction
pub struct ViewCubeState {
    /// Position of the cube center in screen coordinates
    pub center: egui::Pos2,
    /// Size of the cube in pixels
    pub size: f32,
    /// Projected face data for hit testing: (face, screen_points, depth)
    pub faces: Vec<(ViewCubeFace, [egui::Pos2; 4], f32)>,
}

/// Draw the ViewCube in the viewport corner
/// Returns ViewCubeState for interaction handling
pub fn draw_view_cube(
    painter: &Painter,
    rect: egui::Rect,
    camera: &ArcBallCamera,
) -> ViewCubeState {
    // Cube settings - larger size for better visibility
    let cube_size = 100.0_f32;
    let margin = 10.0_f32;

    // Position in top-right corner
    let center = egui::pos2(
        rect.right() - cube_size * 0.5 - margin,
        rect.top() + cube_size * 0.5 + margin,
    );

    // Define cube vertices (half-size = 1.0)
    let half = 1.0_f32;
    let vertices = [
        Vec3::new(-half, -half, -half), // 0: back-bottom-left
        Vec3::new(half, -half, -half),  // 1: back-bottom-right
        Vec3::new(half, half, -half),   // 2: back-top-right
        Vec3::new(-half, half, -half),  // 3: back-top-left
        Vec3::new(-half, -half, half),  // 4: front-bottom-left
        Vec3::new(half, -half, half),   // 5: front-bottom-right
        Vec3::new(half, half, half),    // 6: front-top-right
        Vec3::new(-half, half, half),   // 7: front-top-left
    ];

    // Define faces as vertex indices with their ViewCubeFace
    let face_indices: [(ViewCubeFace, [usize; 4]); 6] = [
        (ViewCubeFace::Front, [4, 5, 6, 7]),  // +Z
        (ViewCubeFace::Back, [1, 0, 3, 2]),   // -Z
        (ViewCubeFace::Right, [5, 1, 2, 6]),  // +X
        (ViewCubeFace::Left, [0, 4, 7, 3]),   // -X
        (ViewCubeFace::Top, [7, 6, 2, 3]),    // +Y
        (ViewCubeFace::Bottom, [0, 1, 5, 4]), // -Y
    ];

    // Create rotation matrix from camera yaw/pitch (inverted to show orientation)
    let rotation = Mat4::from_rotation_y(-camera.yaw) * Mat4::from_rotation_x(-camera.pitch);

    // Project cube vertices to screen
    let scale = cube_size * 0.4;
    let project_vertex = |v: Vec3| -> (egui::Pos2, f32) {
        let rotated = rotation.transform_point3(v);
        // Simple orthographic projection
        let screen_x = center.x + rotated.x * scale;
        let screen_y = center.y - rotated.y * scale; // Y flipped for screen coords
        (egui::pos2(screen_x, screen_y), rotated.z)
    };

    // Calculate face data with depths
    let mut face_data: Vec<(ViewCubeFace, [egui::Pos2; 4], f32)> = face_indices
        .iter()
        .map(|(face, indices)| {
            let corners: Vec<_> = indices.iter().map(|&i| project_vertex(vertices[i])).collect();
            let screen_pts = [corners[0].0, corners[1].0, corners[2].0, corners[3].0];
            // Average depth for sorting
            let avg_depth = corners.iter().map(|(_, z)| *z).sum::<f32>() / 4.0;
            (*face, screen_pts, avg_depth)
        })
        .collect();

    // Sort by depth (back to front)
    face_data.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal));

    // Colors
    let face_color = egui::Color32::from_rgba_unmultiplied(60, 80, 120, 220);
    let _face_color_hover = egui::Color32::from_rgba_unmultiplied(80, 110, 160, 240);
    let edge_color = egui::Color32::from_rgba_unmultiplied(40, 50, 70, 255);
    let text_color = egui::Color32::from_rgba_unmultiplied(220, 220, 240, 255);

    // Draw faces (front-facing only, sorted by depth)
    for (face, corners, _depth) in &face_data {
        // Check if face is front-facing (visible)
        let rotated_normal = rotation.transform_vector3(face.normal());
        if rotated_normal.z <= 0.0 {
            continue; // Back-facing, skip
        }

        // Brightness based on facing direction
        let brightness = 0.5 + 0.5 * rotated_normal.z;
        let color = egui::Color32::from_rgba_unmultiplied(
            (face_color.r() as f32 * brightness) as u8,
            (face_color.g() as f32 * brightness) as u8,
            (face_color.b() as f32 * brightness) as u8,
            face_color.a(),
        );

        // Draw filled face
        let shape = egui::Shape::convex_polygon(
            corners.to_vec(),
            color,
            egui::Stroke::new(1.0, edge_color),
        );
        painter.add(shape);

        // Draw face label
        let center_x = corners.iter().map(|p| p.x).sum::<f32>() / 4.0;
        let center_y = corners.iter().map(|p| p.y).sum::<f32>() / 4.0;
        let label_pos = egui::pos2(center_x, center_y);

        // Scale text based on face visibility
        let font_size = 9.0 + 3.0 * rotated_normal.z;
        let text_alpha = (180.0 + 75.0 * rotated_normal.z) as u8;
        let label_color = egui::Color32::from_rgba_unmultiplied(
            text_color.r(),
            text_color.g(),
            text_color.b(),
            text_alpha,
        );

        painter.text(
            label_pos,
            egui::Align2::CENTER_CENTER,
            face.label(),
            egui::FontId::proportional(font_size),
            label_color,
        );
    }

    // Draw outline circle around cube
    painter.circle_stroke(
        center,
        cube_size * 0.55,
        egui::Stroke::new(1.5, egui::Color32::from_rgba_unmultiplied(100, 120, 150, 150)),
    );

    ViewCubeState {
        center,
        size: cube_size,
        faces: face_data,
    }
}

/// Check if a point is inside a convex polygon (for hit testing)
fn point_in_polygon(point: egui::Pos2, polygon: &[egui::Pos2; 4]) -> bool {
    let n = polygon.len();
    let mut sign = None;

    for i in 0..n {
        let p1 = polygon[i];
        let p2 = polygon[(i + 1) % n];

        // Cross product of edge vector and vector to point
        let cross = (p2.x - p1.x) * (point.y - p1.y) - (p2.y - p1.y) * (point.x - p1.x);

        let current_sign = cross > 0.0;
        match sign {
            None => sign = Some(current_sign),
            Some(s) if s != current_sign => return false,
            _ => {}
        }
    }

    true
}

/// Check if mouse position is within the ViewCube area (for drag handling)
pub fn is_over_view_cube(state: &ViewCubeState, mouse_pos: egui::Pos2) -> bool {
    let dist = ((mouse_pos.x - state.center.x).powi(2) + (mouse_pos.y - state.center.y).powi(2)).sqrt();
    dist <= state.size * 0.6
}

/// Handle ViewCube click - returns the clicked face if any
pub fn hit_test_view_cube(
    state: &ViewCubeState,
    mouse_pos: egui::Pos2,
) -> Option<ViewCubeFace> {
    // Check if mouse is within cube bounds (rough check)
    if !is_over_view_cube(state, mouse_pos) {
        return None;
    }

    // Check faces in reverse order (front to back)
    for (face, corners, _depth) in state.faces.iter().rev() {
        if point_in_polygon(mouse_pos, corners) {
            return Some(*face);
        }
    }

    None
}

/// Draw sketch preview (in-progress drawing)
pub fn draw_sketch_preview(
    painter: &Painter,
    rect: egui::Rect,
    camera: &ArcBallCamera,
    state: &AppState,
) {
    let body_id = match state.sketch.editing_body_id() {
        Some(id) => id,
        None => return,
    };
    let feature_id = state.sketch.active_feature_id();
    let (sketch, sketch_transform) = match find_sketch_data_ex(
        &state.scene.scene,
        body_id,
        feature_id.map(|s| s.as_str()),
    ) {
        Some(data) => data,
        None => return,
    };

    // Combine body transform with sketch transform
    let body_transform = state
        .scene
        .scene
        .bodies
        .iter()
        .find(|b| &b.id == body_id)
        .map(|b| crate::helpers::get_body_base_transform(b))
        .unwrap_or_else(shared::Transform::new);
    let combined_transform = crate::helpers::combine_transforms(&body_transform, sketch_transform);

    let pts = &state.sketch.drawing_points;
    let preview = state.sketch.preview_point;

    let preview_color = egui::Color32::from_rgba_unmultiplied(255, 200, 50, 180);
    let preview_stroke = egui::Stroke::new(1.5, preview_color);
    let point_color = egui::Color32::from_rgba_unmultiplied(255, 255, 100, 220);

    let to_screen = |p: [f64; 2]| -> Option<egui::Pos2> {
        let p3d = renderer::sketch_point_to_3d(p[0], p[1], sketch, &combined_transform);
        camera.project(p3d, rect)
    };

    // Draw placed points as small circles
    for pt in pts {
        if let Some(screen_pt) = to_screen(*pt) {
            painter.circle_filled(screen_pt, 3.0, point_color);
        }
    }

    match state.sketch.tool {
        SketchTool::Line => {
            draw_line_preview(pts, preview, to_screen, painter, preview_stroke);
        }
        SketchTool::Circle => {
            draw_circle_preview(pts, preview, to_screen, painter, preview_stroke);
        }
        SketchTool::Rectangle => {
            draw_rectangle_preview(pts, preview, to_screen, painter, preview_stroke);
        }
        SketchTool::Arc => {
            draw_arc_preview(pts, preview, to_screen, painter, preview_stroke);
        }
        SketchTool::Polyline | SketchTool::Spline => {
            draw_polyline_preview(pts, preview, to_screen, painter, preview_stroke);
        }
        SketchTool::Dimension => {
            draw_dimension_preview(
                pts,
                preview,
                to_screen,
                painter,
                preview_stroke,
                preview_color,
                &state.settings.dimensions,
                state.settings.units.abbrev(),
            );
        }
        SketchTool::None => {}
        // Modification tools don't need drawing preview
        SketchTool::Trim | SketchTool::Fillet | SketchTool::Offset | SketchTool::Mirror => {}
        SketchTool::Pattern => {
            // Pattern preview is handled separately
            draw_pattern_preview(
                painter,
                &sketch,
                &combined_transform,
                &state.sketch,
                camera,
                rect,
            );
        }
    }
}

/// Draw pattern preview (ghost elements showing where pattern copies will be)
fn draw_pattern_preview(
    painter: &Painter,
    sketch: &shared::Sketch,
    transform: &shared::Transform,
    sketch_state: &crate::state::sketch::SketchState,
    camera: &ArcBallCamera,
    rect: egui::Rect,
) {
    use crate::sketch::pattern::{linear_pattern, circular_pattern};
    use crate::state::sketch::PatternType;

    let selected = &sketch_state.element_selection.selected;
    if selected.is_empty() {
        return;
    }

    let params = &sketch_state.pattern_params;
    let ghost_color = egui::Color32::from_rgba_unmultiplied(100, 200, 255, 100);
    let ghost_stroke = egui::Stroke::new(1.0, ghost_color);

    let to_screen = |p: [f64; 2]| -> Option<egui::Pos2> {
        let p3d = renderer::sketch_point_to_3d(p[0], p[1], sketch, transform);
        camera.project(p3d, rect)
    };

    // Generate preview copies for each selected element
    for &idx in selected {
        if let Some(element) = sketch.elements.get(idx) {
            let copies = match params.pattern_type {
                PatternType::Linear => {
                    linear_pattern(element, params.count, params.spacing, params.direction)
                }
                PatternType::Circular => {
                    if let Some(center) = params.center {
                        circular_pattern(element, params.count, params.total_angle, center)
                    } else {
                        continue;
                    }
                }
            };

            // Draw each copy as ghost
            for copy in &copies {
                draw_element_ghost(painter, copy, &to_screen, ghost_stroke);
            }
        }
    }

    // Draw center marker for circular pattern
    if params.pattern_type == PatternType::Circular {
        if let Some(center) = params.center {
            if let Some(screen_center) = to_screen(center) {
                let marker_color = egui::Color32::from_rgb(255, 150, 50);
                painter.circle_stroke(screen_center, 6.0, egui::Stroke::new(2.0, marker_color));
                painter.line_segment(
                    [egui::pos2(screen_center.x - 8.0, screen_center.y), egui::pos2(screen_center.x + 8.0, screen_center.y)],
                    egui::Stroke::new(1.5, marker_color),
                );
                painter.line_segment(
                    [egui::pos2(screen_center.x, screen_center.y - 8.0), egui::pos2(screen_center.x, screen_center.y + 8.0)],
                    egui::Stroke::new(1.5, marker_color),
                );
            }
        }
    }
}

/// Draw a sketch element as a ghost (preview)
fn draw_element_ghost<F>(
    painter: &Painter,
    element: &shared::SketchElement,
    to_screen: &F,
    stroke: egui::Stroke,
) where
    F: Fn([f64; 2]) -> Option<egui::Pos2>,
{
    match element {
        shared::SketchElement::Line { start, end } => {
            if let (Some(a), Some(b)) = (to_screen([start.x, start.y]), to_screen([end.x, end.y])) {
                painter.line_segment([a, b], stroke);
            }
        }
        shared::SketchElement::Circle { center, radius } => {
            let segments = 32;
            let screen_pts: Vec<_> = (0..=segments)
                .filter_map(|i| {
                    let angle = (i as f64) * std::f64::consts::TAU / (segments as f64);
                    let px = center.x + radius * angle.cos();
                    let py = center.y + radius * angle.sin();
                    to_screen([px, py])
                })
                .collect();
            for w in screen_pts.windows(2) {
                painter.line_segment([w[0], w[1]], stroke);
            }
        }
        shared::SketchElement::Arc { center, radius, start_angle, end_angle } => {
            let segments = 24;
            let angle_span = end_angle - start_angle;
            let screen_pts: Vec<_> = (0..=segments)
                .filter_map(|i| {
                    let t = i as f64 / segments as f64;
                    let angle = start_angle + t * angle_span;
                    let px = center.x + radius * angle.cos();
                    let py = center.y + radius * angle.sin();
                    to_screen([px, py])
                })
                .collect();
            for w in screen_pts.windows(2) {
                painter.line_segment([w[0], w[1]], stroke);
            }
        }
        shared::SketchElement::Rectangle { corner, width, height } => {
            let corners = [
                [corner.x, corner.y],
                [corner.x + width, corner.y],
                [corner.x + width, corner.y + height],
                [corner.x, corner.y + height],
            ];
            let screen_corners: Vec<_> = corners.iter().filter_map(|c| to_screen(*c)).collect();
            if screen_corners.len() == 4 {
                for i in 0..4 {
                    let j = (i + 1) % 4;
                    painter.line_segment([screen_corners[i], screen_corners[j]], stroke);
                }
            }
        }
        shared::SketchElement::Polyline { points } | shared::SketchElement::Spline { points } => {
            let screen_pts: Vec<_> = points.iter().filter_map(|p| to_screen([p.x, p.y])).collect();
            for w in screen_pts.windows(2) {
                painter.line_segment([w[0], w[1]], stroke);
            }
        }
        shared::SketchElement::Dimension { .. } => {} // Don't draw dimensions as ghost
    }
}

fn draw_line_preview<F>(
    pts: &[[f64; 2]],
    preview: Option<[f64; 2]>,
    to_screen: F,
    painter: &Painter,
    stroke: egui::Stroke,
) where
    F: Fn([f64; 2]) -> Option<egui::Pos2>,
{
    if pts.len() == 1 {
        if let Some(prev) = preview {
            if let (Some(a), Some(b)) = (to_screen(pts[0]), to_screen(prev)) {
                painter.line_segment([a, b], stroke);
            }
        }
    }
}

fn draw_circle_preview<F>(
    pts: &[[f64; 2]],
    preview: Option<[f64; 2]>,
    to_screen: F,
    painter: &Painter,
    stroke: egui::Stroke,
) where
    F: Fn([f64; 2]) -> Option<egui::Pos2>,
{
    if pts.len() == 1 {
        if let Some(prev) = preview {
            let center = pts[0];
            let dx = prev[0] - center[0];
            let dy = prev[1] - center[1];
            let radius = (dx * dx + dy * dy).sqrt();
            let segments = 32;
            let screen_pts: Vec<_> = (0..=segments)
                .filter_map(|i| {
                    let angle = (i as f64) * std::f64::consts::TAU / (segments as f64);
                    let px = center[0] + radius * angle.cos();
                    let py = center[1] + radius * angle.sin();
                    to_screen([px, py])
                })
                .collect();
            for w in screen_pts.windows(2) {
                painter.line_segment([w[0], w[1]], stroke);
            }
        }
    }
}

fn draw_rectangle_preview<F>(
    pts: &[[f64; 2]],
    preview: Option<[f64; 2]>,
    to_screen: F,
    painter: &Painter,
    stroke: egui::Stroke,
) where
    F: Fn([f64; 2]) -> Option<egui::Pos2>,
{
    if pts.len() == 1 {
        if let Some(prev) = preview {
            let corners = [
                pts[0],
                [prev[0], pts[0][1]],
                prev,
                [pts[0][0], prev[1]],
            ];
            let screen_corners: Vec<_> = corners.iter().filter_map(|c| to_screen(*c)).collect();
            if screen_corners.len() == 4 {
                for i in 0..4 {
                    let j = (i + 1) % 4;
                    painter.line_segment([screen_corners[i], screen_corners[j]], stroke);
                }
            }
        }
    }
}

fn draw_arc_preview<F>(
    pts: &[[f64; 2]],
    preview: Option<[f64; 2]>,
    to_screen: F,
    painter: &Painter,
    stroke: egui::Stroke,
) where
    F: Fn([f64; 2]) -> Option<egui::Pos2>,
{
    match pts.len() {
        1 => {
            if let Some(prev) = preview {
                if let (Some(a), Some(b)) = (to_screen(pts[0]), to_screen(prev)) {
                    painter.line_segment([a, b], stroke);
                }
            }
        }
        2 => {
            if let Some(prev) = preview {
                let cx = pts[0][0];
                let cy = pts[0][1];
                let dx1 = pts[1][0] - cx;
                let dy1 = pts[1][1] - cy;
                let radius = (dx1 * dx1 + dy1 * dy1).sqrt();
                let start_angle = dy1.atan2(dx1);
                let dx2 = prev[0] - cx;
                let dy2 = prev[1] - cy;
                let end_angle = dy2.atan2(dx2);

                let mut angle_span = end_angle - start_angle;
                if angle_span < 0.0 {
                    angle_span += std::f64::consts::TAU;
                }

                let segments = 32;
                let screen_pts: Vec<_> = (0..=segments)
                    .filter_map(|i| {
                        let t = i as f64 / segments as f64;
                        let angle = start_angle + angle_span * t;
                        let px = cx + radius * angle.cos();
                        let py = cy + radius * angle.sin();
                        to_screen([px, py])
                    })
                    .collect();
                for w in screen_pts.windows(2) {
                    painter.line_segment([w[0], w[1]], stroke);
                }
            }
        }
        _ => {}
    }
}

fn draw_polyline_preview<F>(
    pts: &[[f64; 2]],
    preview: Option<[f64; 2]>,
    to_screen: F,
    painter: &Painter,
    stroke: egui::Stroke,
) where
    F: Fn([f64; 2]) -> Option<egui::Pos2>,
{
    // Lines through accumulated points + line to preview
    let all_screen: Vec<_> = pts.iter().filter_map(|p| to_screen(*p)).collect();
    for w in all_screen.windows(2) {
        painter.line_segment([w[0], w[1]], stroke);
    }
    if let (Some(last), Some(prev)) = (pts.last(), preview) {
        if let (Some(a), Some(b)) = (to_screen(*last), to_screen(prev)) {
            painter.line_segment([a, b], stroke);
        }
    }
}

fn draw_dimension_preview<F>(
    pts: &[[f64; 2]],
    preview: Option<[f64; 2]>,
    to_screen: F,
    painter: &Painter,
    stroke: egui::Stroke,
    text_color: egui::Color32,
    dim_settings: &DimensionSettings,
    unit_abbrev: &str,
) where
    F: Fn([f64; 2]) -> Option<egui::Pos2>,
{
    // Format dimension text using settings
    let format_dim = |value: f64| -> String {
        if dim_settings.show_units {
            format!("{:.prec$} {}", value, unit_abbrev, prec = dim_settings.precision)
        } else {
            format!("{:.prec$}", value, prec = dim_settings.precision)
        }
    };

    if pts.len() == 1 {
        // Показываем базовую линию от первой точки до курсора
        if let Some(prev) = preview {
            if let (Some(a), Some(b)) = (to_screen(pts[0]), to_screen(prev)) {
                painter.line_segment([a, b], stroke);
                let dx = prev[0] - pts[0][0];
                let dy = prev[1] - pts[0][1];
                let dist = (dx * dx + dy * dy).sqrt();
                let mid = egui::pos2((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 - 12.0);
                painter.text(
                    mid,
                    egui::Align2::CENTER_BOTTOM,
                    format_dim(dist),
                    egui::FontId::proportional(dim_settings.font_size),
                    text_color,
                );
            }
        }
    } else if pts.len() == 2 {
        // Показываем размерную линию с выносными линиями
        if let Some(pos) = preview {
            let p_from = pts[0];
            let p_to = pts[1];
            let dx = p_to[0] - p_from[0];
            let dy = p_to[1] - p_from[1];
            let len = (dx * dx + dy * dy).sqrt();

            if len > 1e-10 {
                let dir = [dx / len, dy / len];
                let to_pos = [pos[0] - p_from[0], pos[1] - p_from[1]];
                let proj = to_pos[0] * dir[0] + to_pos[1] * dir[1];
                let perp = [to_pos[0] - proj * dir[0], to_pos[1] - proj * dir[1]];

                let dim_start = [p_from[0] + perp[0], p_from[1] + perp[1]];
                let dim_end = [p_to[0] + perp[0], p_to[1] + perp[1]];

                // Выносные линии
                let thin_stroke = egui::Stroke::new(stroke.width * 0.5, stroke.color);
                if let (Some(a), Some(b)) = (to_screen(p_from), to_screen(dim_start)) {
                    painter.line_segment([a, b], thin_stroke);
                }
                if let (Some(a), Some(b)) = (to_screen(p_to), to_screen(dim_end)) {
                    painter.line_segment([a, b], thin_stroke);
                }

                // Размерная линия
                if let (Some(a), Some(b)) = (to_screen(dim_start), to_screen(dim_end)) {
                    painter.line_segment([a, b], stroke);

                    // Текст
                    let mid = egui::pos2((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 - 12.0);
                    painter.text(
                        mid,
                        egui::Align2::CENTER_BOTTOM,
                        format_dim(len),
                        egui::FontId::proportional(dim_settings.font_size),
                        text_color,
                    );
                }
            }
        }
    }
}

/// Draw revolve axis and angle arc when operation dialog is open
pub fn draw_revolve_overlay(
    painter: &Painter,
    rect: egui::Rect,
    camera: &ArcBallCamera,
    state: &AppState,
) {
    // Only draw when revolve/cut_revolve dialog is open
    if !state.operation_dialog.open {
        return;
    }

    let is_revolve = matches!(
        state.operation_dialog.operation_type,
        OperationType::Revolve | OperationType::CutRevolve
    );

    if !is_revolve {
        return;
    }

    // Get sketch data to determine the plane and position
    let (body_id, sketch_id) = match (
        state.operation_dialog.body_id.as_ref(),
        state.operation_dialog.sketch_id.as_ref(),
    ) {
        (Some(b), Some(s)) => (b, s),
        _ => return,
    };

    // Find the sketch
    let sketch_data = find_sketch_data_ex(
        &state.scene.scene,
        body_id,
        Some(sketch_id.as_str()),
    );

    let (sketch, sketch_transform) = match sketch_data {
        Some(data) => data,
        None => return,
    };

    // Combine body transform with sketch transform
    let body_transform = state
        .scene
        .scene
        .bodies
        .iter()
        .find(|b| &b.id == body_id)
        .map(|b| crate::helpers::get_body_base_transform(b))
        .unwrap_or_else(shared::Transform::new);
    let combined_transform = crate::helpers::combine_transforms(&body_transform, sketch_transform);

    // Axis color - magenta for visibility
    let axis_color = egui::Color32::from_rgb(255, 100, 200);
    let axis_stroke = egui::Stroke::new(2.5, axis_color);
    let _dashed_stroke = egui::Stroke::new(1.5, egui::Color32::from_rgba_unmultiplied(255, 100, 200, 150));

    // Get the selected axis from dialog params
    let axis_data = &state.operation_dialog.revolve_params.axis;
    let axis_name = axis_data.name.clone();

    // Convert axis points from sketch 2D to world 3D
    // Extend the axis line beyond the actual points for better visibility
    let extend_factor = 2.0;
    let axis_2d_start = axis_data.start;
    let axis_2d_end = axis_data.end;

    // Calculate extended axis points
    let dx = axis_2d_end[0] - axis_2d_start[0];
    let dy = axis_2d_end[1] - axis_2d_start[1];
    let len = (dx * dx + dy * dy).sqrt().max(0.001);
    let nx = dx / len;
    let ny = dy / len;

    let ext_start = [
        axis_2d_start[0] - nx * extend_factor,
        axis_2d_start[1] - ny * extend_factor,
    ];
    let ext_end = [
        axis_2d_end[0] + nx * extend_factor,
        axis_2d_end[1] + ny * extend_factor,
    ];

    // Convert to 3D world coordinates
    let axis_start_3d = renderer::sketch_point_to_3d(ext_start[0], ext_start[1], sketch, &combined_transform);
    let axis_end_3d = renderer::sketch_point_to_3d(ext_end[0], ext_end[1], sketch, &combined_transform);

    // Label position - slightly beyond the end
    let label_2d = [
        axis_2d_end[0] + nx * (extend_factor + 0.3),
        axis_2d_end[1] + ny * (extend_factor + 0.3),
    ];
    let axis_label_pos = renderer::sketch_point_to_3d(label_2d[0], label_2d[1], sketch, &combined_transform);

    let axis_start = axis_start_3d;
    let axis_end = axis_end_3d;

    // Project and draw axis line
    if let (Some(screen_start), Some(screen_end)) = (
        camera.project(axis_start, rect),
        camera.project(axis_end, rect),
    ) {
        // Draw dashed line effect manually
        let dx = screen_end.x - screen_start.x;
        let dy = screen_end.y - screen_start.y;
        let len = (dx * dx + dy * dy).sqrt();
        let dash_len = 8.0;
        let gap_len = 5.0;
        let num_dashes = (len / (dash_len + gap_len)) as i32;

        for i in 0..num_dashes {
            let t1 = (i as f32 * (dash_len + gap_len)) / len;
            let t2 = ((i as f32 * (dash_len + gap_len)) + dash_len) / len;
            if t2 <= 1.0 {
                let p1 = egui::pos2(
                    screen_start.x + dx * t1,
                    screen_start.y + dy * t1,
                );
                let p2 = egui::pos2(
                    screen_start.x + dx * t2.min(1.0),
                    screen_start.y + dy * t2.min(1.0),
                );
                painter.line_segment([p1, p2], axis_stroke);
            }
        }

        // Draw arrow at the end
        let arrow_size = 10.0;
        let angle = dy.atan2(dx);
        let arrow_angle = 0.4; // radians
        let arrow_p1 = egui::pos2(
            screen_end.x - arrow_size * (angle - arrow_angle).cos(),
            screen_end.y - arrow_size * (angle - arrow_angle).sin(),
        );
        let arrow_p2 = egui::pos2(
            screen_end.x - arrow_size * (angle + arrow_angle).cos(),
            screen_end.y - arrow_size * (angle + arrow_angle).sin(),
        );
        painter.line_segment([screen_end, arrow_p1], axis_stroke);
        painter.line_segment([screen_end, arrow_p2], axis_stroke);
    }

    // Draw axis label
    if let Some(label_pos) = camera.project(axis_label_pos, rect) {
        painter.text(
            label_pos,
            egui::Align2::CENTER_BOTTOM,
            &axis_name,
            egui::FontId::proportional(12.0),
            axis_color,
        );
    }

    // Draw angle arc to show rotation amount
    let angle_deg = state.operation_dialog.revolve_params.angle;
    let is_cut = state.operation_dialog.is_cut;

    // Draw arc indicator near the axis
    let arc_radius = 0.5;
    let segments = 24;
    let arc_color = if is_cut {
        egui::Color32::from_rgb(255, 100, 100) // Red for cut
    } else {
        egui::Color32::from_rgb(100, 255, 100) // Green for boss
    };
    let arc_stroke = egui::Stroke::new(2.0, arc_color);

    // Draw arc in 3D space - center on the axis midpoint
    let axis_mid_2d = [
        (axis_data.start[0] + axis_data.end[0]) / 2.0,
        (axis_data.start[1] + axis_data.end[1]) / 2.0,
    ];
    let arc_center_3d = renderer::sketch_point_to_3d(axis_mid_2d[0], axis_mid_2d[1], sketch, &combined_transform);
    let arc_center = [arc_center_3d[0] as f64, arc_center_3d[1] as f64, arc_center_3d[2] as f64];

    let arc_points: Vec<Option<egui::Pos2>> = (0..=segments)
        .map(|i| {
            let t = i as f64 / segments as f64;
            let angle_rad = t * angle_deg.to_radians();
            let (px, py, pz) = match sketch.plane {
                shared::SketchPlane::Xy => {
                    // Arc in XZ plane around Y axis
                    let x = arc_center[0] + arc_radius * angle_rad.cos();
                    let z = arc_center[2] + arc_radius * angle_rad.sin();
                    (x, arc_center[1], z)
                }
                shared::SketchPlane::Xz => {
                    // Arc in XY plane around Z axis
                    let x = arc_center[0] + arc_radius * angle_rad.cos();
                    let y = arc_center[1] + arc_radius * angle_rad.sin();
                    (x, y, arc_center[2])
                }
                shared::SketchPlane::Yz => {
                    // Arc in YZ plane around X axis
                    let y = arc_center[1] + arc_radius * angle_rad.cos();
                    let z = arc_center[2] + arc_radius * angle_rad.sin();
                    (arc_center[0], y, z)
                }
            };
            camera.project([px as f32, py as f32, pz as f32], rect)
        })
        .collect();

    // Draw arc segments
    for window in arc_points.windows(2) {
        if let (Some(p1), Some(p2)) = (window[0], window[1]) {
            painter.line_segment([p1, p2], arc_stroke);
        }
    }

    // Draw angle label
    let label_text = format!("{}°", angle_deg as i32);
    let label_angle = (angle_deg / 2.0).to_radians();
    let label_radius = arc_radius * 1.5;
    let (lx, ly, lz) = match sketch.plane {
        shared::SketchPlane::Xy => {
            let x = arc_center[0] + label_radius * label_angle.cos();
            let z = arc_center[2] + label_radius * label_angle.sin();
            (x, arc_center[1], z)
        }
        shared::SketchPlane::Xz => {
            let x = arc_center[0] + label_radius * label_angle.cos();
            let y = arc_center[1] + label_radius * label_angle.sin();
            (x, y, arc_center[2])
        }
        shared::SketchPlane::Yz => {
            let y = arc_center[1] + label_radius * label_angle.cos();
            let z = arc_center[2] + label_radius * label_angle.sin();
            (arc_center[0], y, z)
        }
    };

    if let Some(label_pos) = camera.project([lx as f32, ly as f32, lz as f32], rect) {
        painter.text(
            label_pos,
            egui::Align2::CENTER_CENTER,
            label_text,
            egui::FontId::proportional(11.0),
            arc_color,
        );
    }

    // Draw operation type label
    let op_label = if is_cut { "Cut Revolve" } else { "Revolve" };
    let info_pos = egui::pos2(rect.left() + 10.0, rect.top() + 60.0);
    painter.text(
        info_pos,
        egui::Align2::LEFT_TOP,
        op_label,
        egui::FontId::proportional(14.0),
        arc_color,
    );
}

/// Draw revolve axis preview during sketch editing when an axis is designated
pub fn draw_sketch_revolve_axis_preview(
    painter: &Painter,
    rect: egui::Rect,
    camera: &ArcBallCamera,
    state: &AppState,
) {
    // Only draw in sketch editing mode
    let body_id = match state.sketch.editing_body_id() {
        Some(id) => id,
        None => return,
    };

    let feature_id = state.sketch.active_feature_id();
    let (sketch, sketch_transform) = match find_sketch_data_ex(
        &state.scene.scene,
        body_id,
        feature_id.map(|s| s.as_str()),
    ) {
        Some(data) => data,
        None => return,
    };

    // Check if sketch has a designated revolve axis
    let axis_index = match sketch.revolve_axis {
        Some(idx) => idx,
        None => return,
    };

    // Get the axis element
    let axis_element = match sketch.elements.get(axis_index) {
        Some(shared::SketchElement::Line { start, end }) => (start, end),
        _ => return,
    };

    // Combine body transform with sketch transform
    let body_transform = state
        .scene
        .scene
        .bodies
        .iter()
        .find(|b| &b.id == body_id)
        .map(|b| crate::helpers::get_body_base_transform(b))
        .unwrap_or_else(shared::Transform::new);
    let combined_transform = crate::helpers::combine_transforms(&body_transform, sketch_transform);

    // Axis styling - magenta dashed line with arrows
    let axis_color = egui::Color32::from_rgb(200, 50, 200);
    let axis_stroke = egui::Stroke::new(2.0, axis_color);
    let ghost_color = egui::Color32::from_rgba_unmultiplied(200, 50, 200, 80);
    let ghost_stroke = egui::Stroke::new(1.0, ghost_color);

    // Extend the axis line for better visibility
    let extend_factor = 3.0;
    let dx = axis_element.1.x - axis_element.0.x;
    let dy = axis_element.1.y - axis_element.0.y;
    let len = (dx * dx + dy * dy).sqrt().max(0.001);
    let nx = dx / len;
    let ny = dy / len;

    let ext_start = [
        axis_element.0.x - nx * extend_factor,
        axis_element.0.y - ny * extend_factor,
    ];
    let ext_end = [
        axis_element.1.x + nx * extend_factor,
        axis_element.1.y + ny * extend_factor,
    ];

    // Convert to 3D
    let axis_start_3d = renderer::sketch_point_to_3d(ext_start[0], ext_start[1], sketch, &combined_transform);
    let axis_end_3d = renderer::sketch_point_to_3d(ext_end[0], ext_end[1], sketch, &combined_transform);

    // Draw extended axis line (dashed)
    if let (Some(screen_start), Some(screen_end)) = (
        camera.project(axis_start_3d, rect),
        camera.project(axis_end_3d, rect),
    ) {
        let dx = screen_end.x - screen_start.x;
        let dy = screen_end.y - screen_start.y;
        let line_len = (dx * dx + dy * dy).sqrt();
        let dash_len = 8.0;
        let gap_len = 5.0;
        let num_dashes = (line_len / (dash_len + gap_len)) as i32;

        for i in 0..num_dashes {
            let t1 = (i as f32 * (dash_len + gap_len)) / line_len;
            let t2 = ((i as f32 * (dash_len + gap_len)) + dash_len) / line_len;
            if t2 <= 1.0 {
                let p1 = egui::pos2(screen_start.x + dx * t1, screen_start.y + dy * t1);
                let p2 = egui::pos2(screen_start.x + dx * t2.min(1.0), screen_start.y + dy * t2.min(1.0));
                painter.line_segment([p1, p2], axis_stroke);
            }
        }

        // Draw arrows at both ends
        let arrow_size = 10.0;
        let angle = dy.atan2(dx);
        let arrow_angle = 0.4;

        // Arrow at end
        let arrow_p1 = egui::pos2(
            screen_end.x - arrow_size * (angle - arrow_angle).cos(),
            screen_end.y - arrow_size * (angle - arrow_angle).sin(),
        );
        let arrow_p2 = egui::pos2(
            screen_end.x - arrow_size * (angle + arrow_angle).cos(),
            screen_end.y - arrow_size * (angle + arrow_angle).sin(),
        );
        painter.line_segment([screen_end, arrow_p1], axis_stroke);
        painter.line_segment([screen_end, arrow_p2], axis_stroke);

        // Arrow at start (reversed)
        let arrow_p3 = egui::pos2(
            screen_start.x + arrow_size * (angle - arrow_angle).cos(),
            screen_start.y + arrow_size * (angle - arrow_angle).sin(),
        );
        let arrow_p4 = egui::pos2(
            screen_start.x + arrow_size * (angle + arrow_angle).cos(),
            screen_start.y + arrow_size * (angle + arrow_angle).sin(),
        );
        painter.line_segment([screen_start, arrow_p3], axis_stroke);
        painter.line_segment([screen_start, arrow_p4], axis_stroke);
    }

    // Get the 3D axis for rotation (using original axis points, not extended)
    let axis_start_3d_orig = renderer::sketch_point_to_3d(
        axis_element.0.x, axis_element.0.y, sketch, &combined_transform
    );
    let axis_end_3d_orig = renderer::sketch_point_to_3d(
        axis_element.1.x, axis_element.1.y, sketch, &combined_transform
    );

    // Calculate normalized 3D axis direction
    let axis_3d = [
        (axis_end_3d_orig[0] - axis_start_3d_orig[0]) as f64,
        (axis_end_3d_orig[1] - axis_start_3d_orig[1]) as f64,
        (axis_end_3d_orig[2] - axis_start_3d_orig[2]) as f64,
    ];
    let axis_len = (axis_3d[0] * axis_3d[0] + axis_3d[1] * axis_3d[1] + axis_3d[2] * axis_3d[2]).sqrt();
    if axis_len < 0.0001 {
        return; // Axis too short
    }
    let axis_normalized = [axis_3d[0] / axis_len, axis_3d[1] / axis_len, axis_3d[2] / axis_len];
    let axis_origin_3d = [
        axis_start_3d_orig[0] as f64,
        axis_start_3d_orig[1] as f64,
        axis_start_3d_orig[2] as f64,
    ];

    // Draw ghost profiles at 90°, 180°, 270° rotations
    for (idx, element) in sketch.elements.iter().enumerate() {
        if idx == axis_index || sketch.is_construction(idx) {
            continue;
        }

        // Get points from the element
        let points_2d = get_element_points(element);
        if points_2d.is_empty() {
            continue;
        }

        // Convert all points to 3D first
        let points_3d: Vec<[f64; 3]> = points_2d
            .iter()
            .map(|p| {
                let p3 = renderer::sketch_point_to_3d(p[0], p[1], sketch, &combined_transform);
                [p3[0] as f64, p3[1] as f64, p3[2] as f64]
            })
            .collect();

        // Draw ghost at 90°, 180°, 270°
        for angle_deg in [90.0_f64, 180.0, 270.0] {
            let angle_rad = angle_deg.to_radians();

            let rotated_points: Vec<[f32; 3]> = points_3d
                .iter()
                .map(|p| {
                    let rotated = rotate_point_around_axis_3d(*p, axis_origin_3d, axis_normalized, angle_rad);
                    [rotated[0] as f32, rotated[1] as f32, rotated[2] as f32]
                })
                .collect();

            // Draw as connected lines
            for window in rotated_points.windows(2) {
                if let (Some(p1), Some(p2)) = (
                    camera.project(window[0], rect),
                    camera.project(window[1], rect),
                ) {
                    painter.line_segment([p1, p2], ghost_stroke);
                }
            }

            // Close shape if needed (for circles)
            if matches!(element, shared::SketchElement::Circle { .. }) && rotated_points.len() > 2 {
                if let (Some(p1), Some(p2)) = (
                    camera.project(*rotated_points.last().unwrap(), rect),
                    camera.project(*rotated_points.first().unwrap(), rect),
                ) {
                    painter.line_segment([p1, p2], ghost_stroke);
                }
            }
        }
    }

    // Draw rotation arc indicator at a profile point
    // Find the furthest profile point from axis for the arc
    let mut max_dist_point: Option<([f64; 3], f64)> = None;
    for (idx, element) in sketch.elements.iter().enumerate() {
        if idx == axis_index || sketch.is_construction(idx) {
            continue;
        }
        let points = get_element_points(element);
        for p in &points {
            let p3 = renderer::sketch_point_to_3d(p[0], p[1], sketch, &combined_transform);
            let p3d = [p3[0] as f64, p3[1] as f64, p3[2] as f64];
            let dist = distance_point_to_line_3d(p3d, axis_origin_3d, axis_normalized);
            if max_dist_point.is_none() || dist > max_dist_point.unwrap().1 {
                max_dist_point = Some((p3d, dist));
            }
        }
    }

    // Draw a rotation arc at the furthest point
    if let Some((point, _dist)) = max_dist_point {
        let arc_segments = 24;
        let arc_color_indicator = egui::Color32::from_rgba_unmultiplied(200, 50, 200, 150);

        let arc_points: Vec<[f32; 3]> = (0..=arc_segments)
            .map(|i| {
                let t = i as f64 / arc_segments as f64;
                let angle = t * std::f64::consts::PI * 2.0; // Full circle
                let rotated = rotate_point_around_axis_3d(point, axis_origin_3d, axis_normalized, angle);
                [rotated[0] as f32, rotated[1] as f32, rotated[2] as f32]
            })
            .collect();

        for window in arc_points.windows(2) {
            if let (Some(p1), Some(p2)) = (
                camera.project(window[0], rect),
                camera.project(window[1], rect),
            ) {
                painter.line_segment([p1, p2], egui::Stroke::new(1.0, arc_color_indicator));
            }
        }
    }
}

/// Get sample points from a sketch element for preview
fn get_element_points(element: &shared::SketchElement) -> Vec<[f64; 2]> {
    match element {
        shared::SketchElement::Line { start, end } => {
            vec![[start.x, start.y], [end.x, end.y]]
        }
        shared::SketchElement::Circle { center, radius } => {
            let segments = 24;
            (0..=segments)
                .map(|i| {
                    let angle = (i as f64) * std::f64::consts::TAU / (segments as f64);
                    [center.x + radius * angle.cos(), center.y + radius * angle.sin()]
                })
                .collect()
        }
        shared::SketchElement::Arc { center, radius, start_angle, end_angle } => {
            let segments = 16;
            let angle_span = end_angle - start_angle;
            (0..=segments)
                .map(|i| {
                    let t = i as f64 / segments as f64;
                    let angle = start_angle + t * angle_span;
                    [center.x + radius * angle.cos(), center.y + radius * angle.sin()]
                })
                .collect()
        }
        shared::SketchElement::Rectangle { corner, width, height } => {
            vec![
                [corner.x, corner.y],
                [corner.x + width, corner.y],
                [corner.x + width, corner.y + height],
                [corner.x, corner.y + height],
                [corner.x, corner.y], // Close the rectangle
            ]
        }
        shared::SketchElement::Polyline { points } | shared::SketchElement::Spline { points } => {
            points.iter().map(|p| [p.x, p.y]).collect()
        }
        shared::SketchElement::Dimension { .. } => vec![],
    }
}

/// Rotate a 3D point around an axis using Rodrigues' rotation formula
/// axis_origin: a point on the axis
/// axis_dir: normalized direction vector of the axis
/// angle: rotation angle in radians
fn rotate_point_around_axis_3d(
    point: [f64; 3],
    axis_origin: [f64; 3],
    axis_dir: [f64; 3],
    angle: f64,
) -> [f64; 3] {
    // Translate point so axis passes through origin
    let p = [
        point[0] - axis_origin[0],
        point[1] - axis_origin[1],
        point[2] - axis_origin[2],
    ];

    let cos_a = angle.cos();
    let sin_a = angle.sin();

    // Rodrigues' rotation formula: v_rot = v*cos(a) + (k x v)*sin(a) + k*(k.v)*(1 - cos(a))
    // where k is the axis direction (normalized), v is the vector to rotate

    // k x v (cross product)
    let cross = [
        axis_dir[1] * p[2] - axis_dir[2] * p[1],
        axis_dir[2] * p[0] - axis_dir[0] * p[2],
        axis_dir[0] * p[1] - axis_dir[1] * p[0],
    ];

    // k . v (dot product)
    let dot = axis_dir[0] * p[0] + axis_dir[1] * p[1] + axis_dir[2] * p[2];

    // Rotated vector
    let rotated = [
        p[0] * cos_a + cross[0] * sin_a + axis_dir[0] * dot * (1.0 - cos_a),
        p[1] * cos_a + cross[1] * sin_a + axis_dir[1] * dot * (1.0 - cos_a),
        p[2] * cos_a + cross[2] * sin_a + axis_dir[2] * dot * (1.0 - cos_a),
    ];

    // Translate back
    [
        rotated[0] + axis_origin[0],
        rotated[1] + axis_origin[1],
        rotated[2] + axis_origin[2],
    ]
}

/// Calculate distance from a point to a line in 3D
fn distance_point_to_line_3d(
    point: [f64; 3],
    line_origin: [f64; 3],
    line_dir: [f64; 3], // normalized
) -> f64 {
    // Vector from line origin to point
    let v = [
        point[0] - line_origin[0],
        point[1] - line_origin[1],
        point[2] - line_origin[2],
    ];

    // Project v onto line direction
    let dot = v[0] * line_dir[0] + v[1] * line_dir[1] + v[2] * line_dir[2];

    // Closest point on line to the point
    let closest = [
        line_origin[0] + dot * line_dir[0],
        line_origin[1] + dot * line_dir[1],
        line_origin[2] + dot * line_dir[2],
    ];

    // Distance from point to closest point on line
    let dx = point[0] - closest[0];
    let dy = point[1] - closest[1];
    let dz = point[2] - closest[2];
    (dx * dx + dy * dy + dz * dz).sqrt()
}
