//! 3D Fillet tool state

/// State for 3D fillet operation
#[derive(Clone)]
pub struct Fillet3DState {
    /// Whether fillet tool is active
    pub active: bool,
    /// Fillet radius
    pub radius: f64,
    /// Number of segments for fillet curve
    pub segments: u32,
    /// Body ID where edges are being selected
    pub body_id: Option<String>,
}

impl Default for Fillet3DState {
    fn default() -> Self {
        Self {
            active: false,
            radius: 0.1,
            segments: 8,
            body_id: None,
        }
    }
}

impl Fillet3DState {
    /// Activate fillet tool for a body
    pub fn activate(&mut self, body_id: String) {
        self.active = true;
        self.body_id = Some(body_id);
    }

    /// Activate fillet tool with optional body (body can be selected later)
    pub fn activate_with_optional_body(&mut self, body_id: Option<String>) {
        self.active = true;
        self.body_id = body_id;
    }

    /// Deactivate fillet tool
    pub fn deactivate(&mut self) {
        self.active = false;
        self.body_id = None;
    }

    /// Check if fillet tool is active
    pub fn is_active(&self) -> bool {
        self.active
    }
}
