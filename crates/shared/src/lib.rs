use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub mod parameters;

/// Уникальный идентификатор объекта в сцене
pub type ObjectId = String;

/// Тип примитива
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Primitive {
    Cube {
        width: f64,
        height: f64,
        depth: f64,
    },
    Cylinder {
        radius: f64,
        height: f64,
    },
    Sphere {
        radius: f64,
    },
    Cone {
        radius: f64,
        height: f64,
    },
}

/// Тип CSG-операции
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BooleanOp {
    Union,
    Difference,
    Intersection,
}

/// Плоскость эскиза
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum SketchPlane {
    #[serde(rename = "XY")]
    Xy,
    #[serde(rename = "XZ")]
    Xz,
    #[serde(rename = "YZ")]
    Yz,
}

/// 2D-точка на плоскости эскиза
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Point2D {
    pub x: f64,
    pub y: f64,
}

/// Тип размера (для dimension)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DimensionType {
    /// Линейный размер (расстояние между двумя точками)
    #[default]
    Linear,
    /// Радиус окружности/дуги
    Radius,
    /// Диаметр окружности
    Diameter,
}

/// Элемент эскиза
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SketchElement {
    Line {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        start: Point2D,
        end: Point2D,
    },
    Circle {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        center: Point2D,
        radius: f64,
    },
    Arc {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        center: Point2D,
        radius: f64,
        start_angle: f64,
        end_angle: f64,
    },
    Rectangle {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        corner: Point2D,
        width: f64,
        height: f64,
    },
    Polyline {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        points: Vec<Point2D>,
    },
    Spline {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        points: Vec<Point2D>,
    },
    Dimension {
        from: Point2D,
        to: Point2D,
        value: f64,
        /// Имя параметра, к которому привязан размер (если есть)
        parameter_name: Option<String>,
        /// Позиция размерной линии (точка, через которую проходит размерная линия)
        /// Если None, размерная линия автоматически смещается
        #[serde(skip_serializing_if = "Option::is_none", default)]
        dimension_line_pos: Option<Point2D>,
        /// Индекс целевого элемента (линии, окружности), к которому привязан размер
        /// Если установлен, изменение размера будет влиять на этот элемент
        #[serde(skip_serializing_if = "Option::is_none", default)]
        target_element: Option<usize>,
        /// Тип размера (линейный, радиус, диаметр)
        #[serde(default)]
        dimension_type: DimensionType,
    },
}

/// Ссылка на точку элемента эскиза
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PointRef {
    /// Индекс элемента в массиве elements
    pub element_index: usize,
    /// Индекс точки внутри элемента (0=start, 1=end для линии, и т.д.)
    pub point_index: usize,
}

/// Геометрическое ограничение (constraint) эскиза
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SketchConstraint {
    /// Линия горизонтальна (параллельна оси X)
    Horizontal { element: usize },
    /// Линия вертикальна (параллельна оси Y)
    Vertical { element: usize },
    /// Две линии параллельны
    Parallel { element1: usize, element2: usize },
    /// Две линии перпендикулярны
    Perpendicular { element1: usize, element2: usize },
    /// Две точки совпадают
    Coincident { point1: PointRef, point2: PointRef },
    /// Элемент зафиксирован (не может быть перемещён)
    Fixed { element: usize },
    /// Равные длины линий или радиусы окружностей
    Equal { element1: usize, element2: usize },
    /// Касательная (линия касается окружности/дуги)
    Tangent { element1: usize, element2: usize },
    /// Концентрические окружности (совпадающие центры)
    Concentric { element1: usize, element2: usize },
    /// Симметрия относительно линии
    Symmetric {
        element1: usize,
        element2: usize,
        /// Линия симметрии (ось)
        axis: usize,
    },
}

/// Эскиз — набор 2D-элементов на плоскости
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Sketch {
    pub plane: SketchPlane,
    pub offset: f64,
    pub elements: Vec<SketchElement>,
    /// Нормаль грани, на которой создан эскиз (для правильного направления Cut)
    /// Если None — используется направление по умолчанию (в сторону отрицательной оси)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub face_normal: Option<[f64; 3]>,
    /// Флаги вспомогательной геометрии (параллельный вектор к elements)
    /// true = вспомогательная геометрия (не используется для 3D)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub construction: Vec<bool>,
    /// Индекс элемента, помеченного как ось вращения (только один на эскиз)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revolve_axis: Option<usize>,
    /// Индекс элемента, помеченного как ось симметрии (только один на эскиз)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub symmetry_axis: Option<usize>,
    /// Геометрические ограничения (constraints) эскиза
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub constraints: Vec<SketchConstraint>,
}

impl Default for Sketch {
    fn default() -> Self {
        Self {
            plane: SketchPlane::Xy,
            offset: 0.0,
            elements: Vec::new(),
            face_normal: None,
            construction: Vec::new(),
            revolve_axis: None,
            symmetry_axis: None,
            constraints: Vec::new(),
        }
    }
}

