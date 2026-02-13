use shared::ObjectId;
use glam::Vec3;

/// Represents a selected face (group of coplanar triangles) on an object
#[derive(Clone, Debug)]
pub struct FaceSelection {
    pub object_id: ObjectId,
    /// Indices of triangles in this face (index into mesh.indices / 3)
    pub triangle_indices: Vec<usize>,
    /// Face normal vector
    pub normal: [f32; 3],
    /// Face area in square units
    pub area: f32,
}

/// Represents a selected edge on an object
#[derive(Clone, Debug)]
pub struct EdgeSelection {
    pub object_id: ObjectId,
    /// Edge start point
    pub start: Vec3,
    /// Edge end point
    pub end: Vec3,
    /// Normal of first adjacent face
    pub normal1: Vec3,
    /// Normal of second adjacent face (if exists)
    pub normal2: Option<Vec3>,
    /// Index of this edge in the extracted edges list
    pub edge_index: usize,
}

impl EdgeSelection {
    /// Get edge length
    pub fn length(&self) -> f32 {
        (self.end - self.start).length()
    }

    /// Get edge direction (normalized)
    pub fn direction(&self) -> Vec3 {
        (self.end - self.start).normalize()
    }

    /// Get edge midpoint
    pub fn midpoint(&self) -> Vec3 {
        (self.start + self.end) * 0.5
    }
}

/// Object selection state (supports multi-select)
#[derive(Default)]
pub struct SelectionState {
    /// Selected object IDs (in order of selection)
    selected: Vec<ObjectId>,
    /// Index of the selected sketch element (when editing a sketch)
    pub selected_element_index: Option<usize>,
    /// Selected face on an object (for face picking)
    pub selected_face: Option<FaceSelection>,
    /// Version counter for face selection changes (for cache invalidation)
    pub face_selection_version: u64,
    /// Selected edges on objects (for fillet/chamfer operations)
    pub selected_edges: Vec<EdgeSelection>,
    /// Version counter for edge selection changes
    pub edge_selection_version: u64,
    /// Currently hovered edge (for visual feedback)
    pub hovered_edge: Option<EdgeSelection>,
}

impl SelectionState {
    /// Primary (first) selected object
    pub fn primary(&self) -> Option<&ObjectId> {
        self.selected.first()
    }

    /// All selected objects
    pub fn all(&self) -> &[ObjectId] {
        &self.selected
    }

    /// Check if an object is selected
    pub fn is_selected(&self, id: &str) -> bool {
        self.selected.iter().any(|s| s == id)
    }

    /// Select a single object (clears previous selection)
    pub fn select(&mut self, id: ObjectId) {
        self.selected.clear();
        self.selected.push(id);
        self.selected_element_index = None;
        self.clear_face();
    }

    /// Select a body by ID (alias for select)
    pub fn select_body(&mut self, body_id: String) {
        self.select(body_id);
    }

    /// Toggle selection (Ctrl+click behavior)
    pub fn toggle(&mut self, id: ObjectId) {
        if let Some(pos) = self.selected.iter().position(|s| s == &id) {
            self.selected.remove(pos);
        } else {
            self.selected.push(id);
        }
        self.selected_element_index = None;
        self.clear_face();
    }

    /// Clear all selection
    pub fn clear(&mut self) {
        self.selected.clear();
        self.selected_element_index = None;
        self.clear_face();
    }

    /// Number of selected objects
    pub fn count(&self) -> usize {
        self.selected.len()
    }

    /// Select a face on an object
    pub fn select_face(&mut self, face: FaceSelection) {
        self.selected_face = Some(face);
        self.face_selection_version += 1;
    }

    /// Clear face selection
    pub fn clear_face(&mut self) {
        if self.selected_face.is_some() {
            self.selected_face = None;
            self.face_selection_version += 1;
        }
    }

    /// Check if a face is selected on a given object
    pub fn has_face_on(&self, object_id: &str) -> bool {
        self.selected_face
            .as_ref()
            .map(|f| f.object_id == object_id)
            .unwrap_or(false)
    }

