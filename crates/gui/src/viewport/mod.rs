//! 3D viewport panel with OpenGL rendering

mod camera;
mod context_menu;
pub mod edge;
mod gizmo;
mod gl_renderer;
pub use vcad_gui_lib::viewport::{mesh, picking};
mod overlays;
mod renderer;
mod sketch_interact;
pub mod sketch_utils;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use egui::Ui;

use crate::build::CsgCache;
use crate::i18n::t;
use crate::state::selection::FaceSelection;
use crate::state::AppState;
use camera::ArcBallCamera;
use gizmo::{build_gizmo_lines, compute_drag_delta, gizmo_hit_test, GizmoState};
use gl_renderer::GlRenderer;
use mesh::{LineMeshData, MeshData};
use picking::{group_coplanar_triangles, calculate_face_area, pick_nearest, pick_triangle};

const GIZMO_LENGTH: f32 = 2.0;

/// 3D viewport panel with OpenGL rendering
pub struct ViewportPanel {
    camera: ArcBallCamera,
    gl_renderer: Option<Arc<Mutex<GlRenderer>>>,
    csg_cache: CsgCache,
    gizmo_state: GizmoState,
    /// Object ID picked by right-click (for context menu)
    context_target: Option<String>,
    /// Show sketch element context menu
    sketch_element_context_menu: bool,
    /// Show sketch tools context menu (when no element selected)
    sketch_tools_context_menu: bool,
    /// ViewCube state for click detection
    view_cube_state: Option<overlays::ViewCubeState>,
}

impl ViewportPanel {
    pub fn new() -> Self {
        Self {
            camera: ArcBallCamera::new(),
            gl_renderer: None,
            csg_cache: CsgCache::new(),
            gizmo_state: GizmoState::default(),
            context_target: None,
            sketch_element_context_menu: false,
            sketch_tools_context_menu: false,
            view_cube_state: None,
        }
    }

    /// Initialize GL renderer (must be called with a GL context)
    pub fn init_gl(&mut self, gl: &glow::Context) {
        let renderer = GlRenderer::new(gl);
        self.gl_renderer = Some(Arc::new(Mutex::new(renderer)));
    }

    pub fn reset_camera(&mut self) {
        self.camera = ArcBallCamera::new();
    }

    /// Focus camera on a specific point
    pub fn focus_on(&mut self, target: glam::Vec3) {
        self.camera.target = target;
    }

    /// Get the AABB center of a cached object (if available)
    pub fn aabb_center(&self, id: &str) -> Option<glam::Vec3> {
        self.csg_cache.aabbs().get(id).map(|aabb| aabb.center())
    }

    /// Get a clone of all cached meshes for export
    pub fn export_meshes(&self) -> HashMap<String, MeshData> {
        self.csg_cache.meshes_clone()
    }

    pub fn show(&mut self, ui: &mut Ui, state: &mut AppState) {
        let (rect, response) = ui.allocate_exact_size(
            ui.available_size(),
            egui::Sense::click_and_drag(),
        );

        // ── ViewCube click handling ─────────────────────────────
        let view_cube_consumed = self.handle_view_cube_interaction(&response);

        // ── Sketch interaction handling ─────────────────────────────
        let sketch_consumed = if view_cube_consumed {
            false
        } else {
            self.handle_sketch_interaction(ui, &response, rect, state)
        };
        let mod_tool_consumed = self.handle_modification_tools(&response, rect, state);

        // ── Gizmo and camera controls ─────────────────────────────
        self.handle_gizmo_and_camera(&response, ui, rect, state, sketch_consumed, mod_tool_consumed);

        // ── Scroll zoom ─────────────────────────────
        let scroll = ui.input(|i| i.smooth_scroll_delta.y);
        if scroll.abs() > 0.1 {
            self.camera.zoom(scroll * 0.01);
        }

        // ── Build CSG meshes BEFORE selection (so picking uses fresh normals) ────
        self.rebuild_csg_if_needed(state);

        // ── Object/Face selection via click ──────────────────────────
        self.handle_selection(&response, ui, rect, state, sketch_consumed, mod_tool_consumed);

        // ── Edge hover for fillet mode ──────────────────────────
        if state.fillet3d.is_active() && !sketch_consumed && !mod_tool_consumed {
            self.handle_fillet_hover(&response, rect, state);
        }

        // ── Right-click context menu on object ──────────────────
        self.handle_right_click(&response, rect, sketch_consumed, mod_tool_consumed);

        // ── Context menu ──────────────────────────────────
        let ctx_actions = self.show_context_menu(&response, state);
        self.apply_context_actions(ctx_actions, state);

        // ── Sketch element context menu ──────────────────
        self.show_sketch_element_context_menu(ui, &response, state);

        // ── Sketch tools context menu (empty space) ──────
        self.show_sketch_tools_context_menu(ui, &response, state);

        if !ui.is_rect_visible(rect) {
            return;
        }

        // ── Build gizmo lines ───────────────────────────────────
        let gizmo_lines = self.build_gizmo_lines(state);

        // ── GL rendering ────────────────────────────────────────
        self.render_gl(ui, rect, state, gizmo_lines);

        // ── Overlays ─────────────────────────────────────
        self.draw_overlays(ui, rect, state);
    }