impl Sketch {
    /// Проверить, является ли элемент вспомогательной геометрией
    pub fn is_construction(&self, index: usize) -> bool {
        self.construction.get(index).copied().unwrap_or(false)
    }

    /// Установить флаг вспомогательной геометрии
    pub fn set_construction(&mut self, index: usize, value: bool) {
        // Расширить вектор если нужно
        while self.construction.len() <= index {
            self.construction.push(false);
        }
        self.construction[index] = value;
    }

    /// Получить только не-вспомогательные элементы (для формирования 3D)
    pub fn geometry_elements(&self) -> impl Iterator<Item = (usize, &SketchElement)> {
        self.elements.iter().enumerate().filter(|(i, _)| !self.is_construction(*i) && self.revolve_axis != Some(*i) && self.symmetry_axis != Some(*i))
    }

    /// Проверить, является ли элемент осью вращения
    pub fn is_revolve_axis(&self, index: usize) -> bool {
        self.revolve_axis == Some(index)
    }

    /// Установить/сбросить элемент как ось вращения (toggle)
    /// Возвращает true если ось установлена, false если сброшена
    pub fn toggle_revolve_axis(&mut self, index: usize) -> bool {
        if self.revolve_axis == Some(index) {
            self.revolve_axis = None;
            false
        } else {
            self.revolve_axis = Some(index);
            true
        }
    }

    /// Получить ось вращения как элемент (если установлена и это линия)
    pub fn get_revolve_axis_line(&self) -> Option<(usize, &SketchElement)> {
        self.revolve_axis.and_then(|idx| {
            self.elements.get(idx).and_then(|el| {
                if matches!(el, SketchElement::Line { .. }) {
                    Some((idx, el))
                } else {
                    None
                }
            })
        })
    }

    /// Проверить, является ли элемент осью симметрии
    pub fn is_symmetry_axis(&self, index: usize) -> bool {
        self.symmetry_axis == Some(index)
    }

    /// Установить/сбросить элемент как ось симметрии (toggle)
    /// Возвращает true если ось установлена, false если сброшена
    pub fn toggle_symmetry_axis(&mut self, index: usize) -> bool {
        if self.symmetry_axis == Some(index) {
            self.symmetry_axis = None;
            false
        } else {
            self.symmetry_axis = Some(index);
            true
        }
    }

    /// Получить ось симметрии как элемент (если установлена и это линия)
    pub fn get_symmetry_axis_line(&self) -> Option<(usize, &SketchElement)> {
        self.symmetry_axis.and_then(|idx| {
            self.elements.get(idx).and_then(|el| {
                if matches!(el, SketchElement::Line { .. }) {
                    Some((idx, el))
                } else {
                    None
                }
            })
        })
    }
}

/// Трансформация объекта
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct Transform {
    pub position: [f64; 3],
    pub rotation: [f64; 3],
    pub scale: [f64; 3],
}

impl Transform {
    pub fn new() -> Self {
        Self {
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0],
            scale: [1.0, 1.0, 1.0],
        }
    }
}

/// Операция в дереве конструирования
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SceneOperation {
    /// Создание примитива
    CreatePrimitive {
        id: ObjectId,
        primitive: Primitive,
        transform: Transform,
    },
    /// CSG-операция над двумя объектами
    Boolean {
        id: ObjectId,
        op: BooleanOp,
        left: ObjectId,
        right: ObjectId,
    },
    /// Создание эскиза на плоскости
    CreateSketch {
        id: ObjectId,
        sketch: Sketch,
        transform: Transform,
    },
    /// Выдавливание эскиза в 3D-объект
    Extrude {
        id: ObjectId,
        sketch_id: ObjectId,
        height: f64,
    },
    /// Вращение эскиза вокруг оси для создания тела вращения
    Revolve {
        id: ObjectId,
        sketch_id: ObjectId,
        angle: f64,
        segments: u32,
    },
    /// Вырезание эскиза из объекта (экструзия + булево вычитание)
    Cut {
        id: ObjectId,
        sketch_id: ObjectId,
        target_id: ObjectId,
        depth: f64,
    },
}

/// Описание сцены — последовательность операций
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct SceneDescription {
    pub operations: Vec<SceneOperation>,
}

/// AI-запрос от клиента
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiChatRequest {
    pub message: String,
    pub scene: SceneDescription,
}

/// AI-ответ — текст + предлагаемые операции
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiChatResponse {
    pub text: String,
    pub operations: Vec<SceneOperation>,
}

// ============================================================================
// Body-based scene model (V2) - аналогично SolidWorks
// ============================================================================

/// Уникальный идентификатор тела
pub type BodyId = String;

// ============================================================================
// Параметризация (Parameters)
// ============================================================================

/// Ссылка на свойство объекта (для параметрических связей)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParameterRef {
    /// ID тела (опционально)
    pub body_id: Option<String>,
    /// ID фичи (опционально)
    pub feature_id: Option<String>,
    /// Название свойства (например, "width", "height", "radius")
    pub property: String,
}

