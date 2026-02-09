//! Wireframe rendering for the viewport
//!
//! Simplified for V2 Body-based architecture.

use egui::{Color32, Rect, Stroke, Ui};
use shared::{Feature, Primitive, Transform};

use super::camera::ArcBallCamera;
use crate::state::settings::{AxisSettings, GridSettings};
use crate::state::sketch::SnapType;
use crate::state::AppState;

/// Paint the 3D viewport using egui's painter (wireframe rendering)
pub fn paint_viewport(ui: &Ui, rect: Rect, camera: &ArcBallCamera, state: &AppState) {
    let painter = ui.painter_at(rect);

    // Background
    let bg = &state.settings.viewport.background_color;
    painter.rect_filled(rect, 0.0, Color32::from_rgb(bg[0], bg[1], bg[2]));

    // Draw grid
    if state.settings.grid.visible {
        draw_grid(&painter, rect, camera, &state.settings.grid);
    }

    // Draw axes indicator
    if state.settings.axes.visible {
        draw_axes(&painter, rect, camera, &state.settings.axes);
    }

    // Draw each visible body as wireframe
    let sel_color = &state.settings.viewport.selection_color;
    for body in &state.scene.scene.bodies {
        if !body.visible {
            continue;
        }

        let selected = state.selection.is_selected(&body.id);
        let color = if selected {
            Color32::from_rgb(sel_color[0], sel_color[1], sel_color[2])
        } else {
            Color32::from_rgb(200, 200, 200) // Light gray
        };
        let stroke = Stroke::new(if selected { 2.0 } else { 1.0 }, color);

        // Draw base feature (simplified - just primitives for now)
        if let Some(feature) = body.features.first() {
            draw_feature(&painter, rect, camera, feature, stroke);
        }
    }
}

fn draw_grid(painter: &egui::Painter, rect: Rect, camera: &ArcBallCamera, settings: &GridSettings) {
    let alpha = (settings.opacity * 255.0) as u8;
    let grid_color = Color32::from_rgba_premultiplied(60, 60, 60, alpha);
    let stroke = Stroke::new(0.5, grid_color);

    let range = settings.range;
    let step = settings.size;

    for i in -range..=range {
        let f = i as f32 * step;
        let extent = range as f32 * step;

        // Lines along X
        if let (Some(a), Some(b)) = (
            camera.project([f, 0.0, -extent], rect),
            camera.project([f, 0.0, extent], rect),
        ) {
            if rect.contains(a) || rect.contains(b) {
                painter.line_segment([a, b], stroke);
            }
        }
        // Lines along Z
        if let (Some(a), Some(b)) = (
            camera.project([-extent, 0.0, f], rect),
            camera.project([extent, 0.0, f], rect),
        ) {
            if rect.contains(a) || rect.contains(b) {
                painter.line_segment([a, b], stroke);
            }
        }
    }
}

fn draw_axes(painter: &egui::Painter, rect: Rect, camera: &ArcBallCamera, settings: &AxisSettings) {
    let origin = [0.0_f32, 0.0, 0.0];
    let len = settings.length;
    let thickness = settings.thickness;

    if let Some(o) = camera.project(origin, rect) {
        // X axis — red
        if let Some(x) = camera.project([len, 0.0, 0.0], rect) {
            painter.line_segment([o, x], Stroke::new(thickness, Color32::from_rgb(220, 50, 50)));
            if settings.show_labels {
                painter.text(x, egui::Align2::LEFT_BOTTOM, "X", egui::FontId::monospace(10.0), Color32::from_rgb(220, 50, 50));
            }
        }
        // Y axis — green
        if let Some(y) = camera.project([0.0, len, 0.0], rect) {
            painter.line_segment([o, y], Stroke::new(thickness, Color32::from_rgb(50, 200, 50)));
            if settings.show_labels {
                painter.text(y, egui::Align2::LEFT_BOTTOM, "Y", egui::FontId::monospace(10.0), Color32::from_rgb(50, 200, 50));
            }
        }
        // Z axis — blue
        if let Some(z) = camera.project([0.0, 0.0, len], rect) {
            painter.line_segment([o, z], Stroke::new(thickness, Color32::from_rgb(50, 100, 220)));
            if settings.show_labels {
                painter.text(z, egui::Align2::LEFT_BOTTOM, "Z", egui::FontId::monospace(10.0), Color32::from_rgb(50, 100, 220));
            }
        }
    }
}

