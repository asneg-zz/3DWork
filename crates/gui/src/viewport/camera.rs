use glam::{Mat4, Vec3, Vec4};
use shared::SketchPlane;

use super::picking::Ray;

/// Arc-ball camera for 3D viewport
pub struct ArcBallCamera {
    /// Horizontal rotation angle (radians)
    pub yaw: f32,
    /// Vertical rotation angle (radians)
    pub pitch: f32,
    /// Distance from target
    pub distance: f32,
    /// Camera target point
    pub target: Vec3,
    /// Vertical field of view (radians)
    pub fov: f32,
}

impl ArcBallCamera {
    pub fn new() -> Self {
        Self {
            yaw: 0.6,
            pitch: 0.4,
            distance: 6.0,
            target: Vec3::ZERO,
            fov: 45.0_f32.to_radians(),
        }
    }

    pub fn rotate(&mut self, dx: f32, dy: f32) {
        self.yaw += dx.to_radians();
        self.pitch = (self.pitch + dy.to_radians()).clamp(-1.5, 1.5);
    }

    pub fn zoom(&mut self, delta: f32) {
        self.distance = (self.distance * (1.0 - delta)).clamp(0.5, 100.0);
    }

    pub fn pan(&mut self, dx: f32, dy: f32) {
        let right = self.right_vector();
        let up = self.up_vector();
        let offset = right * dx + up * dy;
        self.target += offset;
    }

    /// Align camera to look perpendicular to a sketch plane
    pub fn align_to_sketch_plane(&mut self, plane: SketchPlane, target_point: Vec3) {
        self.target = target_point;
        match plane {
            // XY plane: look along -Z (from front)
            SketchPlane::Xy => {
                self.yaw = 0.0;
                self.pitch = 0.0;
            }
            // XZ plane: look from above (along -Y)
            SketchPlane::Xz => {
                self.yaw = 0.0;
                self.pitch = 1.5; // ~86 degrees, close to looking straight down
            }
            // YZ plane: look along -X (from side)
            SketchPlane::Yz => {
                self.yaw = std::f32::consts::FRAC_PI_2; // 90 degrees
                self.pitch = 0.0;
            }
        }
    }

    /// Camera position in world space
    pub fn eye_position(&self) -> Vec3 {
        let cy = self.yaw.cos();
        let sy = self.yaw.sin();
        let cp = self.pitch.cos();
        let sp = self.pitch.sin();

        self.target
            + Vec3::new(
                self.distance * cp * sy,
                self.distance * sp,
                self.distance * cp * cy,
            )
    }

    /// View matrix (world -> camera)
    pub fn view_matrix(&self) -> Mat4 {
        Mat4::look_at_rh(self.eye_position(), self.target, Vec3::Y)
    }

    /// Projection matrix (camera -> clip)
    pub fn projection_matrix(&self, aspect: f32) -> Mat4 {
        Mat4::perspective_rh_gl(self.fov, aspect, 0.1, 200.0)
    }

    /// Combined view-projection matrix
    pub fn view_projection(&self, aspect: f32) -> Mat4 {
        self.projection_matrix(aspect) * self.view_matrix()
    }

    fn right_vector(&self) -> Vec3 {
        let fwd = (self.target - self.eye_position()).normalize_or_zero();
        fwd.cross(Vec3::Y).normalize_or_zero()
    }

    fn up_vector(&self) -> Vec3 {
        let fwd = (self.target - self.eye_position()).normalize_or_zero();
        let right = self.right_vector();
        right.cross(fwd).normalize_or_zero()
    }

    /// Project a 3D point to 2D screen coords (for overlay text)
    pub fn project(&self, point: [f32; 3], rect: egui::Rect) -> Option<egui::Pos2> {
        let aspect = rect.width() / rect.height();
        let vp = self.view_projection(aspect);
        let p = vp * Vec4::new(point[0], point[1], point[2], 1.0);
        if p.w <= 0.0 {
            return None;
        }
        let ndc = p.truncate() / p.w;
        let screen_x = rect.center().x + ndc.x * rect.width() * 0.5;
        let screen_y = rect.center().y - ndc.y * rect.height() * 0.5;
        Some(egui::pos2(screen_x, screen_y))
    }

    /// Cast a ray from a screen position into the 3D scene
    pub fn screen_ray(&self, screen_pos: egui::Pos2, rect: egui::Rect) -> Ray {
        let aspect = rect.width() / rect.height();

        // Screen → NDC
        let ndc_x = (screen_pos.x - rect.center().x) / (rect.width() * 0.5);
        let ndc_y = -(screen_pos.y - rect.center().y) / (rect.height() * 0.5);

        // Inverse view-projection
        let vp_inv = self.view_projection(aspect).inverse();

        // Unproject near and far points
        let near_ndc = Vec4::new(ndc_x, ndc_y, -1.0, 1.0);
        let far_ndc = Vec4::new(ndc_x, ndc_y, 1.0, 1.0);

        let near_world = vp_inv * near_ndc;
        let far_world = vp_inv * far_ndc;

        let near = near_world.truncate() / near_world.w;
        let far = far_world.truncate() / far_world.w;

        let direction = (far - near).normalize_or_zero();

        Ray {
            origin: self.eye_position(),
            direction,
        }
    }
}
