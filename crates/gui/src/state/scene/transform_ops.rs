//! Transform/drag operations

use shared::{BodyId, Feature};

use super::SceneState;

impl SceneState {
    /// Save undo state once at the beginning of a drag operation
    pub fn begin_drag(&mut self) {
        self.save_undo();
        self.version += 1;
    }

    /// Apply a translation delta to a body's base feature transform
    pub fn apply_translate_delta(&mut self, body_id: &BodyId, dx: f64, dy: f64, dz: f64) {
        if let Some(body) = self.get_body_mut(body_id) {
            for feature in &mut body.features {
                let transform = match feature {
                    Feature::BasePrimitive { transform, .. } => transform,
                    Feature::BaseExtrude {
                        sketch_transform, ..
                    } => sketch_transform,
                    Feature::BaseRevolve {
                        sketch_transform, ..
                    } => sketch_transform,
                    Feature::Sketch { transform, .. } => transform,
                    _ => continue,
                };

                transform.position[0] += dx;
                transform.position[1] += dy;
                transform.position[2] += dz;
                self.version += 1;
                return;
            }
        }
    }
}