    /// Add an edge to selection (supports multi-select with Ctrl)
    pub fn add_edge(&mut self, edge: EdgeSelection) {
        // Check if already selected (by edge_index and object_id)
        let already_selected = self.selected_edges.iter()
            .any(|e| e.object_id == edge.object_id && e.edge_index == edge.edge_index);

        if !already_selected {
            self.selected_edges.push(edge);
            self.edge_selection_version += 1;
        }
    }

    /// Toggle edge selection
    pub fn toggle_edge(&mut self, edge: EdgeSelection) {
        if let Some(pos) = self.selected_edges.iter()
            .position(|e| e.object_id == edge.object_id && e.edge_index == edge.edge_index)
        {
            self.selected_edges.remove(pos);
        } else {
            self.selected_edges.push(edge);
        }
        self.edge_selection_version += 1;
    }

    /// Select a single edge (clears previous edge selection)
    pub fn select_edge(&mut self, edge: EdgeSelection) {
        self.selected_edges.clear();
        self.selected_edges.push(edge);
        self.edge_selection_version += 1;
    }

    /// Clear edge selection
    pub fn clear_edges(&mut self) {
        if !self.selected_edges.is_empty() {
            self.selected_edges.clear();
            self.edge_selection_version += 1;
        }
    }

    /// Check if any edges are selected
    pub fn has_edges(&self) -> bool {
        !self.selected_edges.is_empty()
    }

    /// Get selected edges count
    pub fn edge_count(&self) -> usize {
        self.selected_edges.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_empty() {
        let s = SelectionState::default();
        assert!(s.primary().is_none());
        assert!(s.all().is_empty());
        assert_eq!(s.count(), 0);
    }

    #[test]
    fn test_select_single() {
        let mut s = SelectionState::default();
        s.select("a".to_string());
        assert_eq!(s.primary(), Some(&"a".to_string()));
        assert_eq!(s.count(), 1);
        assert!(s.is_selected("a"));
    }

    #[test]
    fn test_select_clears_previous() {
        let mut s = SelectionState::default();
        s.select("a".to_string());
        s.select("b".to_string());
        assert_eq!(s.count(), 1);
        assert!(!s.is_selected("a"));
        assert!(s.is_selected("b"));
    }

    #[test]
    fn test_toggle_add() {
        let mut s = SelectionState::default();
        s.select("a".to_string());
        s.toggle("b".to_string());
        assert_eq!(s.count(), 2);
        assert!(s.is_selected("a"));
        assert!(s.is_selected("b"));
    }

    #[test]
    fn test_toggle_remove() {
        let mut s = SelectionState::default();
        s.select("a".to_string());
        s.toggle("b".to_string());
        s.toggle("a".to_string());
        assert_eq!(s.count(), 1);
        assert!(!s.is_selected("a"));
        assert!(s.is_selected("b"));
    }

    #[test]
    fn test_clear() {
        let mut s = SelectionState::default();
        s.select("a".to_string());
        s.toggle("b".to_string());
        s.clear();
        assert_eq!(s.count(), 0);
        assert!(s.primary().is_none());
    }

    #[test]
    fn test_primary_returns_first() {
        let mut s = SelectionState::default();
        s.select("a".to_string());
        s.toggle("b".to_string());
        s.toggle("c".to_string());
        assert_eq!(s.primary(), Some(&"a".to_string()));
    }

    #[test]
    fn test_all_preserves_order() {
        let mut s = SelectionState::default();
        s.select("a".to_string());
        s.toggle("b".to_string());
        s.toggle("c".to_string());
        assert_eq!(s.all(), &["a".to_string(), "b".to_string(), "c".to_string()]);
    }

    #[test]
    fn test_select_clears_element_index() {
        let mut s = SelectionState::default();
        s.selected_element_index = Some(5);
        s.select("a".to_string());
        assert!(s.selected_element_index.is_none());
    }

    #[test]
    fn test_toggle_clears_element_index() {
        let mut s = SelectionState::default();
        s.selected_element_index = Some(3);
        s.toggle("a".to_string());
        assert!(s.selected_element_index.is_none());
    }

    #[test]
    fn test_clear_clears_element_index() {
        let mut s = SelectionState::default();
        s.selected_element_index = Some(1);
        s.clear();
        assert!(s.selected_element_index.is_none());
    }
}