fn draw_feature(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    feature: &Feature,
    stroke: Stroke,
) {
    match feature {
        Feature::BasePrimitive { primitive, transform, .. } => {
            draw_primitive(painter, rect, camera, primitive, transform, stroke);
        }
        Feature::BaseExtrude { sketch, sketch_transform, .. } => {
            draw_sketch_elements(painter, rect, camera, sketch, sketch_transform, stroke, &SketchElementDisplayInfo::default());
        }
        Feature::BaseRevolve { sketch, sketch_transform, .. } => {
            draw_sketch_elements(painter, rect, camera, sketch, sketch_transform, stroke, &SketchElementDisplayInfo::default());
        }
        Feature::Sketch { sketch, transform, .. } => {
            draw_sketch_elements(painter, rect, camera, sketch, transform, stroke, &SketchElementDisplayInfo::default());
        }
        _ => {
            // Other features rendered via GL meshes
        }
    }
}

fn draw_primitive(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    prim: &Primitive,
    transform: &Transform,
    stroke: Stroke,
) {
    match prim {
        Primitive::Cube { width, height, depth } => {
            let hw = (*width as f32) * 0.5;
            let hh = (*height as f32) * 0.5;
            let hd = (*depth as f32) * 0.5;

            // 8 corners of a box
            let corners = [
                [-hw, -hh, -hd],
                [ hw, -hh, -hd],
                [ hw,  hh, -hd],
                [-hw,  hh, -hd],
                [-hw, -hh,  hd],
                [ hw, -hh,  hd],
                [ hw,  hh,  hd],
                [-hw,  hh,  hd],
            ];

            let corners: Vec<[f32; 3]> = corners.iter()
                .map(|c| apply_transform(*c, transform))
                .collect();

            // 12 edges
            let edges = [
                (0,1),(1,2),(2,3),(3,0), // front face
                (4,5),(5,6),(6,7),(7,4), // back face
                (0,4),(1,5),(2,6),(3,7), // connecting
            ];

            draw_edges(painter, rect, camera, &corners, &edges, stroke);
        }
        Primitive::Cylinder { radius, height } => {
            let r = *radius as f32;
            let hh = (*height as f32) * 0.5;
            let segments = 16;

            let mut top_ring = Vec::new();
            let mut bot_ring = Vec::new();

            for i in 0..segments {
                let angle = (i as f32) * std::f32::consts::TAU / (segments as f32);
                let x = r * angle.cos();
                let z = r * angle.sin();
                top_ring.push(apply_transform([x, hh, z], transform));
                bot_ring.push(apply_transform([x, -hh, z], transform));
            }

            // Draw rings
            draw_ring(painter, rect, camera, &top_ring, stroke);
            draw_ring(painter, rect, camera, &bot_ring, stroke);

            // Draw vertical lines (every 4th segment)
            for i in (0..segments).step_by(4) {
                draw_line_3d(painter, rect, camera, top_ring[i], bot_ring[i], stroke);
            }
        }
        Primitive::Sphere { radius } => {
            let r = *radius as f32;
            let segments = 16;
            let pos = [
                transform.position[0] as f32,
                transform.position[1] as f32,
                transform.position[2] as f32,
            ];

            // Draw 3 orthogonal circles
            for axis in 0..3 {
                let mut ring = Vec::new();
                for i in 0..segments {
                    let angle = (i as f32) * std::f32::consts::TAU / (segments as f32);
                    let mut p = [0.0_f32; 3];
                    match axis {
                        0 => { p[1] = r * angle.cos(); p[2] = r * angle.sin(); }
                        1 => { p[0] = r * angle.cos(); p[2] = r * angle.sin(); }
                        _ => { p[0] = r * angle.cos(); p[1] = r * angle.sin(); }
                    }
                    p[0] += pos[0];
                    p[1] += pos[1];
                    p[2] += pos[2];
                    ring.push(p);
                }
                draw_ring(painter, rect, camera, &ring, stroke);
            }
        }
        Primitive::Cone { radius, height } => {
            let r = *radius as f32;
            let hh = (*height as f32) * 0.5;
            let segments = 16;

            let apex = apply_transform([0.0, hh, 0.0], transform);
            let mut base_ring = Vec::new();

            for i in 0..segments {
                let angle = (i as f32) * std::f32::consts::TAU / (segments as f32);
                let x = r * angle.cos();
                let z = r * angle.sin();
                base_ring.push(apply_transform([x, -hh, z], transform));
            }

            draw_ring(painter, rect, camera, &base_ring, stroke);

            // Lines from apex to base
            for i in (0..segments).step_by(4) {
                draw_line_3d(painter, rect, camera, apex, base_ring[i], stroke);
            }
        }
    }
}

