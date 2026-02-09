// Library crate: exposes testable modules for integration tests and AI agent interface.
// GUI-specific modules (app, ui, viewport rendering) remain in the binary crate.

pub mod build;
pub mod command;
pub mod export;
pub mod extrude;
pub mod fixtures;
pub mod harness;
pub mod helpers;
pub mod state;
pub mod validation;

/// Subset of viewport types needed by build/extrude (MeshData, Aabb, Ray, picking).
/// The full viewport (camera, renderer, GL) stays in the binary crate.
pub mod viewport {
    pub mod mesh;
    pub mod picking;
}
