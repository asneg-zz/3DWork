use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::CorsLayer;

mod routes;
mod ai;
mod build;
mod storage;

#[derive(Clone)]
pub struct AppState {
    pub ai_api_key: Option<String>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = AppState {
        ai_api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
    };

    let app = Router::new()
        .route("/api/health", get(routes::health))
        .route("/api/chat", post(routes::chat))
        .route("/api/build", post(routes::build_glb))
        .route("/api/inspect", post(routes::inspect))
        .route("/api/projects", get(routes::list_projects))
        .route("/api/projects", post(routes::create_project))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    tracing::info!("Server running on http://localhost:3001");
    axum::serve(listener, app).await.unwrap();
}