/// Parameters for sketch element display
#[derive(Default)]
pub struct SketchElementDisplayInfo {
    /// Indices of selected elements
    pub selected: Vec<usize>,
    /// Element under cursor (hover)
    pub hover_element: Option<usize>,
}


pub(crate) fn draw_sketch_elements(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    sketch: &shared::Sketch,
    transform: &Transform,
    stroke: Stroke,
    display_info: &SketchElementDisplayInfo,
) {
    let default_stroke = Stroke::new(stroke.width, Color32::from_rgb(255, 200, 50));
    let selected_stroke = Stroke::new(stroke.width + 1.5, Color32::from_rgb(100, 255, 100));
    let hover_stroke = Stroke::new(stroke.width + 0.5, Color32::from_rgb(150, 220, 255));

    for (idx, elem) in sketch.elements.iter().enumerate() {
        let is_selected = display_info.selected.contains(&idx);
        let is_hover = display_info.hover_element == Some(idx) && !is_selected;

        let elem_stroke = if is_selected {
            selected_stroke
        } else if is_hover {
            hover_stroke
        } else {
            default_stroke
        };

        match elem {
            shared::SketchElement::Line { start, end } => {
                let p1 = sketch_point_to_3d(start.x, start.y, sketch, transform);
                let p2 = sketch_point_to_3d(end.x, end.y, sketch, transform);
                draw_line_3d(painter, rect, camera, p1, p2, elem_stroke);
            }
            shared::SketchElement::Circle { center, radius } => {
                let segments = 24;
                let mut ring = Vec::with_capacity(segments);
                for i in 0..segments {
                    let angle = (i as f64) * std::f64::consts::TAU / (segments as f64);
                    let x = center.x + radius * angle.cos();
                    let y = center.y + radius * angle.sin();
                    ring.push(sketch_point_to_3d(x, y, sketch, transform));
                }
                draw_ring(painter, rect, camera, &ring, elem_stroke);
            }
            shared::SketchElement::Rectangle { corner, width, height } => {
                let x0 = corner.x;
                let y0 = corner.y;
                let x1 = corner.x + width;
                let y1 = corner.y + height;
                let corners = [
                    sketch_point_to_3d(x0, y0, sketch, transform),
                    sketch_point_to_3d(x1, y0, sketch, transform),
                    sketch_point_to_3d(x1, y1, sketch, transform),
                    sketch_point_to_3d(x0, y1, sketch, transform),
                ];
                draw_ring(painter, rect, camera, &corners, elem_stroke);
            }
            shared::SketchElement::Polyline { points } | shared::SketchElement::Spline { points } => {
                let pts: Vec<_> = points.iter()
                    .map(|p| sketch_point_to_3d(p.x, p.y, sketch, transform))
                    .collect();
                for w in pts.windows(2) {
                    draw_line_3d(painter, rect, camera, w[0], w[1], elem_stroke);
                }
            }
            shared::SketchElement::Arc { center, radius, start_angle, end_angle } => {
                let segments = 24;
                let mut angle_span = end_angle - start_angle;
                if angle_span < 0.0 {
                    angle_span += std::f64::consts::TAU;
                }
                let mut arc_points = Vec::with_capacity(segments + 1);
                for i in 0..=segments {
                    let t = i as f64 / segments as f64;
                    let angle = start_angle + angle_span * t;
                    let x = center.x + radius * angle.cos();
                    let y = center.y + radius * angle.sin();
                    arc_points.push(sketch_point_to_3d(x, y, sketch, transform));
                }
                for w in arc_points.windows(2) {
                    draw_line_3d(painter, rect, camera, w[0], w[1], elem_stroke);
                }
            }
            shared::SketchElement::Dimension { from, to, value } => {
                let p1 = sketch_point_to_3d(from.x, from.y, sketch, transform);
                let p2 = sketch_point_to_3d(to.x, to.y, sketch, transform);
                let dim_stroke = if is_selected || is_hover {
                    Stroke::new(stroke.width + 1.0, Color32::from_rgb(150, 255, 180))
                } else {
                    Stroke::new(stroke.width, Color32::from_rgb(150, 200, 255))
                };
                let dim_text_color = if is_selected || is_hover {
                    Color32::from_rgb(150, 255, 180)
                } else {
                    Color32::from_rgb(150, 200, 255)
                };
                draw_line_3d(painter, rect, camera, p1, p2, dim_stroke);
                if let (Some(sp1), Some(sp2)) = (camera.project(p1, rect), camera.project(p2, rect)) {
                    let mid = egui::pos2((sp1.x + sp2.x) * 0.5, (sp1.y + sp2.y) * 0.5 - 10.0);
                    painter.text(
                        mid,
                        egui::Align2::CENTER_BOTTOM,
                        format!("{:.2}", value),
                        egui::FontId::proportional(10.0),
                        dim_text_color,
                    );
                }
            }
        }
    }
}

