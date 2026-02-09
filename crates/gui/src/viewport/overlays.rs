//! Viewport overlay drawing (axis labels, sketch preview, etc.)

use egui::Painter;

use crate::state::sketch::SketchTool;
use crate::state::AppState;

use super::camera::ArcBallCamera;
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
            draw_dimension_preview(pts, preview, to_screen, painter, preview_stroke, preview_color);
        }
        SketchTool::None => {}
        // Modification tools don't need drawing preview
        SketchTool::Trim | SketchTool::Fillet | SketchTool::Offset => {}
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
) where
    F: Fn([f64; 2]) -> Option<egui::Pos2>,
{
    if pts.len() == 1 {
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
                    format!("{:.2}", dist),
                    egui::FontId::proportional(11.0),
                    text_color,
                );
            }
        }
    }
}
