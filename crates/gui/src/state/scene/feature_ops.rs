//! Feature add/remove/update operations

use shared::{BodyId, Feature, ObjectId, Primitive, Sketch, Transform};

use super::SceneState;

impl SceneState {
    /// Add a primitive feature to an existing body
    pub fn add_primitive_to_body(
        &mut self,
        body_id: &BodyId,
        primitive: Primitive,
        transform: Transform,
    ) -> bool {
        if !self.scene.bodies.iter().any(|b| &b.id == body_id) {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| &b.id == body_id) {
            let feature_id = uuid::Uuid::new_v4().to_string();
            body.features.push(Feature::BasePrimitive {
                id: feature_id,
                primitive,
                transform,
            });
            self.version += 1;
            true
        } else {
            false
        }
    }

    /// Add a sketch feature to an existing body
    pub fn add_sketch_to_body(
        &mut self,
        body_id: &BodyId,
        sketch: Sketch,
        transform: Transform,
    ) -> Option<String> {
        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| &b.id == body_id) {
            let feature_id = uuid::Uuid::new_v4().to_string();
            body.features.push(Feature::Sketch {
                id: feature_id.clone(),
                sketch,
                transform,
            });
            self.version += 1;
            return Some(feature_id);
        }

        None
    }

    /// Add an extrude feature to a body (boss or cut)
    pub fn add_extrude_to_body(
        &mut self,
        body_id: &BodyId,
        sketch_id: &str,
        height: f64,
        cut: bool,
    ) -> bool {
        self.add_extrude_to_body_ex(body_id, sketch_id, height, cut, false, 0.0)
    }

    /// Add an extrude feature to a body with full parameters
    pub fn add_extrude_to_body_ex(
        &mut self,
        body_id: &BodyId,
        sketch_id: &str,
        height: f64,
        cut: bool,
        symmetric: bool,
        draft_angle: f64,
    ) -> bool {
        if !self.scene.bodies.iter().any(|b| &b.id == body_id) {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| &b.id == body_id) {
            let feature_id = uuid::Uuid::new_v4().to_string();
            body.features.push(Feature::Extrude {
                id: feature_id,
                sketch_id: sketch_id.to_string(),
                height,
                cut,
                symmetric,
                draft_angle,
            });
            self.version += 1;
            true
        } else {
            false
        }
    }

    /// Add a cut extrude feature to a body
    pub fn add_cut_extrude_to_body(
        &mut self,
        body_id: &BodyId,
        sketch_id: &ObjectId,
        height: f64,
    ) {
        self.add_extrude_to_body(body_id, sketch_id, height, true);
    }

    /// Add a revolve feature to a body (boss or cut)
    pub fn add_revolve_to_body(
        &mut self,
        body_id: &BodyId,
        sketch_id: &str,
        angle: f64,
        segments: u32,
        cut: bool,
    ) -> bool {
        if !self.scene.bodies.iter().any(|b| &b.id == body_id) {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| &b.id == body_id) {
            let feature_id = uuid::Uuid::new_v4().to_string();
            body.features.push(Feature::Revolve {
                id: feature_id,
                sketch_id: sketch_id.to_string(),
                angle,
                segments,
                cut,
            });
            self.version += 1;
            true
        } else {
            false
        }
    }

    /// Convert a Sketch feature to BaseExtrude
    pub fn convert_sketch_to_base_extrude(
        &mut self,
        body_id: &BodyId,
        sketch_feature_id: &str,
        height: f64,
    ) -> bool {
        let sketch_data = self.get_body(body_id).and_then(|body| {
            body.features.iter().find_map(|f| {
                if let Feature::Sketch { id, sketch, transform } = f {
                    if id == sketch_feature_id {
                        return Some((sketch.clone(), transform.clone()));
                    }
                }
                None
            })
        });

        let Some((sketch, transform)) = sketch_data else {
            return false;
        };

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| &b.id == body_id) {
            for feature in &mut body.features {
                if let Feature::Sketch { id, .. } = feature {
                    if id == sketch_feature_id {
                        *feature = Feature::BaseExtrude {
                            id: id.clone(),
                            sketch,
                            sketch_transform: transform,
                            height,
                        };
                        self.version += 1;
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Convert a Sketch feature to BaseRevolve
    pub fn convert_sketch_to_base_revolve(
        &mut self,
        body_id: &BodyId,
        sketch_feature_id: &str,
        angle: f64,
        segments: u32,
    ) -> bool {
        let sketch_data = self.get_body(body_id).and_then(|body| {
            body.features.iter().find_map(|f| {
                if let Feature::Sketch { id, sketch, transform } = f {
                    if id == sketch_feature_id {
                        return Some((sketch.clone(), transform.clone()));
                    }
                }
                None
            })
        });

        let Some((sketch, transform)) = sketch_data else {
            return false;
        };

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| &b.id == body_id) {
            for feature in &mut body.features {
                if let Feature::Sketch { id, .. } = feature {
                    if id == sketch_feature_id {
                        *feature = Feature::BaseRevolve {
                            id: id.clone(),
                            sketch,
                            sketch_transform: transform,
                            angle,
                            segments,
                        };
                        self.version += 1;
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Add a BaseExtrude feature to an existing body
    #[allow(dead_code)]
    pub fn add_base_extrude_to_body(
        &mut self,
        body_id: &BodyId,
        sketch: Sketch,
        sketch_transform: Transform,
        height: f64,
    ) -> bool {
        if !self.scene.bodies.iter().any(|b| &b.id == body_id) {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| &b.id == body_id) {
            let feature_id = uuid::Uuid::new_v4().to_string();
            body.features.push(Feature::BaseExtrude {
                id: feature_id,
                sketch,
                sketch_transform,
                height,
            });
            self.version += 1;
            true
        } else {
            false
        }
    }

    /// Add a BaseRevolve feature to an existing body
    pub fn add_base_revolve_to_body(
        &mut self,
        body_id: &BodyId,
        sketch: Sketch,
        sketch_transform: Transform,
        angle: f64,
        segments: u32,
    ) -> bool {
        if !self.scene.bodies.iter().any(|b| &b.id == body_id) {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| &b.id == body_id) {
            let feature_id = uuid::Uuid::new_v4().to_string();
            body.features.push(Feature::BaseRevolve {
                id: feature_id,
                sketch,
                sketch_transform,
                angle,
                segments,
            });
            self.version += 1;
            true
        } else {
            false
        }
    }

    /// Add a feature to an existing body
    pub fn add_feature_to_body(&mut self, body_id: &BodyId, feature: Feature) -> bool {
        if !self.scene.bodies.iter().any(|b| b.id == *body_id) {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == *body_id) {
            body.features.push(feature);
            self.version += 1;
            true
        } else {
            false
        }
    }

    /// Remove a feature from a body
    pub fn remove_feature(&mut self, body_id: &BodyId, feature_id: &ObjectId) -> bool {
        let has_feature = self
            .get_body(body_id)
            .map(|b| b.features.iter().any(|f| f.id() == feature_id))
            .unwrap_or(false);

        if !has_feature {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(body) = self.scene.bodies.iter_mut().find(|b| b.id == *body_id) {
            body.features.retain(|f| f.id() != feature_id);
        }
        self.version += 1;
        true
    }

    /// Update an existing Extrude feature's parameters
    pub fn update_extrude_feature(
        &mut self,
        body_id: &BodyId,
        feature_id: &ObjectId,
        height: f64,
        symmetric: bool,
        draft_angle: f64,
    ) -> bool {
        let is_extrude = self
            .get_feature(body_id, feature_id)
            .map(|f| matches!(f, Feature::Extrude { .. }))
            .unwrap_or(false);

        if !is_extrude {
            return false;
        }

        self.save_undo();
        self.redo_stack.clear();

        if let Some(feature) = self.get_feature_mut(body_id, feature_id) {
            if let Feature::Extrude {
                height: h,
                symmetric: s,
                draft_angle: d,
                ..
            } = feature
            {
                *h = height;
                *s = symmetric;
                *d = draft_angle;
                self.version += 1;
                return true;
            }
        }
        false
    }
}