pub(crate) fn sketch_point_to_3d(x: f64, y: f64, sketch: &shared::Sketch, transform: &Transform) -> [f32; 3] {
    let (px, py, pz) = match sketch.plane {
        shared::SketchPlane::Xy => (x as f32, y as f32, sketch.offset as f32),
        shared::SketchPlane::Xz => (x as f32, sketch.offset as f32, y as f32),
        shared::SketchPlane::Yz => (sketch.offset as f32, x as f32, y as f32),
    };
    apply_transform([px, py, pz], transform)
}

// --- Helpers ---

fn apply_transform(p: [f32; 3], t: &Transform) -> [f32; 3] {
    [
        p[0] * t.scale[0] as f32 + t.position[0] as f32,
        p[1] * t.scale[1] as f32 + t.position[1] as f32,
        p[2] * t.scale[2] as f32 + t.position[2] as f32,
    ]
}

fn draw_line_3d(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    a: [f32; 3],
    b: [f32; 3],
    stroke: Stroke,
) {
    if let (Some(pa), Some(pb)) = (camera.project(a, rect), camera.project(b, rect)) {
        painter.line_segment([pa, pb], stroke);
    }
}

fn draw_edges(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    vertices: &[[f32; 3]],
    edges: &[(usize, usize)],
    stroke: Stroke,
) {
    for &(a, b) in edges {
        draw_line_3d(painter, rect, camera, vertices[a], vertices[b], stroke);
    }
}

fn draw_ring(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    points: &[[f32; 3]],
    stroke: Stroke,
) {
    if points.len() < 2 {
        return;
    }
    for i in 0..points.len() {
        let next = (i + 1) % points.len();
        draw_line_3d(painter, rect, camera, points[i], points[next], stroke);
    }
}