    fn handle_sketch_interaction(
        &mut self,
        ui: &mut Ui,
        response: &egui::Response,
        rect: egui::Rect,
        state: &mut AppState,
    ) -> bool {
        let mut sketch_consumed = false;

        if !state.sketch.is_editing() {
            return sketch_consumed;
        }

        // Get sketch data for coordinate conversion
        let body_id = state.sketch.editing_body_id().cloned();
        let feature_id = state.sketch.active_feature_id().cloned();

        if let Some(ref bid) = body_id {
            let sketch_data = sketch_utils::find_sketch_data_ex(
                &state.scene.scene,
                bid,
                feature_id.as_deref(),
            );
            if let Some((sketch, sketch_transform)) = sketch_data {
                let sketch = sketch.clone();
                // Combine body transform with sketch transform
                let body_transform = state
                    .scene
                    .scene
                    .bodies
                    .iter()
                    .find(|b| b.id == *bid)
                    .map(|b| crate::helpers::get_body_base_transform(b))
                    .unwrap_or_else(shared::Transform::new);
                let transform = crate::helpers::combine_transforms(&body_transform, sketch_transform);

                // Update preview point on mouse move
                if let Some(pos) = response.hover_pos() {
                    let ray = self.camera.screen_ray(pos, rect);
                    if let Some(point_2d) = sketch_interact::ray_sketch_plane(&ray, &sketch, &transform)
                    {
                        // Handle dragging control points
                        if state.sketch.element_selection.dragging.is_some() {
                            // Apply snap while dragging
                            let drag_pos = if let Some(snap) =
                                sketch_interact::find_snap_point(point_2d, &sketch, &state.sketch.snap)
                            {
                                state.sketch.active_snap = Some(snap.clone());
                                snap.point
                            } else {
                                state.sketch.active_snap = None;
                                point_2d
                            };

                            // Update element point position
                            if let Some(ref handle) = state.sketch.element_selection.dragging {
                                if let Some(pt_idx) = handle.point_index {
                                    state.scene.update_sketch_element_point_ex(
                                        &bid,
                                        feature_id.as_deref(),
                                        handle.element_index,
                                        pt_idx,
                                        drag_pos,
                                    );
                                    // Apply constraints after position update
                                    state.scene.solve_sketch_constraints(
                                        &bid,
                                        feature_id.as_deref(),
                                    );
                                }
                            }
                            state.sketch.preview_point = Some(drag_pos);
                            sketch_consumed = true;
                        } else {
                            // Check for snap
                            if let Some(snap) =
                                sketch_interact::find_snap_point(point_2d, &sketch, &state.sketch.snap)
                            {
                                state.sketch.preview_point = Some(snap.point);
                                state.sketch.active_snap = Some(snap);
                            } else {
                                state.sketch.preview_point = Some(point_2d);
                                state.sketch.active_snap = None;
                            }

                            // Check for hover on control points first (higher priority)
                            let point_tolerance = 0.12; // Tolerance for control points
                            // Only check control points on selected/hovered elements
                            let mut check_elements = state.sketch.element_selection.selected.clone();
                            if let Some(hover_idx) = state.sketch.element_selection.hover_element {
                                if !check_elements.contains(&hover_idx) {
                                    check_elements.push(hover_idx);
                                }
                            }

                            if !check_elements.is_empty() {
                                if let Some(point_hit) = sketch_interact::hit_test_element_points_filtered(
                                    point_2d,
                                    &sketch,
                                    &check_elements,
                                    point_tolerance,
                                ) {
                                    state.sketch.element_selection.hover_point =
                                        Some((point_hit.element_index, point_hit.point_index));
                                } else {
                                    state.sketch.element_selection.hover_point = None;
                                }
                            } else {
                                state.sketch.element_selection.hover_point = None;
                            }

                            // Update hover element for selection highlighting
                            let hit_tolerance = 0.15; // Tolerance in sketch units
                            if let Some(hit) = sketch_interact::hit_test_elements(point_2d, &sketch, hit_tolerance) {
                                state.sketch.element_selection.hover_element = Some(hit.element_index);
                            } else {
                                state.sketch.element_selection.hover_element = None;
                            }
                        }
                    }
                }

                // Handle drag release
                if response.drag_stopped() && state.sketch.element_selection.dragging.is_some() {
                    state.sketch.element_selection.end_drag();
                    sketch_consumed = true;
                }

                // Handle left click - add point (only for drawing tools, not modification tools)
                let is_drawing_tool = !matches!(
                    state.sketch.tool,
                    crate::state::sketch::SketchTool::None
                    | crate::state::sketch::SketchTool::Trim
                    | crate::state::sketch::SketchTool::Fillet
                    | crate::state::sketch::SketchTool::Offset
                );

                // Handle drag start on control point when tool is None
                if response.drag_started_by(egui::PointerButton::Primary)
                    && state.sketch.tool == crate::state::sketch::SketchTool::None
                    && !ui.input(|i| i.modifiers.alt)
                {
                    if let Some(pos) = response.interact_pointer_pos() {
                        let ray = self.camera.screen_ray(pos, rect);
                        if let Some(point_2d) = sketch_interact::ray_sketch_plane(&ray, &sketch, &transform) {
                            // Check for control point hit first
                            let point_tolerance = 0.12;
                            let mut check_elements = state.sketch.element_selection.selected.clone();
                            if let Some(hover_idx) = state.sketch.element_selection.hover_element {
                                if !check_elements.contains(&hover_idx) {
                                    check_elements.push(hover_idx);
                                }
                            }

                            if !check_elements.is_empty() {
                                if let Some(point_hit) = sketch_interact::hit_test_element_points_filtered(
                                    point_2d,
                                    &sketch,
                                    &check_elements,
                                    point_tolerance,
                                ) {
                                    // Check if element is fixed - don't allow dragging
                                    let is_fixed = crate::sketch::constraints::is_element_fixed(
                                        &sketch,
                                        point_hit.element_index,
                                    );
                                    if !is_fixed {
                                        // Start dragging control point
                                        state.scene.begin_sketch_drag();
                                        let handle = crate::state::sketch::ElementHandle {
                                            element_index: point_hit.element_index,
                                            point_index: Some(point_hit.point_index),
                                        };
                                        state.sketch.element_selection.start_drag(handle, point_hit.position);
                                        sketch_consumed = true;
                                    }
                                }
                            }
                        }
                    }
                }

                // Handle element/point selection when tool is None (only if not starting a drag)
                if response.clicked()
                    && state.sketch.tool == crate::state::sketch::SketchTool::None
                    && state.sketch.element_selection.dragging.is_none()
                {
                    if let Some(pos) = response.interact_pointer_pos() {
                        let ray = self.camera.screen_ray(pos, rect);
                        if let Some(point_2d) = sketch_interact::ray_sketch_plane(&ray, &sketch, &transform) {
                            let point_tolerance = 0.12;
                            let hit_tolerance = 0.15;
                            let ctrl_pressed = ui.input(|i| i.modifiers.command);
                            let shift_pressed = ui.input(|i| i.modifiers.shift);

                            // First check for point hit (Shift+click for point selection)
                            if shift_pressed {
                                if let Some(point_hit) = sketch_interact::hit_test_element_points(
                                    point_2d,
                                    &sketch,
                                    point_tolerance,
                                ) {
                                    if ctrl_pressed {
                                        state.sketch.element_selection.toggle_point(
                                            point_hit.element_index,
                                            point_hit.point_index,
                                        );
                                    } else {
                                        state.sketch.element_selection.select_point(
                                            point_hit.element_index,
                                            point_hit.point_index,
                                        );
                                    }
                                    sketch_consumed = true;
                                }
                            } else if let Some(hit) = sketch_interact::hit_test_elements(point_2d, &sketch, hit_tolerance) {
                                // Check for Ctrl modifier to toggle selection
                                if ctrl_pressed {
                                    state.sketch.element_selection.toggle(hit.element_index);
                                } else {
                                    state.sketch.element_selection.select(hit.element_index);
                                }
                                sketch_consumed = true;
                            } else {
                                // Click on empty space - clear selection
                                if !ctrl_pressed {
                                    state.sketch.element_selection.clear();
                                }
                            }
                        }
                    }
                }

                if response.clicked() && is_drawing_tool {
                    if let Some(pos) = response.interact_pointer_pos() {
                        let ray = self.camera.screen_ray(pos, rect);
                        if let Some(mut point_2d) =
                            sketch_interact::ray_sketch_plane(&ray, &sketch, &transform)
                        {
                            // Apply snap if active
                            if let Some(ref snap) = state.sketch.active_snap {
                                point_2d = snap.point;
                            }

                            // Handle Dimension tool for circles
                            if state.sketch.tool == crate::state::sketch::SketchTool::Dimension
                                && state.sketch.drawing_points.is_empty()
                            {
                                // First click - check if clicking on circle center or circle itself
                                if let Some(ref snap) = state.sketch.active_snap {
                                    if let Some(source_idx) = snap.source_element {
                                        if let Some(elem) = sketch.elements.get(source_idx) {
                                            if let shared::SketchElement::Circle { center, radius } = elem {
                                                match snap.snap_type {
                                                    crate::state::sketch::SnapType::Center => {
                                                        // Clicked on center - create radius dimension
                                                        state.sketch.dimension_circle_info = Some(
                                                            crate::state::sketch::DimensionCircleInfo {
                                                                circle_index: source_idx,
                                                                dimension_type: shared::DimensionType::Radius,
                                                                center: [center.x, center.y],
                                                                radius: *radius,
                                                            }
                                                        );
                                                        // Add first point (will be used as dimension_line_pos)
                                                        state.sketch.add_point(point_2d);
                                                        sketch_consumed = true;
                                                        // Don't try to finalize yet, need one more click for dimension_line_pos
                                                    }
                                                    crate::state::sketch::SnapType::Quadrant => {
                                                        // Clicked on circle quadrant - create diameter dimension
                                                        state.sketch.dimension_circle_info = Some(
                                                            crate::state::sketch::DimensionCircleInfo {
                                                                circle_index: source_idx,
                                                                dimension_type: shared::DimensionType::Diameter,
                                                                center: [center.x, center.y],
                                                                radius: *radius,
                                                            }
                                                        );
                                                        // Add first point (will be used as dimension_line_pos)
                                                        state.sketch.add_point(point_2d);
                                                        sketch_consumed = true;
                                                        // Don't try to finalize yet, need one more click for dimension_line_pos
                                                    }
                                                    _ => {
                                                        // Other snap types - use standard logic
                                                        state.sketch.add_point(point_2d);
                                                        sketch_consumed = true;
                                                    }
                                                }
                                            } else {
                                                // Not a circle - standard logic
                                                state.sketch.add_point(point_2d);
                                                sketch_consumed = true;
                                            }
                                        } else {
                                            state.sketch.add_point(point_2d);
                                            sketch_consumed = true;
                                        }
                                    } else {
                                        state.sketch.add_point(point_2d);
                                        sketch_consumed = true;
                                    }
                                } else {
                                    state.sketch.add_point(point_2d);
                                    sketch_consumed = true;
                                }
                            } else {
                                state.sketch.add_point(point_2d);
                                sketch_consumed = true;
                            }

                            // Try to finalize fixed-point tools
                            if let Some(element) = state.sketch.try_finalize() {
                                state.scene.add_element_to_body_sketch_ex(
                                    bid,
                                    feature_id.as_deref(),
                                    element,
                                );
                                state.sketch.clear_drawing();
                            }
                        }
                    }
                }

                // Handle right click - finalize multi-point tools, show context menu, or cancel
                if response.secondary_clicked() {
                    if state.sketch.tool == crate::state::sketch::SketchTool::Polyline
                        || state.sketch.tool == crate::state::sketch::SketchTool::Spline
                    {
                        if let Some(element) = state.sketch.try_finalize_multi() {
                            state.scene.add_element_to_body_sketch_ex(
                                bid,
                                feature_id.as_deref(),
                                element,
                            );
                        }
                        state.sketch.clear_drawing();
                    } else if !state.sketch.element_selection.selected.is_empty()
                        || !state.sketch.element_selection.selected_points.is_empty()
                    {
                        // Show context menu for selected elements or points
                        self.sketch_element_context_menu = true;
                    } else {
                        // Show context menu with tools when nothing selected
                        self.sketch_tools_context_menu = true;
                        state.sketch.clear_drawing();
                    }
                    sketch_consumed = true;
                }
            }
        }

        // ESC handling is done in keyboard.rs to avoid duplicates

        sketch_consumed
    }