/// Значение параметра
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ParameterValue {
    /// Числовое значение
    Number { value: f64 },
    /// Формула (например, "width*2", "PI*radius^2")
    Formula { expression: String },
    /// Ссылка на другой параметр или свойство
    Reference { reference: ParameterRef },
}

/// Параметр — именованное значение с возможностью формул и связей
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Parameter {
    /// Имя параметра (например, "width", "hole_diameter")
    pub name: String,
    /// Значение параметра
    pub value: ParameterValue,
    /// Единица измерения (опционально, например "mm", "inch", "deg")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    /// Описание параметра (опционально)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

fn default_true() -> bool {
    true
}

fn default_version() -> u32 {
    2
}

fn default_height() -> f64 {
    1.0
}

/// Тело (Body) — независимый контейнер твёрдой геометрии
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Body {
    /// Уникальный идентификатор тела
    pub id: BodyId,
    /// Имя тела (отображается в дереве)
    pub name: String,
    /// Список фич (features), применяемых последовательно
    pub features: Vec<Feature>,
    /// Видимость тела (false = поглощено булевой операцией)
    #[serde(default = "default_true")]
    pub visible: bool,
    /// Параметры тела (для параметрического моделирования)
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub parameters: HashMap<String, Parameter>,
}

/// Фича (Feature) — операция внутри тела
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Feature {
    // ── Базовые фичи (создают начальную геометрию тела) ──

    /// Базовый примитив — первая фича, создающая геометрию
    BasePrimitive {
        id: ObjectId,
        primitive: Primitive,
        transform: Transform,
    },
    /// Базовое выдавливание эскиза
    BaseExtrude {
        id: ObjectId,
        sketch: Sketch,
        sketch_transform: Transform,
        height: f64,
        #[serde(default)]
        height_backward: f64,
        #[serde(default)]
        draft_angle: f64,
    },
    /// Базовое вращение эскиза
    BaseRevolve {
        id: ObjectId,
        sketch: Sketch,
        sketch_transform: Transform,
        angle: f64,
        segments: u32,
    },

    // ── Референсная геометрия ──

    /// Эскиз (не создаёт solid, используется для последующих операций)
    Sketch {
        id: ObjectId,
        sketch: Sketch,
        transform: Transform,
    },

    // ── Модифицирующие фичи ──

    /// Выдавливание эскиза (добавление или вырезание материала)
    Extrude {
        id: ObjectId,
        /// ID эскиза внутри этого тела
        sketch_id: ObjectId,
        /// Высота в прямом направлении (по умолчанию 1.0)
        #[serde(default = "default_height")]
        height: f64,
        /// Высота в обратном направлении (по умолчанию 0.0)
        #[serde(default)]
        height_backward: f64,
        /// true = вырезать (Cut), false = добавить (Boss)
        #[serde(default)]
        cut: bool,
        /// Угол уклона в градусах (+ расширение, - сужение)
        #[serde(default)]
        draft_angle: f64,
    },
    /// Вращение эскиза
    Revolve {
        id: ObjectId,
        sketch_id: ObjectId,
        angle: f64,
        segments: u32,
        #[serde(default)]
        cut: bool,
        /// Axis start point in sketch coordinates (None = default X=0)
        #[serde(default, skip_serializing_if = "Option::is_none")]
        axis_start: Option<[f64; 2]>,
        /// Axis end point in sketch coordinates
        #[serde(default, skip_serializing_if = "Option::is_none")]
        axis_end: Option<[f64; 2]>,
    },
    /// Булева модификация этого тела другим телом
    BooleanModify {
        id: ObjectId,
        op: BooleanOp,
        /// ID тела-инструмента
        tool_body_id: BodyId,
    },
    /// 3D скругление рёбер
    Fillet3D {
        id: ObjectId,
        /// Радиус скругления
        radius: f64,
        /// Количество сегментов
        segments: u32,
        /// Выбранные рёбра (start, end, normal1, normal2)
        edges: Vec<([f64; 3], [f64; 3], [f64; 3], Option<[f64; 3]>)>,
    },
    /// 3D фаска рёбер
    Chamfer3D {
        id: ObjectId,
        /// Расстояние фаски
        distance: f64,
        /// Выбранные рёбра (start, end, normal1, normal2)
        edges: Vec<([f64; 3], [f64; 3], [f64; 3], Option<[f64; 3]>)>,
    },
}

impl Feature {
    /// Получить ID фичи
    pub fn id(&self) -> &ObjectId {
        match self {
            Feature::BasePrimitive { id, .. } => id,
            Feature::BaseExtrude { id, .. } => id,
            Feature::BaseRevolve { id, .. } => id,
            Feature::Sketch { id, .. } => id,
            Feature::Extrude { id, .. } => id,
            Feature::Revolve { id, .. } => id,
            Feature::BooleanModify { id, .. } => id,
            Feature::Fillet3D { id, .. } => id,
            Feature::Chamfer3D { id, .. } => id,
        }
    }
}

/// Операции между телами
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BodyOperation {
    /// Булева операция между двумя телами
    Boolean {
        id: ObjectId,
        op: BooleanOp,
        left_body_id: BodyId,
        right_body_id: BodyId,
        result: BooleanResult,
    },
}

/// Результат булевой операции между телами
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BooleanResult {
    /// Слить результат в левое тело (правое тело поглощается)
    MergeIntoLeft,
    /// Слить результат в правое тело (левое тело поглощается)
    MergeIntoRight,
    /// Создать новое тело из результата (оба исходных поглощаются)
    CreateNewBody {
        new_body_id: BodyId,
        new_body_name: String,
    },
}

/// Описание сцены V2 — на основе тел (Bodies)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SceneDescriptionV2 {
    /// Версия формата
    #[serde(default = "default_version")]
    pub version: u32,
    /// Тела в сцене
    pub bodies: Vec<Body>,
    /// Операции между телами
    #[serde(default)]
    pub body_operations: Vec<BodyOperation>,
}