// ============================================================================
// Snap marker
// ============================================================================

/// Draw snap point marker
pub fn draw_snap_marker(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    point_3d: [f32; 3],
    snap_type: SnapType,
) {
    let Some(screen_pos) = camera.project(point_3d, rect) else {
        return;
    };

    let (color, size) = match snap_type {
        SnapType::Endpoint => (Color32::from_rgb(255, 100, 100), 6.0),
        SnapType::Midpoint => (Color32::from_rgb(100, 255, 100), 6.0),
        SnapType::Center => (Color32::from_rgb(100, 150, 255), 6.0),
        SnapType::Quadrant => (Color32::from_rgb(255, 200, 50), 5.0),
        SnapType::Intersection => (Color32::from_rgb(255, 100, 255), 6.0),
        SnapType::Grid => (Color32::from_rgb(150, 150, 150), 4.0),
    };

    let stroke = Stroke::new(2.0, color);

    match snap_type {
        SnapType::Endpoint => {
            let half = size;
            painter.rect_stroke(
                egui::Rect::from_center_size(screen_pos, egui::vec2(half * 2.0, half * 2.0)),
                0.0,
                stroke,
                egui::StrokeKind::Outside,
            );
        }
        SnapType::Midpoint => {
            let half = size;
            let top = egui::pos2(screen_pos.x, screen_pos.y - half);
            let left = egui::pos2(screen_pos.x - half, screen_pos.y + half);
            let right = egui::pos2(screen_pos.x + half, screen_pos.y + half);
            painter.line_segment([top, left], stroke);
            painter.line_segment([left, right], stroke);
            painter.line_segment([right, top], stroke);
        }
        SnapType::Center => {
            painter.circle_stroke(screen_pos, size, stroke);
            let half = size * 0.7;
            painter.line_segment(
                [
                    egui::pos2(screen_pos.x - half, screen_pos.y),
                    egui::pos2(screen_pos.x + half, screen_pos.y),
                ],
                stroke,
            );
            painter.line_segment(
                [
                    egui::pos2(screen_pos.x, screen_pos.y - half),
                    egui::pos2(screen_pos.x, screen_pos.y + half),
                ],
                stroke,
            );
        }
        SnapType::Quadrant => {
            let half = size;
            let top = egui::pos2(screen_pos.x, screen_pos.y - half);
            let right = egui::pos2(screen_pos.x + half, screen_pos.y);
            let bottom = egui::pos2(screen_pos.x, screen_pos.y + half);
            let left = egui::pos2(screen_pos.x - half, screen_pos.y);
            painter.line_segment([top, right], stroke);
            painter.line_segment([right, bottom], stroke);
            painter.line_segment([bottom, left], stroke);
            painter.line_segment([left, top], stroke);
        }
        SnapType::Intersection => {
            let half = size;
            painter.line_segment(
                [
                    egui::pos2(screen_pos.x - half, screen_pos.y - half),
                    egui::pos2(screen_pos.x + half, screen_pos.y + half),
                ],
                stroke,
            );
            painter.line_segment(
                [
                    egui::pos2(screen_pos.x + half, screen_pos.y - half),
                    egui::pos2(screen_pos.x - half, screen_pos.y + half),
                ],
                stroke,
            );
        }
        SnapType::Grid => {
            let half = size;
            painter.line_segment(
                [
                    egui::pos2(screen_pos.x - half, screen_pos.y),
                    egui::pos2(screen_pos.x + half, screen_pos.y),
                ],
                stroke,
            );
            painter.line_segment(
                [
                    egui::pos2(screen_pos.x, screen_pos.y - half),
                    egui::pos2(screen_pos.x, screen_pos.y + half),
                ],
                stroke,
            );
        }
    }
}

// ============================================================================
// Control points for selected elements