    /// Handle modification tools (Trim, Fillet, Offset)
    fn handle_modification_tools(
        &mut self,
        response: &egui::Response,
        rect: egui::Rect,
        state: &mut AppState,
    ) -> bool {
        use crate::sketch::operations::{trim_arc, trim_circle, trim_line, trim_polyline, trim_rectangle, TrimResult, offset_element, reflect_element_about_line};
        use crate::state::sketch::SketchTool;

        // Helper function for mirror tool
        fn mirror_element(element: &shared::SketchElement, axis_start: [f64; 2], axis_end: [f64; 2]) -> Option<shared::SketchElement> {
            let axis = ((axis_start[0], axis_start[1]), (axis_end[0], axis_end[1]));
            Some(reflect_element_about_line(element, axis))
        }

        // Only process if in sketch edit mode and using a modification tool
        if !state.sketch.is_editing() {
            return false;
        }

        let is_mod_tool = matches!(
            state.sketch.tool,
            SketchTool::Trim | SketchTool::Fillet | SketchTool::Offset | SketchTool::Mirror | SketchTool::Pattern
        );
        if !is_mod_tool {
            return false;
        }

        // Only handle clicks
        if !response.clicked() {
            return false;
        }

        let pos = match response.interact_pointer_pos() {
            Some(p) => p,
            None => return false,
        };

        // Get sketch data
        let body_id = state.sketch.editing_body_id().cloned();
        let feature_id = state.sketch.active_feature_id().cloned();

        let bid = match body_id {
            Some(ref id) => id.clone(),
            None => return false,
        };

        let sketch_data = sketch_utils::find_sketch_data_ex(
            &state.scene.scene,
            &bid,
            feature_id.as_deref(),
        );

        let (sketch, sketch_transform) = match sketch_data {
            Some((s, t)) => (s.clone(), t.clone()),
            None => return false,
        };

        // Combine body transform with sketch transform
        let body_transform = state
            .scene
            .scene
            .bodies
            .iter()
            .find(|b| b.id == bid)
            .map(|b| crate::helpers::get_body_base_transform(b))
            .unwrap_or_else(shared::Transform::new);
        let transform = crate::helpers::combine_transforms(&body_transform, &sketch_transform);

        // Convert click to 2D sketch coordinates
        let ray = self.camera.screen_ray(pos, rect);
        let click_2d = match sketch_interact::ray_sketch_plane(&ray, &sketch, &transform) {
            Some(pt) => pt,
            None => return false,
        };

        // Hit test to find which element was clicked
        let hit_tolerance = 0.5; // Tolerance in sketch units
        let hit = sketch_interact::hit_test_elements(click_2d, &sketch, hit_tolerance);

        // For Pattern tool with Circular mode, allow clicks anywhere to set center
        use crate::state::sketch::PatternType;
        if state.sketch.tool == SketchTool::Pattern
            && state.sketch.pattern_params.pattern_type == PatternType::Circular
        {
            // Use snap point if available, otherwise use click position
            let center = if let Some(ref snap) = state.sketch.active_snap {
                snap.point
            } else {
                click_2d
            };
            state.sketch.pattern_params.center = Some(center);
            return true;
        }

        // For other tools, require hitting an element
        let hit = match hit {
            Some(h) => h,
            None => return false,
        };

        tracing::info!("Trim tool: hit element {} at {:?}, distance={}", hit.element_index, click_2d, hit.distance);

        // Handle based on current tool
        match state.sketch.tool {
            SketchTool::Trim => {
                // Get the element that was hit
                if let Some(element) = sketch.elements.get(hit.element_index) {
                    tracing::info!("Trim tool: element type = {:?}", std::mem::discriminant(element));
                    let trim_result = match element {
                        shared::SketchElement::Line { start, end } => {
                            tracing::info!("Trim tool: trimming LINE from {:?} to {:?}", start, end);
                            trim_line(
                                hit.element_index,
                                [start.x, start.y],
                                [end.x, end.y],
                                click_2d,
                                &sketch,
                            )
                        }
                        shared::SketchElement::Arc {
                            center,
                            radius,
                            start_angle,
                            end_angle,
                        } => {
                            tracing::info!("Trim tool: trimming ARC center={:?}, r={}, angles={}->{}", center, radius, start_angle, end_angle);
                            trim_arc(
                                hit.element_index,
                                [center.x, center.y],
                                *radius,
                                *start_angle,
                                *end_angle,
                                click_2d,
                                &sketch,
                            )
                        }
                        shared::SketchElement::Circle { center, radius } => {
                            tracing::info!("Trim tool: trimming CIRCLE center={:?}, r={}", center, radius);
                            trim_circle(
                                hit.element_index,
                                [center.x, center.y],
                                *radius,
                                click_2d,
                                &sketch,
                            )
                        }
                        shared::SketchElement::Polyline { points } => {
                            tracing::info!("Trim tool: trimming POLYLINE with {} points", points.len());
                            trim_polyline(
                                hit.element_index,
                                points,
                                click_2d,
                                &sketch,
                            )
                        }
                        shared::SketchElement::Rectangle { corner, width, height } => {
                            tracing::info!("Trim tool: trimming RECTANGLE at {:?} {}x{}", corner, width, height);
                            trim_rectangle(
                                hit.element_index,
                                [corner.x, corner.y],
                                *width,
                                *height,
                                click_2d,
                                &sketch,
                            )
                        }
                        _ => {
                            tracing::info!("Trim tool: element type not supported for trimming");
                            TrimResult::NoChange
                        }
                    };

                    tracing::info!("Trim result: {:?}", match &trim_result {
                        TrimResult::Removed => "Removed".to_string(),
                        TrimResult::Replaced(elems) => format!("Replaced with {} elements", elems.len()),
                        TrimResult::NoChange => "NoChange".to_string(),
                    });

                    // Apply the trim result
                    match trim_result {
                        TrimResult::Removed => {
                            state.scene.remove_sketch_element(
                                &bid,
                                feature_id.as_deref(),
                                hit.element_index,
                            );
                        }
                        TrimResult::Replaced(new_elements) => {
                            state.scene.replace_sketch_element(
                                &bid,
                                feature_id.as_deref(),
                                hit.element_index,
                                new_elements,
                            );
                        }
                        TrimResult::NoChange => {
                            // No intersection found - do nothing
                        }
                    }
                }
                true
            }
            SketchTool::Offset => {
                // Get the element that was hit
                if let Some(element) = sketch.elements.get(hit.element_index) {
                    tracing::info!("Offset tool: offsetting element {} at {:?}", hit.element_index, click_2d);

                    let distance = state.sketch.offset_distance;
                    if let Some(new_elements) = offset_element(element, distance, click_2d) {
                        tracing::info!("Offset tool: created {} new elements", new_elements.len());

                        // Add the new offset elements to the sketch
                        for new_elem in new_elements {
                            state.scene.add_element_to_body_sketch_ex(
                                &bid,
                                feature_id.as_deref(),
                                new_elem,
                            );
                        }
                    } else {
                        tracing::warn!("Offset tool: element type not supported or offset failed");
                    }
                }
                true
            }
            SketchTool::Fillet => {
                // Fillet not implemented yet
                false
            }
            SketchTool::Mirror => {
                // Mirror tool: click on a line to use as axis, mirror selected elements
                if let Some(element) = sketch.elements.get(hit.element_index) {
                    // Only lines can be used as mirror axis
                    if let shared::SketchElement::Line { start, end } = element {
                        let selected = state.sketch.element_selection.selected.clone();
                        if selected.is_empty() {
                            tracing::info!("Mirror tool: no elements selected");
                        } else {
                            tracing::info!("Mirror tool: mirroring {} elements across line {}", selected.len(), hit.element_index);

                            // Mirror each selected element
                            let axis_start = [start.x, start.y];
                            let axis_end = [end.x, end.y];

                            for elem_idx in selected {
                                // Don't mirror the axis line itself
                                if elem_idx == hit.element_index {
                                    continue;
                                }

                                if let Some(src_elem) = sketch.elements.get(elem_idx) {
                                    if let Some(mirrored) = mirror_element(src_elem, axis_start, axis_end) {
                                        state.scene.add_element_to_body_sketch_ex(
                                            &bid,
                                            feature_id.as_deref(),
                                            mirrored,
                                        );
                                    }
                                }
                            }
                        }
                    } else {
                        tracing::info!("Mirror tool: clicked element is not a line");
                    }
                }
                true
            }
            _ => false,
        }
    }

    /// Handle ViewCube interaction (click and drag) - returns true if consumed
    fn handle_view_cube_interaction(&mut self, response: &egui::Response) -> bool {
        let vc_state = match &self.view_cube_state {
            Some(state) => state,
            None => return false,
        };

        // Check if mouse is over the ViewCube
        let over_cube = response.hover_pos()
            .map(|pos| overlays::is_over_view_cube(vc_state, pos))
            .unwrap_or(false);

        // Handle dragging on ViewCube to rotate camera
        if over_cube && response.dragged_by(egui::PointerButton::Primary) {
            let delta = response.drag_delta();
            self.camera.rotate(delta.x * 0.5, delta.y * 0.5);
            return true;
        }

        // Handle click to set standard view
        if response.clicked() {
            if let Some(pos) = response.interact_pointer_pos() {
                if let Some(face) = overlays::hit_test_view_cube(vc_state, pos) {
                    self.camera.set_standard_view(face.to_standard_view());
                    return true;
                }
            }
        }

        false
    }

