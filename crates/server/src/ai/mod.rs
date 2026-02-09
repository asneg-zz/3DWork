use shared::{AiChatRequest, AiChatResponse, SceneOperation};
use crate::AppState;

const SYSTEM_PROMPT: &str = r#"
You are a 3D CAD assistant. You help users create 3D models by generating scene operations.

Available primitives:
- cube: { "type": "cube", "width": f64, "height": f64, "depth": f64 }
- cylinder: { "type": "cylinder", "radius": f64, "height": f64 }
- sphere: { "type": "sphere", "radius": f64 }
- cone: { "type": "cone", "radius": f64, "height": f64 }

Available operations:
- create_primitive: Create a new primitive with id, primitive definition, and transform (position, rotation, scale)
- boolean: CSG operation (union, difference, intersection) between two objects by their ids

Respond with JSON containing "text" (explanation) and "operations" (array of SceneOperation).

Example response:
{
    "text": "I'll create a cube with a cylindrical hole through it.",
    "operations": [
        {
            "type": "create_primitive",
            "id": "base",
            "primitive": { "type": "cube", "width": 10, "height": 10, "depth": 10 },
            "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] }
        },
        {
            "type": "create_primitive",
            "id": "hole",
            "primitive": { "type": "cylinder", "radius": 3, "height": 20 },
            "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] }
        },
        {
            "type": "boolean",
            "id": "result",
            "op": "difference",
            "left": "base",
            "right": "hole"
        }
    ]
}
"#;

pub async fn process_chat(
    state: &AppState,
    request: &AiChatRequest,
) -> Result<AiChatResponse, Box<dyn std::error::Error + Send + Sync>> {
    let api_key = state
        .ai_api_key
        .as_ref()
        .ok_or("ANTHROPIC_API_KEY not set")?;

    let scene_context = serde_json::to_string(&request.scene)?;

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 4096,
            "system": SYSTEM_PROMPT,
            "messages": [
                {
                    "role": "user",
                    "content": format!(
                        "Current scene:\n{}\n\nUser request: {}",
                        scene_context, request.message
                    )
                }
            ]
        }))
        .send()
        .await?;

    let body: serde_json::Value = response.json().await?;

    // Извлекаем текст из ответа Claude
    let content_text = body["content"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|block| block["text"].as_str())
        .unwrap_or("{}");

    // Парсим JSON из ответа
    let parsed: serde_json::Value = serde_json::from_str(content_text).unwrap_or_else(|_| {
        serde_json::json!({
            "text": content_text,
            "operations": []
        })
    });

    let text = parsed["text"]
        .as_str()
        .unwrap_or("Done")
        .to_string();

    let operations: Vec<SceneOperation> = parsed
        .get("operations")
        .and_then(|ops| serde_json::from_value(ops.clone()).ok())
        .unwrap_or_default();

    Ok(AiChatResponse { text, operations })
}
