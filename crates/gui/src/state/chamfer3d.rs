//! 3D Chamfer tool state

/// State for 3D chamfer operation
#[derive(Clone)]
pub struct Chamfer3DState {
    /// Whether chamfer tool is active
    pub active: bool,
    /// Chamfer distance (size of the flat bevel)
    pub distance: f64,
    /// Body ID where edges are being selected
    pub body_id: Option<String>,
}

impl Default for Chamfer3DState {
    fn default() -> Self {
        Self {
            active: false,
            distance: 0.1,
            body_id: None,
        }
    }
}

impl Chamfer3DState {
    /// Activate chamfer tool for a body
    pub fn activate(&mut self, body_id: String) {
        self.active = true;
        self.body_id = Some(body_id);
    }

    /// Activate chamfer tool with optional body (body can be selected later)
    pub fn activate_with_optional_body(&mut self, body_id: Option<String>) {
        self.active = true;
        self.body_id = body_id;
    }

    /// Deactivate chamfer tool
    pub fn deactivate(&mut self) {
        self.active = false;
        self.body_id = None;
    }

    /// Check if chamfer tool is active
    pub fn is_active(&self) -> bool {
        self.active
    }
}
