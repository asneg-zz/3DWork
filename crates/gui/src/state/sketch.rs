use shared::{ObjectId, Point2D, SketchElement};

// ============================================================================
// Snap (привязки)
// ============================================================================

/// Тип точки привязки
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SnapType {
    /// Конечная точка (концы линий, вершины прямоугольников)
    Endpoint,
    /// Середина линии
    Midpoint,
    /// Центр круга/дуги
    Center,
    /// Квадрант круга (0°, 90°, 180°, 270°)
    Quadrant,
    /// Пересечение двух элементов
    Intersection,
    /// Привязка к сетке
    Grid,
}

/// Точка привязки с информацией о типе и источнике
#[derive(Debug, Clone)]
pub struct SnapPoint {
    /// Координаты точки в 2D пространстве эскиза
    pub point: [f64; 2],
    /// Тип привязки
    pub snap_type: SnapType,
    /// Индекс элемента-источника (None для Grid)
    pub source_element: Option<usize>,
}

/// Настройки привязок
#[derive(Clone)]
pub struct SnapSettings {
    /// Привязки включены
    pub enabled: bool,
    /// Привязка к конечным точкам
    pub endpoint: bool,
    /// Привязка к серединам
    pub midpoint: bool,
    /// Привязка к центрам
    pub center: bool,
    /// Привязка к квадрантам
    pub quadrant: bool,
    /// Привязка к сетке
    pub grid: bool,
    /// Размер ячейки сетки
    pub grid_size: f64,
    /// Радиус поиска привязки (в единицах эскиза)
    pub snap_radius: f64,
}

impl Default for SnapSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            endpoint: true,
            midpoint: true,
            center: true,
            quadrant: true,  // Квадранты круга (0°, 90°, 180°, 270°)
            grid: true,
            grid_size: 0.1,
            snap_radius: 0.15,
        }
    }
}

impl SnapSettings {
    /// Все привязки включены
    pub fn all_enabled() -> Self {
        Self {
            enabled: true,
            endpoint: true,
            midpoint: true,
            center: true,
            quadrant: true,
            grid: true,
            grid_size: 0.1,
            snap_radius: 0.15,
        }
    }
}

// ============================================================================
// Element Selection (выбор элементов)
// ============================================================================

/// Ручка для перетаскивания элемента или его точки
#[derive(Debug, Clone)]
pub struct ElementHandle {
    /// Индекс элемента в массиве sketch.elements
    pub element_index: usize,
    /// Индекс точки внутри элемента (None = весь элемент)
    pub point_index: Option<usize>,
}

/// Выбранная точка элемента (element_index, point_index)
pub type SelectedPoint = (usize, usize);

/// Состояние выбора элементов эскиза
#[derive(Default)]
pub struct SketchElementSelection {
    /// Индексы выбранных элементов
    pub selected: Vec<usize>,
    /// Выбранные точки элементов (element_index, point_index)
    pub selected_points: Vec<SelectedPoint>,
    /// Элемент под курсором (hover)
    pub hover_element: Option<usize>,
    /// Точка под курсором (element_index, point_index)
    pub hover_point: Option<(usize, usize)>,
    /// Активное перетаскивание
    pub dragging: Option<ElementHandle>,
    /// Начальная позиция перетаскивания
    pub drag_start: Option<[f64; 2]>,
}

impl SketchElementSelection {
    /// Выбрать один элемент (сбросить предыдущий выбор)
    pub fn select(&mut self, index: usize) {
        self.selected.clear();
        self.selected_points.clear();
        self.selected.push(index);
    }

    /// Добавить/убрать элемент из выбора (Ctrl+клик)
    pub fn toggle(&mut self, index: usize) {
        if let Some(pos) = self.selected.iter().position(|&i| i == index) {
            self.selected.remove(pos);
        } else {
            self.selected.push(index);
        }
    }

    /// Проверить, выбран ли элемент
    pub fn is_selected(&self, index: usize) -> bool {
        self.selected.contains(&index)
    }

    /// Выбрать одну точку (сбросить предыдущий выбор)
    pub fn select_point(&mut self, element_index: usize, point_index: usize) {
        self.selected.clear();
        self.selected_points.clear();
        self.selected_points.push((element_index, point_index));
    }