    fn handle_gizmo_and_camera(
        &mut self,
        response: &egui::Response,
        ui: &Ui,
        rect: egui::Rect,
        state: &mut AppState,
        sketch_consumed: bool,
        mod_tool_consumed: bool,
    ) {
        // ── Gizmo drag handling ─────────────────────────────────
        if self.gizmo_state.dragging {
            if response.dragged_by(egui::PointerButton::Primary) {
                let delta = response.drag_delta();
                if let (Some(axis), Some(ref obj_id)) =
                    (self.gizmo_state.active_axis, &self.gizmo_state.drag_object_id)
                {
                    // Compute gizmo center from AABB
                    if let Some(aabb) = self.csg_cache.aabbs().get(obj_id) {
                        let center = aabb.center();
                        let world_delta =
                            compute_drag_delta(&self.camera, center, axis, delta, rect);
                        state.scene.apply_translate_delta(
                            obj_id,
                            world_delta.x as f64,
                            world_delta.y as f64,
                            world_delta.z as f64,
                        );
                    }
                }
            }
            // End drag when button released
            if response.drag_stopped() || !response.dragged_by(egui::PointerButton::Primary) {
                self.gizmo_state.end_drag();
            }
        } else {
            // ── Camera controls (only when not dragging gizmo) ──
            if response.dragged_by(egui::PointerButton::Middle)
                || (response.dragged_by(egui::PointerButton::Primary)
                    && ui.input(|i| i.modifiers.alt))
            {
                let delta = response.drag_delta();
                self.camera.rotate(delta.x * 0.5, delta.y * 0.5);
            }

            if response.dragged_by(egui::PointerButton::Secondary) {
                let delta = response.drag_delta();
                self.camera.pan(delta.x * 0.01, delta.y * 0.01);
            }

            // ── Gizmo drag start on LMB drag ───────────────────
            if !sketch_consumed
                && !mod_tool_consumed
                && response.drag_started_by(egui::PointerButton::Primary)
                && !ui.input(|i| i.modifiers.alt)
            {
                let pointer_pos = response.interact_pointer_pos().or_else(|| response.hover_pos());
                if let Some(pos) = pointer_pos {
                    if let Some(primary_id) = state.selection.primary().cloned() {
                        if let Some(aabb) = self.csg_cache.aabbs().get(&primary_id) {
                            let center = aabb.center();
                            let ray = self.camera.screen_ray(pos, rect);
                            if let Some(axis) = gizmo_hit_test(&ray, center, GIZMO_LENGTH) {
                                state.scene.begin_drag();
                                self.gizmo_state.active_axis = Some(axis);
                                self.gizmo_state.dragging = true;
                                self.gizmo_state.drag_object_id = Some(primary_id);
                            }
                        }
                    }
                }
            }
        }
    }

    fn handle_selection(
        &mut self,
        response: &egui::Response,
        ui: &Ui,
        rect: egui::Rect,
        state: &mut AppState,
        sketch_consumed: bool,
        mod_tool_consumed: bool,
    ) {
        if sketch_consumed
            || mod_tool_consumed
            || !response.clicked()
            || ui.input(|i| i.modifiers.alt)
            || self.gizmo_state.dragging
        {
            return;
        }

        let Some(pos) = response.interact_pointer_pos() else {
            return;
        };

        let ray = self.camera.screen_ray(pos, rect);

        // First check gizmo hit — if gizmo visible, don't pick through it
        let gizmo_hit = if let Some(primary_id) = state.selection.primary() {
            self.csg_cache
                .aabbs()
                .get(primary_id)
                .and_then(|aabb| gizmo_hit_test(&ray, aabb.center(), GIZMO_LENGTH))
                .is_some()
        } else {
            false
        };

        if gizmo_hit {
            return;
        }

        let shift_pressed = ui.input(|i| i.modifiers.shift);
        let ctrl_pressed = ui.input(|i| i.modifiers.ctrl);

        // Check if fillet mode is active
        if state.fillet3d.is_active() {
            self.handle_edge_selection(pos, &ray, rect, state, ctrl_pressed, shift_pressed);
            return;
        }

        if shift_pressed {
            // Shift+Click = face selection
            self.handle_face_selection(&ray, state);
        } else {
            // Regular click = object selection
            self.handle_object_selection(&ray, ui, state);
        }
    }

    fn handle_face_selection(&self, ray: &picking::Ray, state: &mut AppState) {
        if let Some(obj_id) = pick_nearest(ray, self.csg_cache.aabbs()) {
            let meshes = self.csg_cache.meshes_clone();
            if let Some(mesh) = meshes.get(&obj_id) {
                if let Some(hit) = pick_triangle(ray, mesh) {
                    let face_tris = group_coplanar_triangles(mesh, hit.triangle_index, 0.999);
                    let area = calculate_face_area(mesh, &face_tris);

                    state.selection.select_face(FaceSelection {
                        object_id: obj_id.clone(),
                        triangle_indices: face_tris,
                        normal: [hit.normal.x, hit.normal.y, hit.normal.z],
                        area,
                    });

                    if !state.selection.is_selected(&obj_id) {
                        state.selection.select(obj_id);
                    }
                }
            }
        } else {
            state.selection.clear_face();
        }
    }

    fn handle_edge_selection(
        &self,
        cursor_pos: egui::Pos2,
        ray: &picking::Ray,
        rect: egui::Rect,
        state: &mut AppState,
        ctrl_pressed: bool,
        shift_pressed: bool,
    ) {
        let meshes = self.csg_cache.meshes_clone();

        // If no body selected for fillet, try to find one by clicking
        let body_id = if let Some(id) = state.fillet3d.body_id.clone() {
            id
        } else {
            // Try to pick a body first
            if let Some(obj_id) = pick_nearest(ray, self.csg_cache.aabbs()) {
                // Set this as the fillet target body
                state.fillet3d.body_id = Some(obj_id.clone());
                obj_id
            } else {
                return;
            }
        };

        let Some(mesh) = meshes.get(&body_id) else {
            return;
        };

        // Extract sharp edges from mesh
        let edges = edge::extract_sharp_edges(mesh, 10.0); // 10 degree threshold

        if edges.is_empty() {
            return;
        }

        // Convert cursor position to screen coordinates relative to viewport
        let cursor_screen = [
            cursor_pos.x - rect.min.x,
            cursor_pos.y - rect.min.y,
        ];
        let screen_size = [rect.width(), rect.height()];

        // Get view-projection matrix
        let aspect = rect.width() / rect.height();
        let view_proj = self.camera.view_projection(aspect);

        // Pixel tolerance for edge picking (15 pixels)
        let pixel_tolerance = 15.0;

        // Try to pick an edge using 2D screen-space algorithm
        if let Some(hit) = edge::pick_edge_2d(
            cursor_screen,
            &edges,
            self.camera.eye_position(),
            &view_proj,
            screen_size,
            pixel_tolerance,
        ) {
            tracing::info!("Fillet3D: PICKED edge {} at distance {}", hit.edge_index, hit.distance);
            let edge = &edges[hit.edge_index];

            let edge_selection = crate::state::selection::EdgeSelection {
                object_id: body_id.clone(),
                start: edge.start,
                end: edge.end,
                normal1: edge.normal1,
                normal2: edge.normal2,
                edge_index: hit.edge_index,
            };

            if shift_pressed {
                // Shift+click: select edge chain (connected sharp edges)
                let chain_indices = edge::find_edge_chain(&edges, hit.edge_index, 10.0);
                state.selection.clear_edges();
                for idx in chain_indices {
                    let e = &edges[idx];
                    state.selection.add_edge(crate::state::selection::EdgeSelection {
                        object_id: body_id.clone(),
                        start: e.start,
                        end: e.end,
                        normal1: e.normal1,
                        normal2: e.normal2,
                        edge_index: idx,
                    });
                }
            } else if ctrl_pressed {
                // Ctrl+click: toggle edge in selection
                state.selection.toggle_edge(edge_selection);
            } else {
                // Regular click: select single edge
                state.selection.select_edge(edge_selection);
            }
        } else if !ctrl_pressed && !shift_pressed {
            // Click on empty space: clear selection
            state.selection.clear_edges();
        }
    }

    /// Handle edge hover for visual feedback in fillet mode
    fn handle_fillet_hover(
        &self,
        response: &egui::Response,
        rect: egui::Rect,
        state: &mut AppState,
    ) {
        // Only update hover on mouse move (not click)
        let Some(pos) = response.hover_pos() else {
            state.selection.hovered_edge = None;
            return;
        };

        let ray = self.camera.screen_ray(pos, rect);
        let meshes = self.csg_cache.meshes_clone();

        // Get body ID for fillet
        let body_id = if let Some(id) = state.fillet3d.body_id.clone() {
            id
        } else {
            // Try to find body under cursor
            if let Some(obj_id) = pick_nearest(&ray, self.csg_cache.aabbs()) {
                obj_id
            } else {
                state.selection.hovered_edge = None;
                return;
            }
        };

        let Some(mesh) = meshes.get(&body_id) else {
            state.selection.hovered_edge = None;
            return;
        };

        // Extract sharp edges
        let edges = edge::extract_sharp_edges(mesh, 10.0);
        if edges.is_empty() {
            state.selection.hovered_edge = None;
            return;
        }

        // Convert cursor position to screen coordinates relative to viewport
        let cursor_screen = [
            pos.x - rect.min.x,
            pos.y - rect.min.y,
        ];
        let screen_size = [rect.width(), rect.height()];

        // Get view-projection matrix
        let aspect = rect.width() / rect.height();
        let view_proj = self.camera.view_projection(aspect);

        // Pixel tolerance for edge picking (15 pixels)
        let pixel_tolerance = 15.0;

        if let Some(hit) = edge::pick_edge_2d(
            cursor_screen,
            &edges,
            self.camera.eye_position(),
            &view_proj,
            screen_size,
            pixel_tolerance,
        ) {
            let e = &edges[hit.edge_index];
            state.selection.hovered_edge = Some(crate::state::selection::EdgeSelection {
                object_id: body_id,
                start: e.start,
                end: e.end,
                normal1: e.normal1,
                normal2: e.normal2,
                edge_index: hit.edge_index,
            });
        } else {
            state.selection.hovered_edge = None;
        }
    }

