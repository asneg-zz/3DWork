//! 3D viewport panel with OpenGL rendering

mod camera;
mod context_menu;
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

        // ── Sketch interaction handling ─────────────────────────────
        let sketch_consumed = self.handle_sketch_interaction(ui, &response, rect, state);
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

        // ── Right-click context menu on object ──────────────────
        self.handle_right_click(&response, rect, sketch_consumed, mod_tool_consumed);

        // ── Context menu ──────────────────────────────────
        let ctx_actions = self.show_context_menu(&response, state);
        self.apply_context_actions(ctx_actions, state);

        // ── Sketch element context menu ──────────────────
        self.show_sketch_element_context_menu(ui, &response, state);

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

                            state.sketch.add_point(point_2d);
                            sketch_consumed = true;

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
        use crate::sketch::operations::{trim_arc, trim_circle, trim_line, trim_polyline, trim_rectangle, TrimResult};
        use crate::state::sketch::SketchTool;

        // Only process if in sketch edit mode and using a modification tool
        if !state.sketch.is_editing() {
            return false;
        }

        let is_mod_tool = matches!(
            state.sketch.tool,
            SketchTool::Trim | SketchTool::Fillet | SketchTool::Offset
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
        let hit = match sketch_interact::hit_test_elements(click_2d, &sketch, hit_tolerance) {
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
            SketchTool::Fillet | SketchTool::Offset => {
                // Fillet and Offset not implemented yet
                false
            }
            _ => false,
        }
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

    fn draw_overlays(&self, ui: &mut Ui, rect: egui::Rect, state: &AppState) {
        let painter = ui.painter_at(rect);

        // Axis labels
        overlays::draw_axis_labels(&painter, rect, &self.camera);

        // Camera info overlay
        self.draw_camera_info(&painter, rect);

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
    }

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
}