    /// Добавить/убрать точку из выбора (Ctrl+клик)
    pub fn toggle_point(&mut self, element_index: usize, point_index: usize) {
        let point = (element_index, point_index);
        if let Some(pos) = self.selected_points.iter().position(|&p| p == point) {
            self.selected_points.remove(pos);
        } else {
            self.selected_points.push(point);
        }
    }

    /// Проверить, выбрана ли точка
    pub fn is_point_selected(&self, element_index: usize, point_index: usize) -> bool {
        self.selected_points.contains(&(element_index, point_index))
    }

    /// Очистить выбор
    pub fn clear(&mut self) {
        self.selected.clear();
        self.selected_points.clear();
        self.hover_element = None;
        self.hover_point = None;
    }

    /// Начать перетаскивание
    pub fn start_drag(&mut self, handle: ElementHandle, start_pos: [f64; 2]) {
        self.dragging = Some(handle);
        self.drag_start = Some(start_pos);
    }

    /// Завершить перетаскивание
    pub fn end_drag(&mut self) {
        self.dragging = None;
        self.drag_start = None;
    }

    /// Удалить выбранные элементы (возвращает индексы для удаления, отсортированные по убыванию)
    pub fn get_selected_for_removal(&self) -> Vec<usize> {
        let mut indices = self.selected.clone();
        indices.sort_by(|a, b| b.cmp(a)); // По убыванию для безопасного удаления
        indices
    }
}

// ============================================================================
// Sketch Tool
// ============================================================================

/// Currently active sketch drawing tool
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SketchTool {
    #[default]
    None,
    Line,
    Circle,
    Arc,
    Rectangle,
    Polyline,
    Spline,
    Dimension,
    // Modification tools
    Trim,
    Fillet,
    Offset,
    Mirror,
}

impl SketchTool {
    pub fn label(&self) -> &'static str {
        match self {
            Self::None => "Select",
            Self::Line => "Line",
            Self::Circle => "Circle",
            Self::Arc => "Arc",
            Self::Rectangle => "Rectangle",
            Self::Polyline => "Polyline",
            Self::Spline => "Spline",
            Self::Dimension => "Dimension",
            Self::Trim => "Trim",
            Self::Fillet => "Fillet",
            Self::Offset => "Offset",
            Self::Mirror => "Mirror",
        }
    }

    /// Returns true if this is a modification tool (operates on existing elements)
    pub fn is_modification_tool(&self) -> bool {
        matches!(self, Self::Trim | Self::Fillet | Self::Offset | Self::Mirror)
    }
}

/// Информация о dimension для окружности
#[derive(Debug, Clone)]
pub struct DimensionCircleInfo {
    /// Индекс элемента окружности
    pub circle_index: usize,
    /// Тип dimension (Radius или Diameter)
    pub dimension_type: shared::DimensionType,
    /// Центр окружности
    pub center: [f64; 2],
    /// Радиус окружности
    pub radius: f64,
}

/// Sketch editing state
pub struct SketchState {
    /// ID of the body containing the sketch being edited
    active_body_id: Option<ObjectId>,
    /// ID of the sketch feature being edited (None = first sketch in body)
    active_feature_id: Option<ObjectId>,
    /// Current drawing tool
    pub tool: SketchTool,
    /// Points accumulated during drawing (in 2D sketch coordinates)
    pub drawing_points: Vec<[f64; 2]>,
    /// Preview point (mouse hover position, in 2D sketch coordinates)
    pub preview_point: Option<[f64; 2]>,
    /// Настройки привязок
    pub snap: SnapSettings,
    /// Активная точка привязки (под курсором)
    pub active_snap: Option<SnapPoint>,
    /// Выбор элементов эскиза
    pub element_selection: SketchElementSelection,
    /// Fillet radius for Fillet tool
    pub fillet_radius: f64,
    /// Offset distance for Offset tool
    pub offset_distance: f64,
    /// Информация о dimension для окружности (если dimension создаётся для окружности)
    pub dimension_circle_info: Option<DimensionCircleInfo>,
}

