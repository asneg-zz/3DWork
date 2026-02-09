//! Sketch element operations

use shared::{BodyId, Feature, ObjectId, SketchElement};

use super::SceneState;

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
    /// If feature_id is None, adds to the LAST Sketch feature
    pub fn add_element_to_body_sketch_ex(
        &mut self,
        body_id: &str,
        feature_id: Option<&str>,
        element: SketchElement,
    ) {
        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == body_id) {
            if let Some(fid) = feature_id {
                for feature in &mut body.features {
                    if let Feature::Sketch { id, sketch, .. } = feature {
                        if id == fid {
                            sketch.elements.push(element);
                            self.version += 1;
                            return;
                        }
                    }
                }
            } else {
                let last_sketch_idx = body
                    .features
                    .iter()
                    .rposition(|f| matches!(f, Feature::Sketch { .. }));
                if let Some(idx) = last_sketch_idx {
                    if let Feature::Sketch { sketch, .. } = &mut body.features[idx] {
                        sketch.elements.push(element);
                        self.version += 1;
                        return;
                    }
                }
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
