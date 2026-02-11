//! Sketch element operations

use shared::{BodyId, Body, Feature, ObjectId, SketchElement};

use super::SceneState;

/// Find the index of a sketch-containing feature in a body.
/// If feature_id is Some, finds that specific feature.
/// If feature_id is None, finds the LAST Sketch, or falls back to BaseExtrude/BaseRevolve.
fn find_sketch_feature_index(body: &Body, feature_id: Option<&str>) -> Option<usize> {
    if let Some(fid) = feature_id {
        // Find specific feature by ID
        body.features.iter().position(|f| match f {
            Feature::Sketch { id, .. } => id == fid,
            Feature::BaseExtrude { id, .. } => id == fid,
            Feature::BaseRevolve { id, .. } => id == fid,
            _ => false,
        })
    } else {
        // First try to find the last standalone Sketch
        body.features
            .iter()
            .rposition(|f| matches!(f, Feature::Sketch { .. }))
            .or_else(|| {
                // Fall back to BaseExtrude or BaseRevolve
                body.features.iter().position(|f| {
                    matches!(f, Feature::BaseExtrude { .. } | Feature::BaseRevolve { .. })
                })
            })
    }
}

impl SceneState {
    /// Add a sketch element to a sketch feature
    pub fn add_sketch_element(
        &mut self,
        body_id: &BodyId,
        sketch_feature_id: &ObjectId,
        element: SketchElement,
    ) -> bool {
        let is_sketch = self
            .get_feature(body_id, sketch_feature_id)
            .map(|f| {
                matches!(
                    f,
                    Feature::Sketch { .. } | Feature::BaseExtrude { .. } | Feature::BaseRevolve { .. }
                )
            })
            .unwrap_or(false);

        if !is_sketch {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(feature) = self.get_feature_mut(body_id, sketch_feature_id) {
            match feature {
                Feature::Sketch { sketch, .. }
                | Feature::BaseExtrude { sketch, .. }
                | Feature::BaseRevolve { sketch, .. } => {
                    sketch.elements.push(element);
                    self.version += 1;
                    return true;
                }
                _ => {}
            }
        }
        false
    }

    /// Add a sketch element to a sketch feature in a body
    /// If feature_id is Some, adds to that specific feature
    /// If feature_id is None, adds to the LAST Sketch feature, or falls back to BaseExtrude/BaseRevolve
    pub fn add_element_to_body_sketch_ex(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        element: SketchElement,
    ) {
        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return,
                };
                sketch.elements.push(element);
                self.version += 1;
            }
        }
    }

    /// Add a sketch element to the last sketch feature in a body
    pub fn add_element_to_body_sketch(&mut self, body_id: &str, element: SketchElement) {
        self.add_element_to_body_sketch_ex(body_id, None, element);
    }

    /// Remove sketch elements by indices
    pub fn remove_sketch_elements(
        &mut self,
        body_id: &BodyId,
        sketch_feature_id: &ObjectId,
        indices: &[usize],
    ) -> bool {
        if indices.is_empty() {
            return false;
        }

        let is_sketch = self
            .get_feature(body_id, sketch_feature_id)
            .map(|f| {
                matches!(
                    f,
                    Feature::Sketch { .. } | Feature::BaseExtrude { .. } | Feature::BaseRevolve { .. }
                )
            })
            .unwrap_or(false);

        if !is_sketch {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(feature) = self.get_feature_mut(body_id, sketch_feature_id) {
            let sketch = match feature {
                Feature::Sketch { sketch, .. }
                | Feature::BaseExtrude { sketch, .. }
                | Feature::BaseRevolve { sketch, .. } => sketch,
                _ => return false,
            };

            for &idx in indices {
                if idx < sketch.elements.len() {
                    sketch.elements.remove(idx);
                }
            }
            self.version += 1;
            true
        } else {
            false
        }
    }

    /// Remove a single sketch element by index
    /// If feature_id is Some, removes from that specific feature
    /// If feature_id is None, removes from the LAST Sketch feature, or falls back to BaseExtrude/BaseRevolve
    pub fn remove_sketch_element(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        element_index: usize,
    ) {
        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return,
                };
                if element_index < sketch.elements.len() {
                    sketch.elements.remove(element_index);
                    self.version += 1;
                }
            }
        }
    }

    /// Replace a sketch element with one or more new elements
    /// If feature_id is Some, operates on that specific feature
    /// If feature_id is None, operates on the LAST Sketch feature, or falls back to BaseExtrude/BaseRevolve
    pub fn replace_sketch_element(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        element_index: usize,
        new_elements: Vec<SketchElement>,
    ) {
        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return,
                };
                if element_index < sketch.elements.len() {
                    // Remove the original element
                    sketch.elements.remove(element_index);
                    // Insert new elements at the same position
                    for (i, elem) in new_elements.into_iter().enumerate() {
                        sketch.elements.insert(element_index + i, elem);
                    }
                    self.version += 1;
                }
            }
        }
    }

    /// Toggle construction geometry flag for sketch elements
    pub fn toggle_construction(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        element_indices: &[usize],
    ) {
        if element_indices.is_empty() {
            return;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return,
                };

                for &elem_idx in element_indices {
                    if elem_idx < sketch.elements.len() {
                        let current = sketch.is_construction(elem_idx);
                        sketch.set_construction(elem_idx, !current);
                    }
                }
                self.version += 1;
            }
        }
    }

    /// Toggle revolve axis for a sketch element (only one axis per sketch)
    pub fn toggle_revolve_axis(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        element_index: usize,
    ) {
        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return,
                };

                // Check that element exists and is a line
                if element_index < sketch.elements.len() {
                    if matches!(sketch.elements[element_index], shared::SketchElement::Line { .. }) {
                        sketch.toggle_revolve_axis(element_index);
                        self.version += 1;
                    }
                }
            }
        }
    }

    /// Remove selected sketch elements by indices (handles multiple at once, sorted descending)
    pub fn remove_sketch_elements_by_indices(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        mut indices: Vec<usize>,
    ) {
        if indices.is_empty() {
            return;
        }

        // Sort in descending order to remove from the end first
        indices.sort_by(|a, b| b.cmp(a));

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return,
                };

                for elem_idx in indices {
                    if elem_idx < sketch.elements.len() {
                        sketch.elements.remove(elem_idx);
                        // Also remove construction flag if exists
                        if elem_idx < sketch.construction.len() {
                            sketch.construction.remove(elem_idx);
                        }
                    }
                }
                self.version += 1;
            }
        }
    }

    /// Update a control point of a sketch element
    pub fn update_sketch_element_point(
        &mut self,
        body_id: &BodyId,
        sketch_feature_id: &ObjectId,
        element_index: usize,
        point_index: usize,
        new_pos: [f64; 2],
    ) -> bool {
        if let Some(feature) = self.get_feature_mut(body_id, sketch_feature_id) {
            let sketch = match feature {
                Feature::Sketch { sketch, .. }
                | Feature::BaseExtrude { sketch, .. }
                | Feature::BaseRevolve { sketch, .. } => sketch,
                _ => return false,
            };

            if let Some(elem) = sketch.elements.get_mut(element_index) {
                update_element_point(elem, point_index, new_pos);
                self.version += 1;
                return true;
            }
        }
        false
    }

    /// Update a control point of a sketch element (with feature_id as Option<&str>)
    /// This version doesn't save undo - caller should call save_undo() before first update
    pub fn update_sketch_element_point_ex(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        element_index: usize,
        point_index: usize,
        new_pos: [f64; 2],
    ) -> bool {
        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return false,
                };

                if let Some(elem) = sketch.elements.get_mut(element_index) {
                    update_element_point(elem, point_index, new_pos);
                    self.version += 1;
                    return true;
                }
            }
        }
        false
    }

    /// Begin a drag operation - saves undo state
    pub fn begin_sketch_drag(&mut self) {
        self.save_undo();
        self.redo_stack.clear();
    }

    /// Apply constraints solver to the sketch
    /// Call this after updating element positions during drag
    pub fn solve_sketch_constraints(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
    ) {
        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return,
                };

                if !sketch.constraints.is_empty() {
                    crate::sketch::constraints::solve_constraints(sketch);
                }
            }
        }
    }

    /// Add a constraint to a sketch
    pub fn add_sketch_constraint(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        constraint: shared::SketchConstraint,
    ) {
        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return,
                };

                // Check if constraint can be applied
                if crate::sketch::constraints::can_apply_constraint(sketch, &constraint) {
                    sketch.constraints.push(constraint);
                    // Apply constraints immediately
                    crate::sketch::constraints::solve_constraints(sketch);
                    self.version += 1;
                }
            }
        }
    }

    /// Remove a constraint from a sketch by index
    pub fn remove_sketch_constraint(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        constraint_index: usize,
    ) {
        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(idx) = find_sketch_feature_index(body, feature_id) {
                let sketch = match &mut body.features[idx] {
                    Feature::Sketch { sketch, .. }
                    | Feature::BaseExtrude { sketch, .. }
                    | Feature::BaseRevolve { sketch, .. } => sketch,
                    _ => return,
                };

                if constraint_index < sketch.constraints.len() {
                    sketch.constraints.remove(constraint_index);
                    self.version += 1;
                }
            }
        }
    }
}