    fn handle_object_selection(
        &self,
        ray: &picking::Ray,
        ui: &Ui,
        state: &mut AppState,
    ) {
        let picked = pick_nearest(ray, self.csg_cache.aabbs());
        if ui.input(|i| i.modifiers.command) {
            if let Some(id) = picked {
                state.selection.toggle(id);
            }
        } else if let Some(id) = picked {
            state.selection.select(id);
        } else {
            state.selection.clear();
        }
    }

    fn handle_right_click(
        &mut self,
        response: &egui::Response,
        rect: egui::Rect,
        sketch_consumed: bool,
        mod_tool_consumed: bool,
    ) {
        if !sketch_consumed && !mod_tool_consumed && response.secondary_clicked() {
            if let Some(pos) = response.interact_pointer_pos() {
                let ray = self.camera.screen_ray(pos, rect);
                self.context_target = pick_nearest(&ray, self.csg_cache.aabbs());
            } else {
                self.context_target = None;
            }
        }
    }

    fn show_context_menu(
        &mut self,
        response: &egui::Response,
        state: &mut AppState,
    ) -> context_menu::ContextMenuActions {
        let mut actions = context_menu::ContextMenuActions::default();

        // Don't show object context menu if sketch element context menu is active
        if self.sketch_element_context_menu {
            return actions;
        }

        let ctx_id = self.context_target.clone();
        let ctx_center = ctx_id
            .as_ref()
            .and_then(|id| self.csg_cache.aabbs().get(id).map(|a| a.center()));

        if let Some(ref id) = ctx_id {
            response.context_menu(|ui| {
                actions = context_menu::show_context_menu(
                    ui,
                    state,
                    id,
                    ctx_center,
                    &self.csg_cache,
                );
                // Handle delete clearing context target
                if state.scene.get_body(id).is_none() {
                    self.context_target = None;
                }
            });
        }

        actions
    }

    fn apply_context_actions(
        &mut self,
        actions: context_menu::ContextMenuActions,
        state: &mut AppState,
    ) {
        if let Some(center) = actions.focus_request {
            self.camera.target = center;
        }
        if actions.duplicate_request {
            crate::ui::toolbar::action_duplicate(state);
        }
        if let Some((body_id, plane, world_offset, centroid, face_normal)) = actions.sketch_on_face_request {
            // Align camera to look perpendicular to the sketch plane
            self.camera.align_to_sketch_plane(plane.clone(), centroid);

            // Convert world offset to local offset by subtracting body's base transform
            let local_offset = if let Some(body) = state.scene.get_body(&body_id) {
                let body_transform = crate::helpers::get_body_base_transform(body);
                match plane {
                    shared::SketchPlane::Xy => world_offset - body_transform.position[2],
                    shared::SketchPlane::Xz => world_offset - body_transform.position[1],
                    shared::SketchPlane::Yz => world_offset - body_transform.position[0],
                }
            } else {
                world_offset
            };

            // Convert face normal from f32 to f64
            let face_normal_f64 = Some([
                face_normal[0] as f64,
                face_normal[1] as f64,
                face_normal[2] as f64,
            ]);

            sketch_utils::add_sketch_to_existing_body(state, &body_id, plane, local_offset, face_normal_f64);
        }
    }