impl Default for SceneDescriptionV2 {
    fn default() -> Self {
        Self {
            version: 2,
            bodies: Vec::new(),
            body_operations: Vec::new(),
        }
    }
}

impl SceneDescriptionV2 {
    /// Миграция из V1 (плоский список операций) в V2 (тела)
    pub fn from_v1(v1: &SceneDescription) -> Self {
        use std::collections::HashMap;

        let mut bodies: Vec<Body> = Vec::new();
        let mut id_to_body: HashMap<ObjectId, BodyId> = HashMap::new();
        let mut sketches: HashMap<ObjectId, (Sketch, Transform)> = HashMap::new();
        let mut body_ops: Vec<BodyOperation> = Vec::new();

        for op in &v1.operations {
            match op {
                SceneOperation::CreatePrimitive { id, primitive, transform } => {
                    // Каждый примитив становится отдельным телом
                    let body_id = format!("body_{}", id);
                    bodies.push(Body {
                        id: body_id.clone(),
                        name: format!("Body {}", bodies.len() + 1),
                        features: vec![Feature::BasePrimitive {
                            id: id.clone(),
                            primitive: primitive.clone(),
                            transform: transform.clone(),
                        }],
                        visible: true,
                        parameters: HashMap::new(),
                    });
                    id_to_body.insert(id.clone(), body_id);
                }

                SceneOperation::CreateSketch { id, sketch, transform } => {
                    // Сохраняем эскиз для последующего использования
                    sketches.insert(id.clone(), (sketch.clone(), transform.clone()));
                }

                SceneOperation::Extrude { id, sketch_id, height } => {
                    // Выдавливание создаёт новое тело с BaseExtrude
                    if let Some((sketch, transform)) = sketches.get(sketch_id) {
                        let body_id = format!("body_{}", id);
                        bodies.push(Body {
                            id: body_id.clone(),
                            name: format!("Body {}", bodies.len() + 1),
                            features: vec![Feature::BaseExtrude {
                                id: id.clone(),
                                sketch: sketch.clone(),
                                sketch_transform: transform.clone(),
                                height: *height,
                                height_backward: 0.0,
                                draft_angle: 0.0,
                            }],
                            visible: true,
                            parameters: HashMap::new(),
                        });
                        id_to_body.insert(id.clone(), body_id);
                    }
                }

                SceneOperation::Revolve { id, sketch_id, angle, segments } => {
                    if let Some((sketch, transform)) = sketches.get(sketch_id) {
                        let body_id = format!("body_{}", id);
                        bodies.push(Body {
                            id: body_id.clone(),
                            name: format!("Body {}", bodies.len() + 1),
                            features: vec![Feature::BaseRevolve {
                                id: id.clone(),
                                sketch: sketch.clone(),
                                sketch_transform: transform.clone(),
                                angle: *angle,
                                segments: *segments,
                            }],
                            visible: true,
                            parameters: HashMap::new(),
                        });
                        id_to_body.insert(id.clone(), body_id);
                    }
                }

                SceneOperation::Boolean { id, op, left, right } => {
                    // Булева операция между телами
                    let left_body = id_to_body.get(left).cloned();
                    let right_body = id_to_body.get(right).cloned();

                    if let (Some(left_body_id), Some(right_body_id)) = (left_body, right_body) {
                        // Создаём новое тело из результата
                        let new_body_id = format!("body_{}", id);
                        body_ops.push(BodyOperation::Boolean {
                            id: id.clone(),
                            op: op.clone(),
                            left_body_id: left_body_id.clone(),
                            right_body_id: right_body_id.clone(),
                            result: BooleanResult::CreateNewBody {
                                new_body_id: new_body_id.clone(),
                                new_body_name: format!("Boolean {}", body_ops.len() + 1),
                            },
                        });
                        // Скрываем исходные тела
                        for body in &mut bodies {
                            if body.id == left_body_id || body.id == right_body_id {
                                body.visible = false;
                            }
                        }
                        id_to_body.insert(id.clone(), new_body_id);
                    }
                }

                SceneOperation::Cut { id, sketch_id, target_id, depth } => {
                    // Cut добавляет Extrude(cut=true) к целевому телу
                    if let Some(target_body_id) = id_to_body.get(target_id).cloned() {
                        if let Some((sketch, transform)) = sketches.get(sketch_id) {
                            // Добавляем эскиз и cut-extrude к целевому телу
                            if let Some(body) = bodies.iter_mut().find(|b| b.id == target_body_id) {
                                let sketch_feature_id = format!("{}_sketch", id);
                                body.features.push(Feature::Sketch {
                                    id: sketch_feature_id.clone(),
                                    sketch: sketch.clone(),
                                    transform: transform.clone(),
                                });
                                body.features.push(Feature::Extrude {
                                    id: id.clone(),
                                    sketch_id: sketch_feature_id,
                                    height: *depth,
                                    height_backward: 0.0,
                                    cut: true,
                                    draft_angle: 0.0,
                                });
                            }
                            // Cut не создаёт новое тело, результат в target
                            id_to_body.insert(id.clone(), target_body_id);
                        }
                    }
                }
            }
        }

        SceneDescriptionV2 {
            version: 2,
            bodies,
            body_operations: body_ops,
        }
    }

