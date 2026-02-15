//! Types and result structures for sketch operations

use shared::SketchElement;

/// Result of a trim operation
#[derive(Debug, Clone)]
pub enum TrimResult {
    /// The element was completely removed
    Removed,
    /// The element was trimmed and replaced with new element(s)
    Replaced(Vec<SketchElement>),
    /// Nothing happened (no intersection found)
    NoChange,
}

/// Result of a fillet operation
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct FilletResult {
    /// The arc that forms the fillet
    pub fillet_arc: SketchElement,
    /// Modified first element (trimmed to fillet)
    pub elem1: Option<SketchElement>,
    /// Modified second element (trimmed to fillet)
    pub elem2: Option<SketchElement>,
}

/// Result of sketch validation for extrusion
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SketchValidation {
    pub is_valid: bool,
    pub is_closed: bool,
    pub has_self_intersections: bool,
    pub error_message: Option<String>,
}

/// Intersection info with parameter along the element being trimmed
#[derive(Clone, Debug)]
pub struct Intersection {
    /// Parameter (0..1) along the element
    pub param: f64,
    /// Point of intersection
    pub point: kurbo::Point,
}

/// Intersection info for polylines - tracks segment index and position within segment
#[derive(Clone, Debug)]
pub struct PolylineIntersection {
    /// Which segment (0..n-1)
    pub segment_idx: usize,
    /// 0..1 position within segment
    pub segment_t: f64,
    /// Point of intersection
    pub point: kurbo::Point,
}