impl Default for SketchState {
    fn default() -> Self {
        Self {
            active_body_id: None,
            active_feature_id: None,
            tool: SketchTool::None,
            drawing_points: Vec::new(),
            preview_point: None,
            snap: SnapSettings::default(),
            active_snap: None,
            element_selection: SketchElementSelection::default(),
            fillet_radius: 0.1,
            offset_distance: 0.1,
            dimension_circle_info: None,
        }
    }
}

impl SketchState {
    /// Check if we're currently editing a sketch
    pub fn is_editing(&self) -> bool {
        self.active_body_id.is_some()
    }

    /// Get the body ID containing the sketch being edited
    pub fn editing_body_id(&self) -> Option<&ObjectId> {
        self.active_body_id.as_ref()
    }

    /// Get the feature ID of the sketch being edited
    pub fn active_feature_id(&self) -> Option<&ObjectId> {
        self.active_feature_id.as_ref()
    }

    /// Enter sketch editing mode (body only, uses first/last sketch)
    pub fn enter_edit(&mut self, body_id: ObjectId) {
        self.active_body_id = Some(body_id);
        self.active_feature_id = None;
        self.tool = SketchTool::None;
        self.drawing_points.clear();
        self.preview_point = None;
        self.active_snap = None;
        self.element_selection.clear();
    }

    /// Enter sketch editing mode with specific feature ID
    pub fn enter_edit_feature(&mut self, body_id: ObjectId, feature_id: ObjectId) {
        self.active_body_id = Some(body_id);
        self.active_feature_id = Some(feature_id);
        self.tool = SketchTool::None;
        self.drawing_points.clear();
        self.preview_point = None;
        self.active_snap = None;
        self.element_selection.clear();
    }

    /// Exit sketch editing mode
    pub fn exit_edit(&mut self) {
        self.active_body_id = None;
        self.active_feature_id = None;
        self.tool = SketchTool::None;
        self.drawing_points.clear();
        self.preview_point = None;
        self.active_snap = None;
        self.element_selection.clear();
        self.dimension_circle_info = None;
    }

    /// Set the active drawing tool
    pub fn set_tool(&mut self, tool: SketchTool) {
        self.tool = tool;
        self.drawing_points.clear();
        self.preview_point = None;
        self.active_snap = None;
        self.dimension_circle_info = None;
        // Не очищаем element_selection при смене инструмента
    }

    /// Add a drawing point
    pub fn add_point(&mut self, point: [f64; 2]) {
        self.drawing_points.push(point);
    }

    /// Clear drawing state (after completing or canceling an element)
    pub fn clear_drawing(&mut self) {
        self.drawing_points.clear();
        self.preview_point = None;
        self.active_snap = None;
        self.dimension_circle_info = None;
    }

    /// How many points the current tool needs. None = variable (polyline/spline).
    /// Modification tools (Trim, Fillet, Offset) return Some(0) as they work differently.
    pub fn required_point_count(&self) -> Option<usize> {
        match self.tool {
            SketchTool::Line => Some(2),
            SketchTool::Circle => Some(2),
            SketchTool::Rectangle => Some(2),
            SketchTool::Arc => Some(3),
            SketchTool::Dimension => Some(3), // from, to, dimension_line_pos
            SketchTool::Polyline | SketchTool::Spline => None,
            SketchTool::None => Some(0),
            // Modification tools work by clicking on elements, not accumulating points
            SketchTool::Trim | SketchTool::Fillet | SketchTool::Offset | SketchTool::Mirror => Some(0),
        }
    }

