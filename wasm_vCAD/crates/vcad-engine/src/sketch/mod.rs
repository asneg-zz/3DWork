//! Sketch geometry operations module
//!
//! This module provides operations for manipulating sketch elements:
//! - Trim: Remove parts of elements at intersections
//! - Fillet: Create rounded corners at element intersections
//! - Offset: Create parallel copies of elements
//! - Pattern: Linear and circular arrays of elements
//! - Validation: Check sketch integrity for extrusion
//! - Constraints: Geometric constraints solver

pub mod types;
pub mod geometry;
pub mod trim;
pub mod fillet;
pub mod offset;
pub mod pattern;
mod validation;
pub mod constraints;

// Re-export the old operations module for backward compatibility
pub mod operations {
    //! Re-exports for backward compatibility with existing code

    pub use super::types::{TrimResult, FilletResult, SketchValidation};
    pub use super::trim::{trim_line, trim_arc, trim_circle, trim_polyline, trim_rectangle};
    pub use super::fillet::fillet_lines;
    pub use super::offset::{offset_line, offset_circle, offset_arc, offset_rectangle, offset_polyline, offset_spline, offset_element};
    pub use super::validation::{validate_sketch_for_extrusion, check_contour_closed, check_self_intersections};
    pub use super::geometry::reflect_element_about_line;
    pub use super::pattern::{linear_pattern, circular_pattern};
}