    /// Конвертация обратно в V1 для совместимости
    pub fn to_v1(&self) -> SceneDescription {
        let mut operations = Vec::new();

        for body in &self.bodies {
            for feature in &body.features {
                match feature {
                    Feature::BasePrimitive { id, primitive, transform } => {
                        operations.push(SceneOperation::CreatePrimitive {
                            id: id.clone(),
                            primitive: primitive.clone(),
                            transform: transform.clone(),
                        });
                    }
                    Feature::BaseExtrude { id, sketch, sketch_transform, height, .. } => {
                        let sketch_id = format!("{}_sketch", id);
                        operations.push(SceneOperation::CreateSketch {
                            id: sketch_id.clone(),
                            sketch: sketch.clone(),
                            transform: sketch_transform.clone(),
                        });
                        operations.push(SceneOperation::Extrude {
                            id: id.clone(),
                            sketch_id,
                            height: *height,
                        });
                    }
                    Feature::BaseRevolve { id, sketch, sketch_transform, angle, segments } => {
                        let sketch_id = format!("{}_sketch", id);
                        operations.push(SceneOperation::CreateSketch {
                            id: sketch_id.clone(),
                            sketch: sketch.clone(),
                            transform: sketch_transform.clone(),
                        });
                        operations.push(SceneOperation::Revolve {
                            id: id.clone(),
                            sketch_id,
                            angle: *angle,
                            segments: *segments,
                        });
                    }
                    Feature::Sketch { id, sketch, transform } => {
                        operations.push(SceneOperation::CreateSketch {
                            id: id.clone(),
                            sketch: sketch.clone(),
                            transform: transform.clone(),
                        });
                    }
                    _ => {
                        // Extrude, Revolve, BooleanModify - сложнее конвертировать
                    }
                }
            }
        }

        for body_op in &self.body_operations {
            match body_op {
                BodyOperation::Boolean { id, op, left_body_id, right_body_id, .. } => {
                    // Упрощённо: используем body_id как object_id
                    operations.push(SceneOperation::Boolean {
                        id: id.clone(),
                        op: op.clone(),
                        left: left_body_id.clone(),
                        right: right_body_id.clone(),
                    });
                }
            }
        }

        SceneDescription { operations }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip<T: Serialize + for<'de> Deserialize<'de> + PartialEq + std::fmt::Debug>(val: &T) {
        let json = serde_json::to_string(val).expect("serialize");
        let back: T = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(*val, back);
    }

    // --- Primitive ---

    #[test]
    fn test_primitive_cube_serde() {
        let p = Primitive::Cube { width: 2.0, height: 3.0, depth: 1.5 };
        roundtrip(&p);
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains(r#""type":"cube""#));
    }

    #[test]
    fn test_primitive_cylinder_serde() {
        let p = Primitive::Cylinder { radius: 1.0, height: 5.0 };
        roundtrip(&p);
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains(r#""type":"cylinder""#));
    }

    #[test]
    fn test_primitive_sphere_serde() {
        let p = Primitive::Sphere { radius: 2.5 };
        roundtrip(&p);
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains(r#""type":"sphere""#));
    }

    #[test]
    fn test_primitive_cone_serde() {
        let p = Primitive::Cone { radius: 1.0, height: 3.0 };
        roundtrip(&p);
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains(r#""type":"cone""#));
    }

    // --- BooleanOp ---

    #[test]
    fn test_boolean_op_serde() {
        for op in [BooleanOp::Union, BooleanOp::Difference, BooleanOp::Intersection] {
            roundtrip(&op);
        }
        let json = serde_json::to_string(&BooleanOp::Union).unwrap();
        assert_eq!(json, r#""union""#);
    }

    // --- SketchPlane ---

    #[test]
    fn test_sketch_plane_serde() {
        let json = serde_json::to_string(&SketchPlane::Xy).unwrap();
        assert_eq!(json, r#""XY""#);
        let json = serde_json::to_string(&SketchPlane::Xz).unwrap();
        assert_eq!(json, r#""XZ""#);
        let json = serde_json::to_string(&SketchPlane::Yz).unwrap();
        assert_eq!(json, r#""YZ""#);
        roundtrip(&SketchPlane::Xy);
        roundtrip(&SketchPlane::Xz);
        roundtrip(&SketchPlane::Yz);
    }

    // --- SketchElement ---

    #[test]
    fn test_sketch_element_line_serde() {
        let e = SketchElement::Line {
            start: Point2D { x: 0.0, y: 0.0 },
            end: Point2D { x: 1.0, y: 2.0 },
        };
        roundtrip(&e);
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains(r#""type":"line""#));
    }

    #[test]
    fn test_sketch_element_circle_serde() {
        let e = SketchElement::Circle {
            center: Point2D { x: 1.0, y: 2.0 },
            radius: 3.0,
        };
        roundtrip(&e);
    }

    #[test]
    fn test_sketch_element_arc_serde() {
        let e = SketchElement::Arc {
            center: Point2D { x: 0.0, y: 0.0 },
            radius: 1.0,
            start_angle: 0.0,
            end_angle: std::f64::consts::PI,
        };
        roundtrip(&e);
    }

    #[test]
    fn test_sketch_element_rectangle_serde() {
        let e = SketchElement::Rectangle {
            corner: Point2D { x: -1.0, y: -1.0 },
            width: 2.0,
            height: 3.0,
        };
        roundtrip(&e);
    }

    #[test]
    fn test_sketch_element_polyline_serde() {
        let e = SketchElement::Polyline {
            points: vec![
                Point2D { x: 0.0, y: 0.0 },
                Point2D { x: 1.0, y: 0.0 },
                Point2D { x: 1.0, y: 1.0 },
            ],
        };
        roundtrip(&e);
    }

    #[test]
    fn test_sketch_element_dimension_serde() {
        let e = SketchElement::Dimension {
            from: Point2D { x: 0.0, y: 0.0 },
            to: Point2D { x: 3.0, y: 4.0 },
            value: 5.0,
            parameter_name: None,
            dimension_line_pos: None,
            target_element: None,
            dimension_type: DimensionType::Linear,
        };
        roundtrip(&e);
    }

    // --- Transform ---

    #[test]
    fn test_transform_new() {
        let t = Transform::new();
        assert_eq!(t.position, [0.0, 0.0, 0.0]);
        assert_eq!(t.rotation, [0.0, 0.0, 0.0]);
        assert_eq!(t.scale, [1.0, 1.0, 1.0]);
    }

    #[test]
    fn test_transform_default_differs_from_new() {
        let def = Transform::default();
        let new = Transform::new();
        // Default derives all zeros; new() sets scale to 1.0
        assert_eq!(def.scale, [0.0, 0.0, 0.0]);
        assert_eq!(new.scale, [1.0, 1.0, 1.0]);
    }

    #[test]
    fn test_transform_serde() {
        let t = Transform {
            position: [1.0, 2.0, 3.0],
            rotation: [0.1, 0.2, 0.3],
            scale: [2.0, 2.0, 2.0],
        };
        roundtrip(&t);
    }

    // --- SceneOperation ---

    #[test]
    fn test_scene_operation_create_primitive_serde() {
        let op = SceneOperation::CreatePrimitive {
            id: "cube1".to_string(),
            primitive: Primitive::Cube { width: 1.0, height: 1.0, depth: 1.0 },
            transform: Transform::new(),
        };
        roundtrip(&op);
        let json = serde_json::to_string(&op).unwrap();
        assert!(json.contains(r#""type":"create_primitive""#));
    }

    #[test]
    fn test_scene_operation_boolean_serde() {
        let op = SceneOperation::Boolean {
            id: "union1".to_string(),
            op: BooleanOp::Union,
            left: "a".to_string(),
            right: "b".to_string(),
        };
        roundtrip(&op);
        let json = serde_json::to_string(&op).unwrap();
        assert!(json.contains(r#""type":"boolean""#));
    }

    #[test]
    fn test_scene_operation_create_sketch_serde() {
        let op = SceneOperation::CreateSketch {
            id: "sketch1".to_string(),
            sketch: Sketch {
                plane: SketchPlane::Xy,
                offset: 0.0,
                elements: vec![
                    SketchElement::Circle {
                        center: Point2D { x: 0.0, y: 0.0 },
                        radius: 1.0,
                    },
                ],
                face_normal: None,
                construction: vec![],
                revolve_axis: None,
                constraints: vec![],
            },
            transform: Transform::new(),
        };
        roundtrip(&op);
        let json = serde_json::to_string(&op).unwrap();
        assert!(json.contains(r#""type":"create_sketch""#));
    }

    #[test]
    fn test_scene_operation_extrude_serde() {
        let op = SceneOperation::Extrude {
            id: "ext1".to_string(),
            sketch_id: "sketch1".to_string(),
            height: 2.0,
        };
        roundtrip(&op);
        let json = serde_json::to_string(&op).unwrap();
        assert!(json.contains(r#""type":"extrude""#));
    }

    #[test]
    fn test_scene_operation_revolve_serde() {
        let op = SceneOperation::Revolve {
            id: "rev1".to_string(),
            sketch_id: "sketch1".to_string(),
            angle: 360.0,
            segments: 32,
        };
        roundtrip(&op);
        let json = serde_json::to_string(&op).unwrap();
        assert!(json.contains(r#""type":"revolve""#));
    }

    // --- SceneDescription ---

    #[test]
    fn test_scene_description_empty() {
        let s = SceneDescription::default();
        assert!(s.operations.is_empty());
        roundtrip(&s);
    }

    #[test]
    fn test_full_scene_serde_roundtrip() {
        let scene = SceneDescription {
            operations: vec![
                SceneOperation::CreatePrimitive {
                    id: "a".to_string(),
                    primitive: Primitive::Cube { width: 1.0, height: 1.0, depth: 1.0 },
                    transform: Transform::new(),
                },
                SceneOperation::CreatePrimitive {
                    id: "b".to_string(),
                    primitive: Primitive::Sphere { radius: 0.5 },
                    transform: Transform {
                        position: [1.0, 0.0, 0.0],
                        rotation: [0.0, 0.0, 0.0],
                        scale: [1.0, 1.0, 1.0],
                    },
                },
                SceneOperation::Boolean {
                    id: "c".to_string(),
                    op: BooleanOp::Difference,
                    left: "a".to_string(),
                    right: "b".to_string(),
                },
                SceneOperation::CreateSketch {
                    id: "sk".to_string(),
                    sketch: Sketch {
                        plane: SketchPlane::Xz,
                        offset: 1.0,
                        elements: vec![
                            SketchElement::Rectangle {
                                corner: Point2D { x: -0.5, y: -0.5 },
                                width: 1.0,
                                height: 1.0,
                            },
                        ],
                        face_normal: None,
                        construction: vec![],
                        revolve_axis: None,
                        constraints: vec![],
                    },
                    transform: Transform::new(),
                },
                SceneOperation::Extrude {
                    id: "ext".to_string(),
                    sketch_id: "sk".to_string(),
                    height: 3.0,
                },
            ],
        };
        roundtrip(&scene);
    }

    // --- Deserialization from JSON strings ---

    #[test]
    fn test_deserialize_primitive_from_json() {
        let json = r#"{"type":"cube","width":2,"height":3,"depth":1}"#;
        let p: Primitive = serde_json::from_str(json).unwrap();
        assert_eq!(p, Primitive::Cube { width: 2.0, height: 3.0, depth: 1.0 });
    }

    #[test]
    fn test_deserialize_scene_from_json() {
        let json = r#"{
            "operations": [
                {
                    "type": "create_primitive",
                    "id": "box1",
                    "primitive": {"type": "cube", "width": 1, "height": 1, "depth": 1},
                    "transform": {"position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1]}
                }
            ]
        }"#;
        let scene: SceneDescription = serde_json::from_str(json).unwrap();
        assert_eq!(scene.operations.len(), 1);
    }

    #[test]
    fn test_deserialize_invalid_type_fails() {
        let json = r#"{"type":"unknown_type","id":"x"}"#;
        let result: Result<SceneOperation, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    // --- AiChat ---

    #[test]
    fn test_ai_chat_request_serde() {
        let req = AiChatRequest {
            message: "Create a cube".to_string(),
            scene: SceneDescription::default(),
        };
        roundtrip(&req);
    }

    #[test]
    fn test_ai_chat_response_serde() {
        let resp = AiChatResponse {
            text: "Done".to_string(),
            operations: vec![SceneOperation::CreatePrimitive {
                id: "c".to_string(),
                primitive: Primitive::Cube { width: 1.0, height: 1.0, depth: 1.0 },
                transform: Transform::new(),
            }],
        };
        roundtrip(&resp);
    }

    // --- Body V2 types ---

    #[test]
    fn test_body_serde() {
        let body = Body {
            id: "body1".to_string(),
            name: "My Body".to_string(),
            features: vec![Feature::BasePrimitive {
                id: "cube1".to_string(),
                primitive: Primitive::Cube { width: 1.0, height: 1.0, depth: 1.0 },
                transform: Transform::new(),
            }],
            visible: true,
            parameters: HashMap::new(),
        };
        roundtrip(&body);
    }

    #[test]
    fn test_feature_base_primitive_serde() {
        let f = Feature::BasePrimitive {
            id: "p1".to_string(),
            primitive: Primitive::Cube { width: 1.0, height: 2.0, depth: 3.0 },
            transform: Transform::new(),
        };
        roundtrip(&f);
        let json = serde_json::to_string(&f).unwrap();
        assert!(json.contains(r#""type":"base_primitive""#));
    }

    #[test]
    fn test_feature_base_extrude_serde() {
        let f = Feature::BaseExtrude {
            id: "e1".to_string(),
            sketch: Sketch {
                plane: SketchPlane::Xy,
                offset: 0.0,
                elements: vec![SketchElement::Circle {
                    center: Point2D { x: 0.0, y: 0.0 },
                    radius: 1.0,
                }],
                face_normal: None,
                construction: vec![],
                revolve_axis: None,
                constraints: vec![],
            },
            sketch_transform: Transform::new(),
            height: 5.0,
        };
        roundtrip(&f);
        let json = serde_json::to_string(&f).unwrap();
        assert!(json.contains(r#""type":"base_extrude""#));
    }

    #[test]
    fn test_feature_sketch_serde() {
        let f = Feature::Sketch {
            id: "s1".to_string(),
            sketch: Sketch {
                plane: SketchPlane::Xz,
                offset: 1.0,
                elements: vec![],
                face_normal: None,
                construction: vec![],
                revolve_axis: None,
                constraints: vec![],
            },
            transform: Transform::new(),
        };
        roundtrip(&f);
    }

    #[test]
    fn test_feature_extrude_serde() {
        let f = Feature::Extrude {
            id: "ext1".to_string(),
            sketch_id: "s1".to_string(),
            height: 2.0,
            height_backward: 0.0,
            cut: true,
            draft_angle: 0.0,
        };
        roundtrip(&f);
        let json = serde_json::to_string(&f).unwrap();
        assert!(json.contains(r#""cut":true"#));
    }

    #[test]
    fn test_feature_boolean_modify_serde() {
        let f = Feature::BooleanModify {
            id: "b1".to_string(),
            op: BooleanOp::Difference,
            tool_body_id: "body2".to_string(),
        };
        roundtrip(&f);
    }

    #[test]
    fn test_boolean_result_serde() {
        let r1 = BooleanResult::MergeIntoLeft;
        roundtrip(&r1);

        let r2 = BooleanResult::CreateNewBody {
            new_body_id: "new1".to_string(),
            new_body_name: "Result".to_string(),
        };
        roundtrip(&r2);
    }

    #[test]
    fn test_body_operation_serde() {
        let op = BodyOperation::Boolean {
            id: "bool1".to_string(),
            op: BooleanOp::Union,
            left_body_id: "body1".to_string(),
            right_body_id: "body2".to_string(),
            result: BooleanResult::MergeIntoLeft,
        };
        roundtrip(&op);
    }

    #[test]
    fn test_scene_description_v2_serde() {
        let scene = SceneDescriptionV2 {
            version: 2,
            bodies: vec![
                Body {
                    id: "body1".to_string(),
                    name: "Cube Body".to_string(),
                    features: vec![Feature::BasePrimitive {
                        id: "cube".to_string(),
                        primitive: Primitive::Cube { width: 1.0, height: 1.0, depth: 1.0 },
                        transform: Transform::new(),
                    }],
                    visible: true,
                    parameters: HashMap::new(),
                },
            ],
            body_operations: vec![],
        };
        roundtrip(&scene);
    }

    #[test]
    fn test_v1_to_v2_migration() {
        let v1 = SceneDescription {
            operations: vec![
                SceneOperation::CreatePrimitive {
                    id: "cube1".to_string(),
                    primitive: Primitive::Cube { width: 1.0, height: 1.0, depth: 1.0 },
                    transform: Transform::new(),
                },
                SceneOperation::CreatePrimitive {
                    id: "sphere1".to_string(),
                    primitive: Primitive::Sphere { radius: 0.5 },
                    transform: Transform::new(),
                },
            ],
        };

        let v2 = SceneDescriptionV2::from_v1(&v1);

        assert_eq!(v2.version, 2);
        assert_eq!(v2.bodies.len(), 2);
        assert_eq!(v2.bodies[0].name, "Body 1");
        assert_eq!(v2.bodies[1].name, "Body 2");

        // Check first body has BasePrimitive
        match &v2.bodies[0].features[0] {
            Feature::BasePrimitive { primitive, .. } => {
                assert!(matches!(primitive, Primitive::Cube { .. }));
            }
            _ => panic!("Expected BasePrimitive"),
        }
    }

    #[test]
    fn test_feature_id() {
        let f = Feature::BasePrimitive {
            id: "test_id".to_string(),
            primitive: Primitive::Cube { width: 1.0, height: 1.0, depth: 1.0 },
            transform: Transform::new(),
        };
        assert_eq!(f.id(), "test_id");
    }
}