    /// Try to finalize a fixed-point-count tool into a SketchElement.
    pub fn try_finalize(&self) -> Option<SketchElement> {
        let pts = &self.drawing_points;
        match self.tool {
            SketchTool::Line if pts.len() >= 2 => Some(SketchElement::Line {
                start: Point2D { x: pts[0][0], y: pts[0][1] },
                end: Point2D { x: pts[1][0], y: pts[1][1] },
            }),
            SketchTool::Circle if pts.len() >= 2 => {
                let dx = pts[1][0] - pts[0][0];
                let dy = pts[1][1] - pts[0][1];
                let radius = (dx * dx + dy * dy).sqrt();
                Some(SketchElement::Circle {
                    center: Point2D { x: pts[0][0], y: pts[0][1] },
                    radius,
                })
            }
            SketchTool::Rectangle if pts.len() >= 2 => {
                let x0 = pts[0][0].min(pts[1][0]);
                let y0 = pts[0][1].min(pts[1][1]);
                let width = (pts[1][0] - pts[0][0]).abs();
                let height = (pts[1][1] - pts[0][1]).abs();
                Some(SketchElement::Rectangle {
                    corner: Point2D { x: x0, y: y0 },
                    width,
                    height,
                })
            }
            SketchTool::Arc if pts.len() >= 3 => {
                let cx = pts[0][0];
                let cy = pts[0][1];
                let dx1 = pts[1][0] - cx;
                let dy1 = pts[1][1] - cy;
                let radius = (dx1 * dx1 + dy1 * dy1).sqrt();
                let start_angle = dy1.atan2(dx1);
                let dx2 = pts[2][0] - cx;
                let dy2 = pts[2][1] - cy;
                let end_angle = dy2.atan2(dx2);
                Some(SketchElement::Arc {
                    center: Point2D { x: cx, y: cy },
                    radius,
                    start_angle,
                    end_angle,
                })
            }
            SketchTool::Dimension if pts.len() >= 2 => {
                // Check if we have circle info (radius/diameter dimension)
                if let Some(ref circle_info) = self.dimension_circle_info {
                    // For circle dimensions, we only need 2 points (from/to are auto-calculated, last point is dimension_line_pos)
                    let dim_line_pos = if pts.len() >= 2 {
                        Some(Point2D { x: pts[1][0], y: pts[1][1] })
                    } else {
                        None
                    };

                    let (from, to, value) = match circle_info.dimension_type {
                        shared::DimensionType::Radius => {
                            // Radius: from center to point on circle
                            let from = Point2D { x: circle_info.center[0], y: circle_info.center[1] };
                            let to = Point2D {
                                x: circle_info.center[0] + circle_info.radius,
                                y: circle_info.center[1]
                            };
                            (from, to, circle_info.radius)
                        }
                        shared::DimensionType::Diameter => {
                            // Diameter: from one side to opposite side through center
                            let from = Point2D {
                                x: circle_info.center[0] - circle_info.radius,
                                y: circle_info.center[1]
                            };
                            let to = Point2D {
                                x: circle_info.center[0] + circle_info.radius,
                                y: circle_info.center[1]
                            };
                            (from, to, circle_info.radius * 2.0)
                        }
                        shared::DimensionType::Linear => {
                            // Should not happen, but handle gracefully
                            let from = Point2D { x: pts[0][0], y: pts[0][1] };
                            let to = Point2D { x: pts[0][0] + circle_info.radius, y: pts[0][1] };
                            (from, to, circle_info.radius)
                        }
                    };

                    Some(SketchElement::Dimension {
                        from,
                        to,
                        value,
                        parameter_name: None,
                        dimension_line_pos: dim_line_pos,
                        target_element: Some(circle_info.circle_index),
                        dimension_type: circle_info.dimension_type,
                    })
                } else if pts.len() >= 3 {
                    // Standard linear dimension
                    let dx = pts[1][0] - pts[0][0];
                    let dy = pts[1][1] - pts[0][1];
                    let value = (dx * dx + dy * dy).sqrt();
                    Some(SketchElement::Dimension {
                        from: Point2D { x: pts[0][0], y: pts[0][1] },
                        to: Point2D { x: pts[1][0], y: pts[1][1] },
                        value,
                        parameter_name: None,
                        dimension_line_pos: Some(Point2D { x: pts[2][0], y: pts[2][1] }),
                        target_element: None, // Will be set after adding to sketch
                        dimension_type: shared::DimensionType::Linear,
                    })
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    /// Try to finalize a multi-point tool (Polyline/Spline). Called on RMB.
    pub fn try_finalize_multi(&self) -> Option<SketchElement> {
        let pts = &self.drawing_points;
        if pts.len() < 2 {
            return None;
        }
        let points: Vec<Point2D> = pts
            .iter()
            .map(|p| Point2D { x: p[0], y: p[1] })
            .collect();
        match self.tool {
            SketchTool::Polyline => Some(SketchElement::Polyline { points }),
            SketchTool::Spline => Some(SketchElement::Spline { points }),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Enter/exit ---

    #[test]
    fn test_initial_not_editing() {
        let s = SketchState::default();
        assert!(!s.is_editing());
        assert!(s.editing_body_id().is_none());
    }

    #[test]
    fn test_enter_edit() {
        let mut s = SketchState::default();
        s.enter_edit("sk1".to_string());
        assert!(s.is_editing());
        assert_eq!(s.editing_body_id(), Some(&"sk1".to_string()));
        assert_eq!(s.tool, SketchTool::None);
    }

    #[test]
    fn test_exit_edit_clears_all() {
        let mut s = SketchState::default();
        s.enter_edit("sk1".to_string());
        s.set_tool(SketchTool::Line);
        s.add_point([1.0, 2.0]);
        s.exit_edit();
        assert!(!s.is_editing());
        assert!(s.editing_body_id().is_none());
        assert_eq!(s.tool, SketchTool::None);
        assert!(s.drawing_points.is_empty());
    }

    // --- Tool management ---

    #[test]
    fn test_set_tool_clears_points() {
        let mut s = SketchState::default();
        s.enter_edit("sk1".to_string());
        s.set_tool(SketchTool::Line);
        s.add_point([0.0, 0.0]);
        s.set_tool(SketchTool::Circle);
        assert!(s.drawing_points.is_empty());
        assert_eq!(s.tool, SketchTool::Circle);
    }

    #[test]
    fn test_add_point() {
        let mut s = SketchState::default();
        s.add_point([1.0, 2.0]);
        s.add_point([3.0, 4.0]);
        assert_eq!(s.drawing_points.len(), 2);
        assert_eq!(s.drawing_points[0], [1.0, 2.0]);
    }

    #[test]
    fn test_clear_drawing() {
        let mut s = SketchState::default();
        s.add_point([1.0, 2.0]);
        s.preview_point = Some([5.0, 6.0]);
        s.clear_drawing();
        assert!(s.drawing_points.is_empty());
        assert!(s.preview_point.is_none());
    }

    // --- Required point count ---

    #[test]
    fn test_required_point_count() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Line;
        assert_eq!(s.required_point_count(), Some(2));
        s.tool = SketchTool::Circle;
        assert_eq!(s.required_point_count(), Some(2));
        s.tool = SketchTool::Arc;
        assert_eq!(s.required_point_count(), Some(3));
        s.tool = SketchTool::Rectangle;
        assert_eq!(s.required_point_count(), Some(2));
        s.tool = SketchTool::Dimension;
        assert_eq!(s.required_point_count(), Some(2));
        s.tool = SketchTool::Polyline;
        assert_eq!(s.required_point_count(), None);
        s.tool = SketchTool::Spline;
        assert_eq!(s.required_point_count(), None);
        s.tool = SketchTool::None;
        assert_eq!(s.required_point_count(), Some(0));
    }

    // --- Finalize fixed-point tools ---

    #[test]
    fn test_finalize_line() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Line;
        s.add_point([0.0, 0.0]);
        s.add_point([3.0, 4.0]);
        let elem = s.try_finalize().unwrap();
        match elem {
            SketchElement::Line { start, end } => {
                assert_eq!(start, Point2D { x: 0.0, y: 0.0 });
                assert_eq!(end, Point2D { x: 3.0, y: 4.0 });
            }
            _ => panic!("Expected Line"),
        }
    }

    #[test]
    fn test_finalize_circle() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Circle;
        s.add_point([0.0, 0.0]);
        s.add_point([3.0, 4.0]);
        let elem = s.try_finalize().unwrap();
        match elem {
            SketchElement::Circle { center, radius } => {
                assert_eq!(center, Point2D { x: 0.0, y: 0.0 });
                assert!((radius - 5.0).abs() < 1e-10);
            }
            _ => panic!("Expected Circle"),
        }
    }

    #[test]
    fn test_finalize_rectangle() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Rectangle;
        // Points given in "wrong" order — rectangle normalizes to min corner
        s.add_point([3.0, 4.0]);
        s.add_point([1.0, 2.0]);
        let elem = s.try_finalize().unwrap();
        match elem {
            SketchElement::Rectangle { corner, width, height } => {
                assert_eq!(corner, Point2D { x: 1.0, y: 2.0 });
                assert!((width - 2.0).abs() < 1e-10);
                assert!((height - 2.0).abs() < 1e-10);
            }
            _ => panic!("Expected Rectangle"),
        }
    }

    #[test]
    fn test_finalize_arc() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Arc;
        s.add_point([0.0, 0.0]);  // center
        s.add_point([1.0, 0.0]);  // start on arc
        s.add_point([0.0, 1.0]);  // end on arc
        let elem = s.try_finalize().unwrap();
        match elem {
            SketchElement::Arc { center, radius, start_angle, end_angle } => {
                assert_eq!(center, Point2D { x: 0.0, y: 0.0 });
                assert!((radius - 1.0).abs() < 1e-10);
                assert!(start_angle.abs() < 1e-10); // atan2(0, 1) = 0
                assert!((end_angle - std::f64::consts::FRAC_PI_2).abs() < 1e-10); // atan2(1, 0) = PI/2
            }
            _ => panic!("Expected Arc"),
        }
    }

    #[test]
    fn test_finalize_dimension() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Dimension;
        s.add_point([0.0, 0.0]);
        s.add_point([3.0, 4.0]);
        let elem = s.try_finalize().unwrap();
        match elem {
            SketchElement::Dimension { value, .. } => {
                assert!((value - 5.0).abs() < 1e-10);
            }
            _ => panic!("Expected Dimension"),
        }
    }