    fn show_sketch_element_context_menu(
        &mut self,
        ui: &mut Ui,
        response: &egui::Response,
        state: &mut AppState,
    ) {
        use crate::i18n::t;

        if !self.sketch_element_context_menu {
            return;
        }

        let selected_count = state.sketch.element_selection.selected.len();
        let selected_points_count = state.sketch.element_selection.selected_points.len();

        if selected_count == 0 && selected_points_count == 0 {
            self.sketch_element_context_menu = false;
            return;
        }

        response.context_menu(|ui| {
            // Connect option - only when exactly 2 points selected
            if selected_points_count == 2 {
                if ui.button(t("sketch.context.connect")).clicked() {
                    if let (Some(body_id), feature_id) = (
                        state.sketch.editing_body_id().cloned(),
                        state.sketch.active_feature_id().cloned(),
                    ) {
                        let points = state.sketch.element_selection.selected_points.clone();
                        let point1 = shared::PointRef {
                            element_index: points[0].0,
                            point_index: points[0].1,
                        };
                        let point2 = shared::PointRef {
                            element_index: points[1].0,
                            point_index: points[1].1,
                        };
                        state.scene.add_sketch_constraint(
                            &body_id,
                            feature_id.as_deref(),
                            shared::SketchConstraint::Coincident { point1, point2 },
                        );
                        state.sketch.element_selection.clear();
                    }
                    ui.close_menu();
                    self.sketch_element_context_menu = false;
                }
                ui.separator();
            }

            // Show element-based options only if elements are selected
            if selected_count > 0 {
                // Delete option
                let delete_label = if selected_count == 1 {
                    t("sketch.context.delete").to_string()
                } else {
                    format!("{} ({})", t("sketch.context.delete"), selected_count)
                };
                if ui.button(&delete_label).clicked() {
                    if let (Some(body_id), feature_id) = (
                        state.sketch.editing_body_id().cloned(),
                        state.sketch.active_feature_id().cloned(),
                    ) {
                        let indices = state.sketch.element_selection.get_selected_for_removal();
                        state.scene.remove_sketch_elements_by_indices(
                            &body_id,
                            feature_id.as_deref(),
                            indices,
                        );
                        state.sketch.element_selection.clear();
                    }
                    ui.close_menu();
                    self.sketch_element_context_menu = false;
                }

                ui.separator();

                // Toggle construction geometry option
                if ui.button(t("sketch.context.construction")).clicked() {
                    if let (Some(body_id), feature_id) = (
                        state.sketch.editing_body_id().cloned(),
                        state.sketch.active_feature_id().cloned(),
                    ) {
                        let indices: Vec<usize> = state.sketch.element_selection.selected.clone();
                        state.scene.toggle_construction(
                            &body_id,
                            feature_id.as_deref(),
                            &indices,
                        );
                    }
                    ui.close_menu();
                    self.sketch_element_context_menu = false;
                }
            }

            // Rotation axis option - only for single line selection
            // Check current selection state (may have changed after button clicks above)
            if state.sketch.element_selection.selected.len() == 1 {
                let selected_idx = state.sketch.element_selection.selected[0];
                // Check if selected element is a line
                let is_line = if let (Some(body_id), feature_id) = (
                    state.sketch.editing_body_id(),
                    state.sketch.active_feature_id(),
                ) {
                    sketch_utils::find_sketch_data_ex(&state.scene.scene, body_id, feature_id.map(|s| s.as_str()))
                        .map(|(sketch, _)| {
                            sketch.elements.get(selected_idx)
                                .map(|el| matches!(el, shared::SketchElement::Line { .. }))
                                .unwrap_or(false)
                        })
                        .unwrap_or(false)
                } else {
                    false
                };

                if is_line {
                    // Check if this element is already the revolve axis
                    let is_axis = if let (Some(body_id), feature_id) = (
                        state.sketch.editing_body_id(),
                        state.sketch.active_feature_id(),
                    ) {
                        sketch_utils::find_sketch_data_ex(&state.scene.scene, body_id, feature_id.map(|s| s.as_str()))
                            .map(|(sketch, _)| sketch.is_revolve_axis(selected_idx))
                            .unwrap_or(false)
                    } else {
                        false
                    };

                    let label = if is_axis {
                        format!("{} ✓", t("sketch.context.revolve_axis"))
                    } else {
                        t("sketch.context.revolve_axis").to_string()
                    };

                    if ui.button(label).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.toggle_revolve_axis(
                                &body_id,
                                feature_id.as_deref(),
                                selected_idx,
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }

                    // Check if this element is the symmetry axis
                    let is_sym_axis = if let (Some(body_id), feature_id) = (
                        state.sketch.editing_body_id(),
                        state.sketch.active_feature_id(),
                    ) {
                        sketch_utils::find_sketch_data_ex(&state.scene.scene, body_id, feature_id.map(|s| s.as_str()))
                            .map(|(sketch, _)| sketch.is_symmetry_axis(selected_idx))
                            .unwrap_or(false)
                    } else {
                        false
                    };

                    let sym_label = if is_sym_axis {
                        format!("{} ✓", t("symmetry.set_axis"))
                    } else {
                        t("symmetry.set_axis").to_string()
                    };

                    if ui.button(sym_label).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.toggle_symmetry_axis(
                                &body_id,
                                feature_id.as_deref(),
                                selected_idx,
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                }
            }

            // Mirror operations (if symmetry axis is set and elements are selected)
            let has_symmetry_axis = if let (Some(body_id), feature_id) = (
                state.sketch.editing_body_id(),
                state.sketch.active_feature_id(),
            ) {
                sketch_utils::find_sketch_data_ex(&state.scene.scene, body_id, feature_id.map(|s| s.as_str()))
                    .map(|(sketch, _)| sketch.symmetry_axis.is_some())
                    .unwrap_or(false)
            } else {
                false
            };

            if has_symmetry_axis && !state.sketch.element_selection.selected.is_empty() {
                ui.separator();
                ui.label("Симметрия");

                if ui.button(t("symmetry.mirror_copy")).clicked() {
                    self.mirror_selected_elements(state, true);
                    ui.close_menu();
                    self.sketch_element_context_menu = false;
                }

                if ui.button(t("symmetry.mirror_move")).clicked() {
                    self.mirror_selected_elements(state, false);
                    ui.close_menu();
                    self.sketch_element_context_menu = false;
                }
            }

            // Constraints section
            ui.separator();
            ui.label(t("constraints.title"));

            // Single line selected - Horizontal/Vertical constraints
            let selected = &state.sketch.element_selection.selected;
            if selected.len() == 1 {
                let elem_idx = selected[0];
                // Check if it's a line
                let is_line = if let (Some(body_id), feature_id) = (
                    state.sketch.editing_body_id(),
                    state.sketch.active_feature_id(),
                ) {
                    sketch_utils::find_sketch_data_ex(&state.scene.scene, body_id, feature_id.map(|s| s.as_str()))
                        .map(|(sketch, _)| {
                            sketch.elements.get(elem_idx)
                                .map(|el| matches!(el, shared::SketchElement::Line { .. }))
                                .unwrap_or(false)
                        })
                        .unwrap_or(false)
                } else {
                    false
                };

                if is_line {
                    if ui.button(t("constraint.horizontal")).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.add_sketch_constraint(
                                &body_id,
                                feature_id.as_deref(),
                                shared::SketchConstraint::Horizontal { element: elem_idx },
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                    if ui.button(t("constraint.vertical")).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.add_sketch_constraint(
                                &body_id,
                                feature_id.as_deref(),
                                shared::SketchConstraint::Vertical { element: elem_idx },
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                }

                // Fixed constraint - available for any element type
                if ui.button(t("constraint.fixed")).clicked() {
                    if let (Some(body_id), feature_id) = (
                        state.sketch.editing_body_id().cloned(),
                        state.sketch.active_feature_id().cloned(),
                    ) {
                        state.scene.add_sketch_constraint(
                            &body_id,
                            feature_id.as_deref(),
                            shared::SketchConstraint::Fixed { element: elem_idx },
                        );
                    }
                    ui.close_menu();
                    self.sketch_element_context_menu = false;
                }
            }

            // Two elements selected - various constraints
            if selected.len() == 2 {
                let elem1_idx = selected[0];
                let elem2_idx = selected[1];

                // Get element types
                let (is_line1, is_line2, is_circle1, is_circle2) = if let (Some(body_id), feature_id) = (
                    state.sketch.editing_body_id(),
                    state.sketch.active_feature_id(),
                ) {
                    sketch_utils::find_sketch_data_ex(&state.scene.scene, body_id, feature_id.map(|s| s.as_str()))
                        .map(|(sketch, _)| {
                            let el1 = sketch.elements.get(elem1_idx);
                            let el2 = sketch.elements.get(elem2_idx);
                            (
                                el1.map(|el| matches!(el, shared::SketchElement::Line { .. })).unwrap_or(false),
                                el2.map(|el| matches!(el, shared::SketchElement::Line { .. })).unwrap_or(false),
                                el1.map(|el| matches!(el, shared::SketchElement::Circle { .. } | shared::SketchElement::Arc { .. })).unwrap_or(false),
                                el2.map(|el| matches!(el, shared::SketchElement::Circle { .. } | shared::SketchElement::Arc { .. })).unwrap_or(false),
                            )
                        })
                        .unwrap_or((false, false, false, false))
                } else {
                    (false, false, false, false)
                };

                let both_lines = is_line1 && is_line2;
                let both_circles = is_circle1 && is_circle2;
                let line_and_circle = (is_line1 && is_circle2) || (is_circle1 && is_line2);

                // Two lines: Parallel, Perpendicular, Equal
                if both_lines {
                    if ui.button(t("constraint.parallel")).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.add_sketch_constraint(
                                &body_id,
                                feature_id.as_deref(),
                                shared::SketchConstraint::Parallel {
                                    element1: elem1_idx,
                                    element2: elem2_idx,
                                },
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                    if ui.button(t("constraint.perpendicular")).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.add_sketch_constraint(
                                &body_id,
                                feature_id.as_deref(),
                                shared::SketchConstraint::Perpendicular {
                                    element1: elem1_idx,
                                    element2: elem2_idx,
                                },
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                    if ui.button(t("constraint.equal")).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.add_sketch_constraint(
                                &body_id,
                                feature_id.as_deref(),
                                shared::SketchConstraint::Equal {
                                    element1: elem1_idx,
                                    element2: elem2_idx,
                                },
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                }

                // Two circles/arcs: Concentric, Equal radius
                if both_circles {
                    if ui.button(t("constraint.concentric")).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.add_sketch_constraint(
                                &body_id,
                                feature_id.as_deref(),
                                shared::SketchConstraint::Concentric {
                                    element1: elem1_idx,
                                    element2: elem2_idx,
                                },
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                    if ui.button(t("constraint.equal")).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.add_sketch_constraint(
                                &body_id,
                                feature_id.as_deref(),
                                shared::SketchConstraint::Equal {
                                    element1: elem1_idx,
                                    element2: elem2_idx,
                                },
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                }

                // Line + Circle/Arc: Tangent
                if line_and_circle {
                    if ui.button(t("constraint.tangent")).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.add_sketch_constraint(
                                &body_id,
                                feature_id.as_deref(),
                                shared::SketchConstraint::Tangent {
                                    element1: elem1_idx,
                                    element2: elem2_idx,
                                },
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                }
            }

            // Three elements selected - Symmetric (two elements + axis line)
            if selected.len() == 3 {
                let elem1_idx = selected[0];
                let elem2_idx = selected[1];
                let axis_idx = selected[2];

                // Check if last is a line (axis), and first two are same type
                let valid_symmetric = if let (Some(body_id), feature_id) = (
                    state.sketch.editing_body_id(),
                    state.sketch.active_feature_id(),
                ) {
                    sketch_utils::find_sketch_data_ex(&state.scene.scene, body_id, feature_id.map(|s| s.as_str()))
                        .map(|(sketch, _)| {
                            let axis_is_line = sketch.elements.get(axis_idx)
                                .map(|el| matches!(el, shared::SketchElement::Line { .. }))
                                .unwrap_or(false);
                            let el1 = sketch.elements.get(elem1_idx);
                            let el2 = sketch.elements.get(elem2_idx);
                            let same_type = match (el1, el2) {
                                (Some(shared::SketchElement::Line { .. }), Some(shared::SketchElement::Line { .. })) => true,
                                (Some(shared::SketchElement::Circle { .. }), Some(shared::SketchElement::Circle { .. })) => true,
                                _ => false,
                            };
                            axis_is_line && same_type
                        })
                        .unwrap_or(false)
                } else {
                    false
                };

                if valid_symmetric {
                    if ui.button(t("constraint.symmetric")).clicked() {
                        if let (Some(body_id), feature_id) = (
                            state.sketch.editing_body_id().cloned(),
                            state.sketch.active_feature_id().cloned(),
                        ) {
                            state.scene.add_sketch_constraint(
                                &body_id,
                                feature_id.as_deref(),
                                shared::SketchConstraint::Symmetric {
                                    element1: elem1_idx,
                                    element2: elem2_idx,
                                    axis: axis_idx,
                                },
                            );
                        }
                        ui.close_menu();
                        self.sketch_element_context_menu = false;
                    }
                }
            }
        });

        // Close menu if clicked elsewhere
        if ui.input(|i| i.pointer.any_click()) && !response.context_menu_opened() {
            self.sketch_element_context_menu = false;
        }
    }

    fn show_sketch_tools_context_menu(
        &mut self,
        ui: &mut Ui,
        response: &egui::Response,
        state: &mut AppState,
    ) {
        use crate::i18n::t;
        use crate::state::sketch::SketchTool;

        if !self.sketch_tools_context_menu {
            return;
        }

        // Only show in sketch editing mode
        if !state.sketch.is_editing() {
            self.sketch_tools_context_menu = false;
            return;
        }

        response.context_menu(|ui| {
            ui.label(t("sketch.tools"));
            ui.separator();

            // Selection tool
            if ui.button(t("sketch.tool.select")).clicked() {
                state.sketch.set_tool(SketchTool::None);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            ui.separator();

            // Drawing tools
            if ui.button(t("sketch.tool.line")).clicked() {
                state.sketch.set_tool(SketchTool::Line);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            if ui.button(t("sketch.tool.circle")).clicked() {
                state.sketch.set_tool(SketchTool::Circle);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            if ui.button(t("sketch.tool.arc")).clicked() {
                state.sketch.set_tool(SketchTool::Arc);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            if ui.button(t("sketch.tool.rectangle")).clicked() {
                state.sketch.set_tool(SketchTool::Rectangle);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            if ui.button(t("sketch.tool.polyline")).clicked() {
                state.sketch.set_tool(SketchTool::Polyline);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            if ui.button(t("sketch.tool.spline")).clicked() {
                state.sketch.set_tool(SketchTool::Spline);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            ui.separator();

            // Modification tools
            if ui.button(t("sketch.tool.trim")).clicked() {
                state.sketch.set_tool(SketchTool::Trim);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            if ui.button(t("sketch.tool.fillet")).clicked() {
                state.sketch.set_tool(SketchTool::Fillet);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            if ui.button(t("sketch.tool.offset")).clicked() {
                state.sketch.set_tool(SketchTool::Offset);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            if ui.button(t("sketch.tool.dimension")).clicked() {
                state.sketch.set_tool(SketchTool::Dimension);
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }

            ui.separator();

            // Done - exit sketch editing
            if ui.button(t("sketch.done")).clicked() {
                state.sketch.exit_edit();
                ui.close_menu();
                self.sketch_tools_context_menu = false;
            }
        });

        // Close menu if clicked elsewhere
        if ui.input(|i| i.pointer.any_click()) && !response.context_menu_opened() {
            self.sketch_tools_context_menu = false;
        }
    }

    fn rebuild_csg_if_needed(&mut self, state: &mut AppState) {
        let scene_version = state.scene.version();
        let selected_ids: Vec<String> = state.selection.all().to_vec();
        let face_selection_version = state.selection.face_selection_version;

        if !self.csg_cache.is_valid(
            scene_version,
            &selected_ids,
            &state.hidden,
            face_selection_version,
        ) {
            self.csg_cache.rebuild(
                &state.scene.scene,
                &selected_ids,
                &state.hidden,
                scene_version,
                state.selection.selected_face.as_ref(),
                face_selection_version,
            );
            state.csg_errors = self.csg_cache.errors().clone();
        }
    }

    fn build_gizmo_lines(&self, state: &AppState) -> Option<LineMeshData> {
        if state.selection.count() == 1 {
            let primary_id = state.selection.primary().unwrap();
            self.csg_cache
                .aabbs()
                .get(primary_id)
                .map(|aabb| build_gizmo_lines(aabb.center(), GIZMO_LENGTH))
        } else {
            None
        }
    }

    fn render_gl(
        &self,
        ui: &mut Ui,
        rect: egui::Rect,
        state: &AppState,
        gizmo_lines: Option<LineMeshData>,
    ) {
        if let Some(gl_renderer) = &self.gl_renderer {
            if let Ok(r) = gl_renderer.lock() {
                drop(r); // Release lock before callback

                let renderer_clone = gl_renderer.clone();
                let camera_yaw = self.camera.yaw;
                let camera_pitch = self.camera.pitch;
                let camera_distance = self.camera.distance;
                let camera_target = self.camera.target;
                let camera_fov = self.camera.fov;

                let meshes: HashMap<String, MeshData> = self.csg_cache.meshes_clone();
                let version = self.csg_cache.rebuild_count();

                let grid_settings = state.settings.grid.clone();
                let axes_settings = state.settings.axes.clone();
                let bg_color = state.settings.viewport.background_color;

                let callback = egui::PaintCallback {
                    rect,
                    callback: Arc::new(eframe::egui_glow::CallbackFn::new(
                        move |info, painter| {
                            let gl = painter.gl();

                            let camera = ArcBallCamera {
                                yaw: camera_yaw,
                                pitch: camera_pitch,
                                distance: camera_distance,
                                target: camera_target,
                                fov: camera_fov,
                            };

                            let clip = info.clip_rect_in_pixels();
                            let viewport = [
                                clip.left_px as f32,
                                clip.from_bottom_px as f32,
                                clip.width_px as f32,
                                clip.height_px as f32,
                            ];

                            if let Ok(mut r) = renderer_clone.lock() {
                                r.update_grid(gl, &grid_settings);
                                r.update_axes(gl, &axes_settings);
                                r.sync_from_meshes(gl, &meshes, version);
                                r.sync_gizmo(gl, gizmo_lines.as_ref());

                                let render_params = gl_renderer::RenderParams {
                                    viewport,
                                    grid_visible: grid_settings.visible,
                                    axes_visible: axes_settings.visible,
                                    axes_thickness: axes_settings.thickness,
                                    bg_color,
                                };
                                r.paint(gl, &camera, &render_params);
                            }
                        },
                    )),
                };

                ui.painter().add(callback);
            }
        } else {
            // Fallback: software wireframe rendering
            renderer::paint_viewport(ui, rect, &self.camera, state);
        }
    }

    fn draw_overlays(&mut self, ui: &mut Ui, rect: egui::Rect, state: &AppState) {
        let painter = ui.painter_at(rect);

        // Axis labels
        overlays::draw_axis_labels(&painter, rect, &self.camera);

        // ViewCube (navigation cube)
        self.view_cube_state = Some(overlays::draw_view_cube(&painter, rect, &self.camera));

        // Navigation hint
        if state.scene.scene.bodies.is_empty() {
            painter.text(
                egui::pos2(rect.center().x, rect.bottom() - 20.0),
                egui::Align2::CENTER_BOTTOM,
                t("status.nav_hint"),
                egui::FontId::proportional(11.0),
                egui::Color32::from_rgb(100, 100, 110),
            );
        }

        // Draw all visible sketch bodies
        self.draw_sketch_bodies(&painter, rect, state);

        // Sketch editing overlays
        if state.sketch.is_editing() {
            self.draw_sketch_editing_overlays(&painter, rect, state);
            // Show revolve axis preview when a sketch has designated revolve axis
            overlays::draw_sketch_revolve_axis_preview(&painter, rect, &self.camera, state);
        }

        // Revolve operation overlay (axis and angle arc)
        overlays::draw_revolve_overlay(&painter, rect, &self.camera, state);

        // Draw selected edges when in fillet mode
        if state.fillet3d.is_active() {
            self.draw_selected_edges(&painter, rect, state);
        }
    }

    fn draw_selected_edges(&self, painter: &egui::Painter, rect: egui::Rect, state: &AppState) {
        // Draw hovered edge first (so selected edges draw on top)
        if let Some(ref hovered) = state.selection.hovered_edge {
            // Check if this edge is already selected
            let is_selected = state.selection.selected_edges.iter()
                .any(|e| e.object_id == hovered.object_id && e.edge_index == hovered.edge_index);

            if !is_selected {
                let hover_color = egui::Color32::from_rgb(100, 200, 255); // Light blue
                let hover_stroke = egui::Stroke::new(2.5, hover_color);

                let start_arr = [hovered.start.x, hovered.start.y, hovered.start.z];
                let end_arr = [hovered.end.x, hovered.end.y, hovered.end.z];

                if let (Some(start_screen), Some(end_screen)) = (
                    self.camera.project(start_arr, rect),
                    self.camera.project(end_arr, rect),
                ) {
                    painter.line_segment([start_screen, end_screen], hover_stroke);
                    painter.circle_filled(start_screen, 3.0, hover_color);
                    painter.circle_filled(end_screen, 3.0, hover_color);
                }
            }
        }

        // Draw selected edges with bright color
        let edge_color = egui::Color32::from_rgb(255, 180, 50); // Orange
        let stroke = egui::Stroke::new(3.0, edge_color);

        for edge in &state.selection.selected_edges {
            // Project edge start and end to screen
            let start_arr = [edge.start.x, edge.start.y, edge.start.z];
            let end_arr = [edge.end.x, edge.end.y, edge.end.z];

            let Some(start_screen) = self.camera.project(start_arr, rect) else { continue };
            let Some(end_screen) = self.camera.project(end_arr, rect) else { continue };

            // Draw the edge
            painter.line_segment([start_screen, end_screen], stroke);

            // Draw small circles at edge endpoints
            painter.circle_filled(start_screen, 4.0, edge_color);
            painter.circle_filled(end_screen, 4.0, edge_color);

            // Draw chamfer triangle preview at edge midpoint
            self.draw_chamfer_triangle(painter, rect, edge, state.fillet3d.radius as f32);
        }
    }

    /// Draw chamfer prism preview along the entire edge
    fn draw_chamfer_triangle(
        &self,
        painter: &egui::Painter,
        rect: egui::Rect,
        edge: &crate::state::selection::EdgeSelection,
        radius: f32,
    ) {
        let Some(n2) = edge.normal2 else { return };
        let n1 = edge.normal1;

        // Triangle vertices at START of edge
        let start = edge.start;
        let s0 = start;                      // On edge
        let s1 = start - n1 * radius;        // Into body along -n1
        let s2 = start - n2 * radius;        // Into body along -n2

        // Triangle vertices at END of edge
        let end = edge.end;
        let e0 = end;                        // On edge
        let e1 = end - n1 * radius;          // Into body along -n1
        let e2 = end - n2 * radius;          // Into body along -n2

        // Project all points to screen
        let proj = |p: glam::Vec3| -> Option<egui::Pos2> {
            self.camera.project([p.x, p.y, p.z], rect)
        };

        let Some(ss0) = proj(s0) else { return };
        let Some(ss1) = proj(s1) else { return };
        let Some(ss2) = proj(s2) else { return };
        let Some(se0) = proj(e0) else { return };
        let Some(se1) = proj(e1) else { return };
        let Some(se2) = proj(e2) else { return };

        let fill_color = egui::Color32::from_rgba_unmultiplied(255, 100, 100, 60);
        let outline_color = egui::Color32::from_rgb(255, 50, 50);
        let outline_stroke = egui::Stroke::new(2.0, outline_color);

        // Draw the 3 faces of the triangular prism:
        // 1. Start triangle (s0, s1, s2)
        painter.add(egui::Shape::convex_polygon(
            vec![ss0, ss1, ss2],
            fill_color,
            egui::Stroke::NONE,
        ));

        // 2. End triangle (e0, e1, e2)
        painter.add(egui::Shape::convex_polygon(
            vec![se0, se1, se2],
            fill_color,
            egui::Stroke::NONE,
        ));

        // 3. Diagonal face (chamfer surface): s1-s2-e2-e1
        painter.add(egui::Shape::convex_polygon(
            vec![ss1, ss2, se2, se1],
            egui::Color32::from_rgba_unmultiplied(100, 255, 100, 80),
            egui::Stroke::NONE,
        ));

        // Draw prism outline
        // Start triangle
        painter.line_segment([ss0, ss1], outline_stroke);
        painter.line_segment([ss1, ss2], outline_stroke);
        painter.line_segment([ss2, ss0], outline_stroke);

        // End triangle
        painter.line_segment([se0, se1], outline_stroke);
        painter.line_segment([se1, se2], outline_stroke);
        painter.line_segment([se2, se0], outline_stroke);

        // Connecting edges along the prism
        painter.line_segment([ss0, se0], outline_stroke); // Edge on original edge
        painter.line_segment([ss1, se1], outline_stroke); // Edge on face 1
        painter.line_segment([ss2, se2], outline_stroke); // Edge on face 2

        // Draw vertex markers at start
        painter.circle_filled(ss0, 4.0, egui::Color32::from_rgb(255, 255, 0)); // Yellow
        painter.circle_filled(ss1, 3.0, egui::Color32::from_rgb(0, 255, 0));   // Green
        painter.circle_filled(ss2, 3.0, egui::Color32::from_rgb(0, 150, 255)); // Blue
    }

    #[allow(dead_code)]
    fn draw_camera_info(&self, painter: &egui::Painter, rect: egui::Rect) {
        let overlay_rect = egui::Rect::from_min_size(
            egui::pos2(rect.right() - 140.0, rect.top() + 4.0),
            egui::vec2(136.0, 44.0),
        );
        painter.rect_filled(
            overlay_rect,
            4.0,
            egui::Color32::from_rgba_premultiplied(0, 0, 0, 140),
        );
        painter.text(
            overlay_rect.min + egui::vec2(6.0, 4.0),
            egui::Align2::LEFT_TOP,
            format!(
                "Dist: {:.1}\nYaw: {:.0}  Pitch: {:.0}",
                self.camera.distance,
                self.camera.yaw.to_degrees(),
                self.camera.pitch.to_degrees(),
            ),
            egui::FontId::monospace(10.0),
            egui::Color32::from_rgb(160, 160, 170),
        );
    }

    fn draw_sketch_bodies(&self, painter: &egui::Painter, rect: egui::Rect, state: &AppState) {
        let editing_id = state.sketch.editing_body_id().cloned();

        for body in &state.scene.scene.bodies {
            if !body.visible {
                continue;
            }
            // Skip the one being edited (will be drawn with special style below)
            if editing_id.as_ref() == Some(&body.id) {
                continue;
            }

            let body_transform = crate::helpers::get_body_base_transform(body);

            for feature in &body.features {
                let (sketch, final_transform) = match feature {
                    shared::Feature::Sketch { sketch, transform, .. } => {
                        let combined =
                            crate::helpers::combine_transforms(&body_transform, transform);
                        (sketch, combined)
                    }
                    shared::Feature::BaseExtrude {
                        sketch,
                        sketch_transform,
                        ..
                    } => (sketch, sketch_transform.clone()),
                    shared::Feature::BaseRevolve {
                        sketch,
                        sketch_transform,
                        ..
                    } => (sketch, sketch_transform.clone()),
                    _ => continue,
                };

                let is_selected = state.selection.is_selected(&body.id);
                let stroke_color = if is_selected {
                    egui::Color32::from_rgb(100, 200, 255)
                } else {
                    egui::Color32::from_rgb(200, 180, 100)
                };
                let sketch_stroke = egui::Stroke::new(1.5, stroke_color);
                let display_info = renderer::SketchElementDisplayInfo {
                    construction: sketch.construction.clone(),
                    revolve_axis: sketch.revolve_axis,
                    dimension_settings: Some(state.settings.dimensions.clone()),
                    unit_abbrev: Some(state.settings.units.abbrev()),
                    ..Default::default()
                };
                renderer::draw_sketch_elements(
                    painter,
                    rect,
                    &self.camera,
                    sketch,
                    &final_transform,
                    sketch_stroke,
                    &display_info,
                );
            }
        }
    }

    fn draw_sketch_editing_overlays(
        &self,
        painter: &egui::Painter,
        rect: egui::Rect,
        state: &AppState,
    ) {
        // Draw existing sketch elements (with editing highlight)
        if let Some(body_id) = state.sketch.editing_body_id() {
            let feature_id = state.sketch.active_feature_id();
            if let Some((sketch, transform)) = sketch_utils::find_sketch_data_ex(
                &state.scene.scene,
                body_id,
                feature_id.map(|s| s.as_str()),
            ) {
                let body_transform = state
                    .scene
                    .scene
                    .bodies
                    .iter()
                    .find(|b| &b.id == body_id)
                    .map(|b| crate::helpers::get_body_base_transform(b))
                    .unwrap_or_else(shared::Transform::new);
                let combined_transform =
                    crate::helpers::combine_transforms(&body_transform, transform);

                let sketch_stroke = egui::Stroke::new(2.0, egui::Color32::from_rgb(255, 200, 50));
                let display_info = renderer::SketchElementDisplayInfo {
                    selected: state.sketch.element_selection.selected.clone(),
                    selected_points: state.sketch.element_selection.selected_points.clone(),
                    hover_element: state.sketch.element_selection.hover_element,
                    hover_point: state.sketch.element_selection.hover_point,
                    construction: sketch.construction.clone(),
                    revolve_axis: sketch.revolve_axis,
                    dimension_settings: Some(state.settings.dimensions.clone()),
                    unit_abbrev: Some(state.settings.units.abbrev()),
                };
                renderer::draw_sketch_elements(
                    painter,
                    rect,
                    &self.camera,
                    sketch,
                    &combined_transform,
                    sketch_stroke,
                    &display_info,
                );

                // Draw control points for selected/hovered elements
                renderer::draw_control_points(
                    painter,
                    rect,
                    &self.camera,
                    sketch,
                    &combined_transform,
                    &display_info,
                );

                // Draw constraint icons for hovered element
                if let Some(hover_idx) = state.sketch.element_selection.hover_element {
                    renderer::draw_constraint_icons(
                        painter,
                        rect,
                        &self.camera,
                        sketch,
                        &combined_transform,
                        hover_idx,
                    );
                }
            }
        }

        // Draw preview (in-progress drawing)
        overlays::draw_sketch_preview(painter, rect, &self.camera, state);

        // Draw snap marker if active
        if let Some(ref snap) = state.sketch.active_snap {
            if let Some(body_id) = state.sketch.editing_body_id() {
                let feature_id = state.sketch.active_feature_id();
                if let Some((sketch, transform)) = sketch_utils::find_sketch_data_ex(
                    &state.scene.scene,
                    body_id,
                    feature_id.map(|s| s.as_str()),
                ) {
                    let body_transform = state
                        .scene
                        .scene
                        .bodies
                        .iter()
                        .find(|b| &b.id == body_id)
                        .map(|b| crate::helpers::get_body_base_transform(b))
                        .unwrap_or_else(shared::Transform::new);
                    let combined_transform =
                        crate::helpers::combine_transforms(&body_transform, transform);

                    let p3d = renderer::sketch_point_to_3d(
                        snap.point[0],
                        snap.point[1],
                        sketch,
                        &combined_transform,
                    );
                    renderer::draw_snap_marker(painter, rect, &self.camera, p3d, snap.snap_type);
                }
            }
        }
    }

    /// Mirror selected elements about the symmetry axis
    fn mirror_selected_elements(&mut self, state: &mut AppState, create_copy: bool) {
        use crate::sketch::geometry::reflect_element_about_line;

        let (body_id, feature_id) = match (
            state.sketch.editing_body_id(),
            state.sketch.active_feature_id(),
        ) {
            (Some(bid), fid) => (bid.clone(), fid.cloned()),
            _ => return,
        };

        // Get sketch and symmetry axis
        let (axis_line, selected_indices) = {
            let sketch_data = sketch_utils::find_sketch_data_ex(
                &state.scene.scene,
                &body_id,
                feature_id.as_deref(),
            );

            let (sketch, _) = match sketch_data {
                Some(data) => data,
                None => return,
            };

            // Get symmetry axis
            let axis_idx = match sketch.symmetry_axis {
                Some(idx) => idx,
                None => return, // No symmetry axis set
            };

            let axis_line = match sketch.elements.get(axis_idx) {
                Some(shared::SketchElement::Line { start, end }) => {
                    ((start.x, start.y), (end.x, end.y))
                }
                _ => return, // Axis must be a line
            };

            let selected = state.sketch.element_selection.selected.clone();
            (axis_line, selected)
        };

        // Create mirrored elements
        let mut new_elements = Vec::new();

        for &elem_idx in &selected_indices {
            let elem = {
                let sketch_data = sketch_utils::find_sketch_data_ex(
                    &state.scene.scene,
                    &body_id,
                    feature_id.as_deref(),
                );
                match sketch_data {
                    Some((sketch, _)) => sketch.elements.get(elem_idx).cloned(),
                    None => None,
                }
            };

            if let Some(element) = elem {
                let mirrored = reflect_element_about_line(&element, axis_line);
                new_elements.push(mirrored);
            }
        }

        // Apply changes
        if create_copy {
            // Create copies - add new mirrored elements
            for mirrored in new_elements {
                state.scene.add_element_to_body_sketch_ex(&body_id, feature_id.as_deref(), mirrored);
            }
        } else {
            // Move - replace original elements with mirrored versions
            for (idx, mirrored) in selected_indices.iter().zip(new_elements.iter()) {
                state.scene.replace_sketch_element(
                    &body_id,
                    feature_id.as_deref(),
                    *idx,
                    vec![mirrored.clone()],
                );
            }
        }
    }
}
