//! Wireframe rendering for the viewport
//!
//! Simplified for V2 Body-based architecture.

use egui::{Color32, Rect, Stroke, Ui};
use shared::{Feature, Primitive, Transform};

use super::camera::ArcBallCamera;
use crate::state::settings::{AxisSettings, DimensionSettings, GridSettings};
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
    /// Selected points (element_index, point_index)
    pub selected_points: Vec<(usize, usize)>,
    /// Element under cursor (hover)
    pub hover_element: Option<usize>,
    /// Point under cursor (element_index, point_index)
    pub hover_point: Option<(usize, usize)>,
    /// Construction flags (parallel to sketch.elements)
    pub construction: Vec<bool>,
    /// Index of element designated as revolve axis (only one per sketch)
    pub revolve_axis: Option<usize>,
    /// Dimension display settings (font size, precision, show units)
    pub dimension_settings: Option<DimensionSettings>,
    /// Unit abbreviation for dimension display (e.g. "mm", "in")
    pub unit_abbrev: Option<&'static str>,
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
    // Construction geometry - brown/orange dashed style
    let construction_stroke = Stroke::new(stroke.width * 0.7, Color32::from_rgb(180, 120, 60));
    let construction_selected_stroke = Stroke::new(stroke.width + 0.5, Color32::from_rgb(100, 200, 100));
    // Revolve axis - magenta/purple color to stand out
    let revolve_axis_stroke = Stroke::new(stroke.width + 1.0, Color32::from_rgb(200, 50, 200));
    let revolve_axis_selected_stroke = Stroke::new(stroke.width + 2.0, Color32::from_rgb(255, 100, 255));

    for (idx, elem) in sketch.elements.iter().enumerate() {
        let is_selected = display_info.selected.contains(&idx);
        let is_hover = display_info.hover_element == Some(idx) && !is_selected;
        let is_construction = display_info.construction.get(idx).copied().unwrap_or(false)
            || sketch.is_construction(idx);
        let is_revolve_axis = display_info.revolve_axis == Some(idx);

        let elem_stroke = if is_revolve_axis {
            // Revolve axis has highest priority for coloring
            if is_selected {
                revolve_axis_selected_stroke
            } else {
                revolve_axis_stroke
            }
        } else if is_construction {
            if is_selected {
                construction_selected_stroke
            } else {
                construction_stroke
            }
        } else if is_selected {
            selected_stroke
        } else if is_hover {
            hover_stroke
        } else {
            default_stroke
        };

        let draw_dashed = is_construction;

        match elem {
            shared::SketchElement::Line { start, end } => {
                let p1 = sketch_point_to_3d(start.x, start.y, sketch, transform);
                let p2 = sketch_point_to_3d(end.x, end.y, sketch, transform);
                if draw_dashed {
                    draw_dashed_line_3d(painter, rect, camera, p1, p2, elem_stroke, 8.0);
                } else {
                    draw_line_3d(painter, rect, camera, p1, p2, elem_stroke);
                }
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
                if draw_dashed {
                    draw_dashed_ring(painter, rect, camera, &ring, elem_stroke, 8.0);
                } else {
                    draw_ring(painter, rect, camera, &ring, elem_stroke);
                }
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
                if draw_dashed {
                    draw_dashed_ring(painter, rect, camera, &corners, elem_stroke, 8.0);
                } else {
                    draw_ring(painter, rect, camera, &corners, elem_stroke);
                }
            }
            shared::SketchElement::Polyline { points } | shared::SketchElement::Spline { points } => {
                let pts: Vec<_> = points.iter()
                    .map(|p| sketch_point_to_3d(p.x, p.y, sketch, transform))
                    .collect();
                for w in pts.windows(2) {
                    if draw_dashed {
                        draw_dashed_line_3d(painter, rect, camera, w[0], w[1], elem_stroke, 8.0);
                    } else {
                        draw_line_3d(painter, rect, camera, w[0], w[1], elem_stroke);
                    }
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
                    if draw_dashed {
                        draw_dashed_line_3d(painter, rect, camera, w[0], w[1], elem_stroke, 8.0);
                    } else {
                        draw_line_3d(painter, rect, camera, w[0], w[1], elem_stroke);
                    }
                }
            }
            shared::SketchElement::Dimension { from, to, value, dimension_line_pos, .. } => {
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

                // Базовые точки
                let p_from_2d = [from.x, from.y];
                let p_to_2d = [to.x, to.y];

                // Вычислить позицию размерной линии
                let (dim_line_start_2d, dim_line_end_2d) = if let Some(pos) = dimension_line_pos {
                    // Проецируем from и to на линию, проходящую через pos параллельно базовой линии
                    let dx = p_to_2d[0] - p_from_2d[0];
                    let dy = p_to_2d[1] - p_from_2d[1];
                    let len = (dx * dx + dy * dy).sqrt();
                    if len < 1e-10 {
                        (p_from_2d, p_to_2d)
                    } else {
                        let dir = [dx / len, dy / len];
                        // Вектор от from к pos
                        let to_pos = [pos.x - p_from_2d[0], pos.y - p_from_2d[1]];
                        // Проекция на направление
                        let proj = to_pos[0] * dir[0] + to_pos[1] * dir[1];
                        // Перпендикулярное смещение
                        let perp = [to_pos[0] - proj * dir[0], to_pos[1] - proj * dir[1]];

                        // Размерная линия идёт параллельно базовой, смещённая на perp
                        ([p_from_2d[0] + perp[0], p_from_2d[1] + perp[1]],
                         [p_to_2d[0] + perp[0], p_to_2d[1] + perp[1]])
                    }
                } else {
                    // Автоматическое смещение перпендикулярно на 0.5 единиц
                    let dx = p_to_2d[0] - p_from_2d[0];
                    let dy = p_to_2d[1] - p_from_2d[1];
                    let len = (dx * dx + dy * dy).sqrt();
                    if len < 1e-10 {
                        (p_from_2d, p_to_2d)
                    } else {
                        let perp = [-dy / len * 0.5, dx / len * 0.5];
                        ([p_from_2d[0] + perp[0], p_from_2d[1] + perp[1]],
                         [p_to_2d[0] + perp[0], p_to_2d[1] + perp[1]])
                    }
                };

                // Преобразовать в 3D
                let p_from_3d = sketch_point_to_3d(p_from_2d[0], p_from_2d[1], sketch, transform);
                let p_to_3d = sketch_point_to_3d(p_to_2d[0], p_to_2d[1], sketch, transform);
                let dim_start_3d = sketch_point_to_3d(dim_line_start_2d[0], dim_line_start_2d[1], sketch, transform);
                let dim_end_3d = sketch_point_to_3d(dim_line_end_2d[0], dim_line_end_2d[1], sketch, transform);

                // Нарисовать выносные линии (extension lines)
                let extension_stroke = Stroke::new(stroke.width * 0.5, dim_stroke.color);
                draw_line_3d(painter, rect, camera, p_from_3d, dim_start_3d, extension_stroke);
                draw_line_3d(painter, rect, camera, p_to_3d, dim_end_3d, extension_stroke);

                // Нарисовать размерную линию
                draw_line_3d(painter, rect, camera, dim_start_3d, dim_end_3d, dim_stroke);

                // Нарисовать стрелки и текст в 2D пространстве экрана
                if let (Some(sp_start), Some(sp_end)) = (camera.project(dim_start_3d, rect), camera.project(dim_end_3d, rect)) {
                    // Вектор вдоль размерной линии
                    let dx = sp_end.x - sp_start.x;
                    let dy = sp_end.y - sp_start.y;
                    let len = (dx * dx + dy * dy).sqrt();

                    if len > 1.0 {
                        let dir_x = dx / len;
                        let dir_y = dy / len;
                        let arrow_len = 8.0;
                        let arrow_angle = 0.4; // радианы

                        // Стрелка в начале (указывает внутрь)
                        let angle1 = dir_y.atan2(dir_x);
                        let arrow1_p1 = egui::pos2(
                            sp_start.x + arrow_len * (angle1 - arrow_angle).cos(),
                            sp_start.y + arrow_len * (angle1 - arrow_angle).sin(),
                        );
                        let arrow1_p2 = egui::pos2(
                            sp_start.x + arrow_len * (angle1 + arrow_angle).cos(),
                            sp_start.y + arrow_len * (angle1 + arrow_angle).sin(),
                        );
                        painter.line_segment([sp_start, arrow1_p1], dim_stroke);
                        painter.line_segment([sp_start, arrow1_p2], dim_stroke);

                        // Стрелка в конце (указывает внутрь)
                        let angle2 = angle1 + std::f32::consts::PI;
                        let arrow2_p1 = egui::pos2(
                            sp_end.x + arrow_len * (angle2 - arrow_angle).cos(),
                            sp_end.y + arrow_len * (angle2 - arrow_angle).sin(),
                        );
                        let arrow2_p2 = egui::pos2(
                            sp_end.x + arrow_len * (angle2 + arrow_angle).cos(),
                            sp_end.y + arrow_len * (angle2 + arrow_angle).sin(),
                        );
                        painter.line_segment([sp_end, arrow2_p1], dim_stroke);
                        painter.line_segment([sp_end, arrow2_p2], dim_stroke);
                    }

                    // Текст посередине размерной линии
                    let mid = egui::pos2((sp_start.x + sp_end.x) * 0.5, (sp_start.y + sp_end.y) * 0.5 - 10.0);

                    // Apply dimension settings if provided
                    let (font_size, precision, show_units) = if let Some(ref dim_settings) = display_info.dimension_settings {
                        (dim_settings.font_size, dim_settings.precision, dim_settings.show_units)
                    } else {
                        (14.0, 2, false)
                    };

                    let text = if show_units {
                        let unit = display_info.unit_abbrev.unwrap_or("");
                        format!("{:.prec$} {}", value, unit, prec = precision)
                    } else {
                        format!("{:.prec$}", value, prec = precision)
                    };

                    painter.text(
                        mid,
                        egui::Align2::CENTER_BOTTOM,
                        text,
                        egui::FontId::proportional(font_size),
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

/// Draw a dashed line in 3D space
fn draw_dashed_line_3d(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    a: [f32; 3],
    b: [f32; 3],
    stroke: Stroke,
    dash_length: f32,
) {
    if let (Some(pa), Some(pb)) = (camera.project(a, rect), camera.project(b, rect)) {
        draw_dashed_line_2d(painter, pa, pb, stroke, dash_length);
    }
}

/// Draw a dashed line in 2D screen space
fn draw_dashed_line_2d(
    painter: &egui::Painter,
    start: egui::Pos2,
    end: egui::Pos2,
    stroke: Stroke,
    dash_length: f32,
) {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let length = (dx * dx + dy * dy).sqrt();

    if length < 0.1 {
        return;
    }

    let dir_x = dx / length;
    let dir_y = dy / length;

    let gap_length = dash_length * 0.6;

    let mut pos = 0.0;
    let mut drawing = true;

    while pos < length {
        if drawing {
            let segment_end = (pos + dash_length).min(length);
            let p1 = egui::pos2(start.x + dir_x * pos, start.y + dir_y * pos);
            let p2 = egui::pos2(start.x + dir_x * segment_end, start.y + dir_y * segment_end);
            painter.line_segment([p1, p2], stroke);
            pos = segment_end;
        } else {
            pos += gap_length;
        }
        drawing = !drawing;
    }
}

/// Draw a dashed ring (closed polygon)
fn draw_dashed_ring(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    points: &[[f32; 3]],
    stroke: Stroke,
    dash_length: f32,
) {
    if points.len() < 2 {
        return;
    }
    for i in 0..points.len() {
        let next = (i + 1) % points.len();
        draw_dashed_line_3d(painter, rect, camera, points[i], points[next], stroke, dash_length);
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
// ============================================================================

/// Draw control points (handles) for selected elements
pub fn draw_control_points(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    sketch: &shared::Sketch,
    transform: &Transform,
    display_info: &SketchElementDisplayInfo,
) {
    use super::sketch_interact::get_element_control_points;

    let normal_color = Color32::from_rgb(100, 200, 255);
    let hover_color = Color32::from_rgb(255, 180, 50);
    let selected_color = Color32::from_rgb(50, 255, 100); // Green for selected points
    let marker_size = 5.0;

    // Collect elements to show control points for
    let mut elements_to_show: Vec<usize> = display_info.selected.clone();
    if let Some(hover_idx) = display_info.hover_element {
        if !elements_to_show.contains(&hover_idx) {
            elements_to_show.push(hover_idx);
        }
    }
    // Also show control points for elements that have selected points
    for (elem_idx, _) in &display_info.selected_points {
        if !elements_to_show.contains(elem_idx) {
            elements_to_show.push(*elem_idx);
        }
    }

    for elem_idx in elements_to_show {
        if let Some(elem) = sketch.elements.get(elem_idx) {
            let control_points = get_element_control_points(elem);

            for (point_idx, pos) in control_points {
                let point_3d = sketch_point_to_3d(pos[0], pos[1], sketch, transform);

                if let Some(screen_pos) = camera.project(point_3d, rect) {
                    // Check if this point is selected
                    let is_selected = display_info.selected_points.contains(&(elem_idx, point_idx));
                    // Check if this is the hovered point
                    let is_hover = display_info.hover_point == Some((elem_idx, point_idx));

                    let color = if is_selected {
                        selected_color
                    } else if is_hover {
                        hover_color
                    } else {
                        normal_color
                    };

                    // Check if this is a dimension line position control point
                    let is_dim_line_pos = matches!(elem, shared::SketchElement::Dimension { .. }) && point_idx == 2;

                    if is_dim_line_pos {
                        // Draw circle for dimension line position (special marker)
                        if is_selected {
                            painter.circle_filled(screen_pos, marker_size + 1.0, color);
                            painter.circle_stroke(screen_pos, marker_size + 1.0, Stroke::new(2.0, Color32::WHITE));
                        } else if is_hover {
                            painter.circle_filled(screen_pos, marker_size, color);
                            painter.circle_stroke(screen_pos, marker_size, Stroke::new(1.5, Color32::WHITE));
                        } else {
                            painter.circle_stroke(screen_pos, marker_size - 1.0, Stroke::new(1.5, color));
                        }
                    } else {
                        // Draw filled square marker for regular control points
                        let half = marker_size;
                        let marker_rect = egui::Rect::from_center_size(
                            screen_pos,
                            egui::vec2(half * 2.0, half * 2.0),
                        );

                        if is_selected {
                            // Larger, filled marker for selected points
                            painter.rect_filled(marker_rect, 1.0, color);
                            painter.rect_stroke(
                                marker_rect,
                                1.0,
                                Stroke::new(2.0, Color32::WHITE),
                            egui::StrokeKind::Outside,
                        );
                    } else if is_hover {
                        // Larger, filled marker for hover
                        painter.rect_filled(marker_rect, 1.0, color);
                        painter.rect_stroke(
                            marker_rect,
                            1.0,
                            Stroke::new(1.5, Color32::WHITE),
                            egui::StrokeKind::Outside,
                        );
                    } else {
                        // Smaller, outlined marker for normal state
                        let small_rect = egui::Rect::from_center_size(
                            screen_pos,
                            egui::vec2(half * 1.5, half * 1.5),
                        );
                        painter.rect_filled(small_rect, 1.0, Color32::from_rgba_unmultiplied(100, 200, 255, 180));
                        painter.rect_stroke(
                            small_rect,
                            1.0,
                            Stroke::new(1.0, color),
                            egui::StrokeKind::Outside,
                        );
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// Constraint icons for hovered elements
// ============================================================================

/// Draw constraint icons near a hovered element
pub fn draw_constraint_icons(
    painter: &egui::Painter,
    rect: Rect,
    camera: &ArcBallCamera,
    sketch: &shared::Sketch,
    transform: &Transform,
    element_idx: usize,
) {
    use crate::sketch::constraints::get_element_constraint_icons;

    let icons = get_element_constraint_icons(sketch, element_idx);
    if icons.is_empty() {
        return;
    }

    // Get element center point for icon placement
    let center = get_element_center(sketch, element_idx);
    if center.is_none() {
        return;
    }
    let center = center.unwrap();

    let point_3d = sketch_point_to_3d(center[0], center[1], sketch, transform);

    if let Some(screen_pos) = camera.project(point_3d, rect) {
        // Draw constraint icons as a horizontal row above the element
        let icon_text = icons.join(" ");
        let offset_y = -25.0; // Above the element

        // Background rectangle
        let text_pos = egui::pos2(screen_pos.x, screen_pos.y + offset_y);
        let galley = painter.layout_no_wrap(
            icon_text.clone(),
            egui::FontId::proportional(14.0),
            Color32::WHITE,
        );
        let text_rect = galley.rect.translate(text_pos.to_vec2());
        let bg_rect = text_rect.expand(4.0);

        painter.rect_filled(
            bg_rect,
            4.0,
            Color32::from_rgba_unmultiplied(40, 40, 40, 220),
        );
        painter.rect_stroke(
            bg_rect,
            4.0,
            Stroke::new(1.0, Color32::from_rgb(100, 100, 100)),
            egui::StrokeKind::Outside,
        );

        // Draw icons text
        painter.galley(text_pos, galley, Color32::WHITE);
    }
}

/// Get the center point of a sketch element
fn get_element_center(sketch: &shared::Sketch, element_idx: usize) -> Option<[f64; 2]> {
    let elem = sketch.elements.get(element_idx)?;

    match elem {
        shared::SketchElement::Line { start, end } => {
            Some([(start.x + end.x) / 2.0, (start.y + end.y) / 2.0])
        }
        shared::SketchElement::Circle { center, .. } => Some([center.x, center.y]),
        shared::SketchElement::Arc { center, .. } => Some([center.x, center.y]),
        shared::SketchElement::Rectangle { corner, width, height } => {
            Some([corner.x + width / 2.0, corner.y + height / 2.0])
        }
        shared::SketchElement::Polyline { points } => {
            if points.is_empty() {
                return None;
            }
            let sum_x: f64 = points.iter().map(|p| p.x).sum();
            let sum_y: f64 = points.iter().map(|p| p.y).sum();
            let n = points.len() as f64;
            Some([sum_x / n, sum_y / n])
        }
        shared::SketchElement::Spline { points } => {
            if points.is_empty() {
                return None;
            }
            let sum_x: f64 = points.iter().map(|p| p.x).sum();
            let sum_y: f64 = points.iter().map(|p| p.y).sum();
            let n = points.len() as f64;
            Some([sum_x / n, sum_y / n])
        }
        shared::SketchElement::Dimension { from, to, .. } => {
            Some([(from.x + to.x) / 2.0, (from.y + to.y) / 2.0])
        }
    }
}