    #[test]
    fn test_finalize_insufficient_points() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Line;
        s.add_point([0.0, 0.0]);
        assert!(s.try_finalize().is_none());
    }

    #[test]
    fn test_finalize_arc_insufficient_points() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Arc;
        s.add_point([0.0, 0.0]);
        s.add_point([1.0, 0.0]);
        assert!(s.try_finalize().is_none());
    }

    #[test]
    fn test_finalize_none_tool() {
        let mut s = SketchState::default();
        s.tool = SketchTool::None;
        s.add_point([0.0, 0.0]);
        assert!(s.try_finalize().is_none());
    }

    // --- Finalize multi-point tools ---

    #[test]
    fn test_finalize_multi_polyline() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Polyline;
        s.add_point([0.0, 0.0]);
        s.add_point([1.0, 1.0]);
        s.add_point([2.0, 0.0]);
        let elem = s.try_finalize_multi().unwrap();
        match elem {
            SketchElement::Polyline { points } => {
                assert_eq!(points.len(), 3);
            }
            _ => panic!("Expected Polyline"),
        }
    }

    #[test]
    fn test_finalize_multi_spline() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Spline;
        s.add_point([0.0, 0.0]);
        s.add_point([1.0, 2.0]);
        let elem = s.try_finalize_multi().unwrap();
        match elem {
            SketchElement::Spline { points } => {
                assert_eq!(points.len(), 2);
            }
            _ => panic!("Expected Spline"),
        }
    }

    #[test]
    fn test_finalize_multi_too_few_points() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Polyline;
        s.add_point([0.0, 0.0]);
        assert!(s.try_finalize_multi().is_none());
    }

    #[test]
    fn test_finalize_multi_wrong_tool() {
        let mut s = SketchState::default();
        s.tool = SketchTool::Line;
        s.add_point([0.0, 0.0]);
        s.add_point([1.0, 1.0]);
        assert!(s.try_finalize_multi().is_none());
    }

    // --- Tool label ---

    #[test]
    fn test_tool_labels() {
        assert_eq!(SketchTool::None.label(), "Select");
        assert_eq!(SketchTool::Line.label(), "Line");
        assert_eq!(SketchTool::Circle.label(), "Circle");
        assert_eq!(SketchTool::Arc.label(), "Arc");
        assert_eq!(SketchTool::Rectangle.label(), "Rectangle");
        assert_eq!(SketchTool::Polyline.label(), "Polyline");
        assert_eq!(SketchTool::Spline.label(), "Spline");
        assert_eq!(SketchTool::Dimension.label(), "Dimension");
    }
}
