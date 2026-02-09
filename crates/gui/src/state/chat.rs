use shared::SceneDescriptionV2;

/// Role of a chat message
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChatRole {
    User,
    Assistant,
}

/// A single chat message
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub text: String,
    pub is_error: bool,
}

/// Chat state - temporarily simplified for V2 migration
#[derive(Default)]
pub struct ChatState {
    pub messages: Vec<ChatMessage>,
    pub input: String,
    pub is_loading: bool,
    pub last_failed_input: Option<String>,
}

impl ChatState {
    /// Send a message - TODO: implement for V2
    pub fn send_message(&mut self, _scene: &SceneDescriptionV2) {
        let text = self.input.trim().to_string();
        if text.is_empty() {
            return;
        }

        self.messages.push(ChatMessage {
            role: ChatRole::User,
            text: text.clone(),
            is_error: false,
        });

        self.messages.push(ChatMessage {
            role: ChatRole::Assistant,
            text: "AI chat is being updated for the new Body-based architecture. Coming soon!".to_string(),
            is_error: false,
        });

        self.input.clear();
    }

    /// Poll for responses - currently no-op
    pub fn poll_responses(
        &mut self,
        _scene: &mut super::scene::SceneState,
    ) -> Option<Vec<String>> {
        None
    }

    /// Retry - currently no-op
    pub fn retry(&mut self, _scene: &SceneDescriptionV2) {}

    pub fn clear(&mut self) {
        self.messages.clear();
        self.input.clear();
        self.last_failed_input = None;
    }
}