/// Update a control point of a sketch element
fn update_element_point(elem: &mut SketchElement, point_index: usize, new_pos: [f64; 2]) {
    match elem {
        SketchElement::Line { start, end } => match point_index {
            0 => {
                start.x = new_pos[0];
                start.y = new_pos[1];
            }
            1 => {
                end.x = new_pos[0];
                end.y = new_pos[1];
            }
            _ => {}
        },
        SketchElement::Circle { center, radius } => match point_index {
            0 => {
                center.x = new_pos[0];
                center.y = new_pos[1];
            }
            1 => {
                let dx = new_pos[0] - center.x;
                let dy = new_pos[1] - center.y;
                *radius = (dx * dx + dy * dy).sqrt();
            }
            _ => {}
        },
        SketchElement::Arc {
            center,
            radius,
            start_angle,
            end_angle,
        } => match point_index {
            0 => {
                center.x = new_pos[0];
                center.y = new_pos[1];
            }
            1 => {
                let dx = new_pos[0] - center.x;
                let dy = new_pos[1] - center.y;
                *radius = (dx * dx + dy * dy).sqrt();
                *start_angle = dy.atan2(dx);
            }
            2 => {
                let dx = new_pos[0] - center.x;
                let dy = new_pos[1] - center.y;
                *end_angle = dy.atan2(dx);
            }
            _ => {}
        },
        SketchElement::Rectangle {
            corner,
            width,
            height,
        } => match point_index {
            0 => {
                let old_x1 = corner.x + *width;
                let old_y1 = corner.y + *height;
                corner.x = new_pos[0];
                corner.y = new_pos[1];
                *width = old_x1 - new_pos[0];
                *height = old_y1 - new_pos[1];
            }
            1 => {
                *width = new_pos[0] - corner.x;
            }
            2 => {
                *width = new_pos[0] - corner.x;
                *height = new_pos[1] - corner.y;
            }
            3 => {
                *height = new_pos[1] - corner.y;
            }
            _ => {}
        },
        SketchElement::Polyline { points } | SketchElement::Spline { points } => {
            if let Some(pt) = points.get_mut(point_index) {
                pt.x = new_pos[0];
                pt.y = new_pos[1];
            }
        }
        SketchElement::Dimension { from, to, .. } => match point_index {
            0 => {
                from.x = new_pos[0];
                from.y = new_pos[1];
            }
            1 => {
                to.x = new_pos[0];
                to.y = new_pos[1];
            }
            _ => {}
        },
    }
}
