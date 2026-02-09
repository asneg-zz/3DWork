use axum::{
    body::Body,
    extract::State,
    http::{header, StatusCode},
    response::{Json, Response},
};
use serde_json::{json, Value};

use crate::AppState;
use crate::ai;
use crate::build;
use shared::{AiChatRequest, AiChatResponse, SceneDescription};

/// Health check
pub async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

/// AI chat endpoint
pub async fn chat(
    State(state): State<AppState>,
    Json(request): Json<AiChatRequest>,
) -> Result<Json<AiChatResponse>, StatusCode> {
    let response = ai::process_chat(&state, &request)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(response))
}

/// List projects (stub)
pub async fn list_projects() -> Json<Value> {
    Json(json!({ "projects": [] }))
}

/// Build scene → GLB binary
pub async fn build_glb(
    Json(scene): Json<SceneDescription>,
) -> Result<Response, StatusCode> {
    let glb_bytes = tokio::task::spawn_blocking(move || build::build_scene_glb(&scene))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|e| {
            tracing::error!("Build error: {}", e);
            StatusCode::BAD_REQUEST
        })?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "model/gltf-binary")
        .header(header::CONTENT_DISPOSITION, "inline; filename=\"scene.glb\"")
        .body(Body::from(glb_bytes))
        .unwrap())
}

/// Inspect scene → JSON metrics
pub async fn inspect(
    Json(scene): Json<SceneDescription>,
) -> Result<Json<Value>, StatusCode> {
    let info = tokio::task::spawn_blocking(move || build::inspect_scene(&scene))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|e| {
            tracing::error!("Inspect error: {}", e);
            StatusCode::BAD_REQUEST
        })?;

    Ok(Json(info))
}

/// Create project (stub)
pub async fn create_project(
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    let id = uuid::Uuid::new_v4().to_string();
    (
        StatusCode::CREATED,
        Json(json!({ "id": id, "name": body.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled") })),
    )
}
