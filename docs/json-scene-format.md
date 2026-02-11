# JSON Scene Format — vcad

## Обзор

Сцена описывается структурой `SceneDescriptionV2` — организована вокруг **тел (Bodies)**, аналогично SolidWorks/Fusion 360. JSON используется для:

- Сохранения/загрузки проектов (File > Save/Open)
- Обмена с AI (POST `/api/chat`)
- Экспорта в GLB (POST `/api/build`)
- Программного управления (AgentCommand)

---

## Структура сцены

```json
{
  "version": 2,
  "bodies": [
    {
      "id": "body_1",
      "name": "Корпус",
      "features": [ ... ],
      "visible": true
    }
  ],
  "body_operations": [ ... ]
}
```

---

## Body (Тело)

Тело — независимый контейнер твёрдой геометрии.

```json
{
  "id": "body_1",
  "name": "My Part",
  "features": [
    { "type": "base_primitive", ... },
    { "type": "sketch", ... },
    { "type": "extrude", ... }
  ],
  "visible": true
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Уникальный идентификатор |
| `name` | string | Отображаемое имя |
| `features` | Feature[] | Последовательность операций |
| `visible` | boolean | Видимость (false = поглощено) |

---

## Features (Операции внутри тела)

### base_primitive

Базовый примитив — первая операция, создающая геометрию тела.

```json
{
  "type": "base_primitive",
  "id": "cube_1",
  "primitive": { "type": "cube", "width": 10, "height": 10, "depth": 10 },
  "transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] }
}
```

### base_extrude

Базовое выдавливание эскиза.

```json
{
  "type": "base_extrude",
  "id": "extrude_1",
  "sketch": {
    "plane": "XY",
    "offset": 0.0,
    "elements": [ ... ]
  },
  "sketch_transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] },
  "height": 5.0
}
```

### base_revolve

Базовое вращение эскиза.

```json
{
  "type": "base_revolve",
  "id": "revolve_1",
  "sketch": { ... },
  "sketch_transform": { ... },
  "angle": 360.0,
  "segments": 48
}
```

### sketch

Эскиз внутри тела (не создаёт solid, используется для последующих операций).

```json
{
  "type": "sketch",
  "id": "sketch_1",
  "sketch": {
    "plane": "XY",
    "offset": 0.0,
    "elements": [ ... ],
    "construction": [false, true, false],
    "revolve_axis": 1,
    "constraints": [ ... ]
  },
  "transform": { ... }
}
```

### extrude (модифицирующий)

Выдавливание существующего эскиза (Boss или Cut).

```json
{
  "type": "extrude",
  "id": "extrude_2",
  "sketch_id": "sketch_1",
  "height": 5.0,
  "height_backward": 2.0,
  "cut": false,
  "draft_angle": 5.0
}
```

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `height` | f64 | 1.0 | Высота в прямом направлении |
| `height_backward` | f64 | 0.0 | Высота в обратном направлении |
| `cut` | boolean | false | true = вырезать, false = добавить |
| `draft_angle` | f64 | 0.0 | Угол уклона в градусах (+расширение, -сужение) |

### revolve (модифицирующий)

Вращение существующего эскиза.

```json
{
  "type": "revolve",
  "id": "revolve_2",
  "sketch_id": "sketch_1",
  "angle": 360.0,
  "segments": 32,
  "cut": false,
  "axis_start": [0.0, 0.0],
  "axis_end": [0.0, 1.0]
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `axis_start` | [f64, f64] | Начало оси в координатах эскиза |
| `axis_end` | [f64, f64] | Конец оси в координатах эскиза |

### boolean_modify

Булева модификация тела другим телом.

```json
{
  "type": "boolean_modify",
  "id": "bool_1",
  "op": "difference",
  "tool_body_id": "body_2"
}
```

---

## Примитивы

| Тип | Поля | Пример |
|-----|------|--------|
| `cube` | `width`, `height`, `depth` | `{"type":"cube","width":1,"height":1,"depth":1}` |
| `cylinder` | `radius`, `height` | `{"type":"cylinder","radius":0.5,"height":2}` |
| `sphere` | `radius` | `{"type":"sphere","radius":1}` |
| `cone` | `radius`, `height` | `{"type":"cone","radius":1,"height":3}` |

---

## Transform

Все значения — `f64`. Углы rotation в **радианах**.

```json
{
  "position": [x, y, z],
  "rotation": [rx, ry, rz],
  "scale": [sx, sy, sz]
}
```

По умолчанию: `position=[0,0,0]`, `rotation=[0,0,0]`, `scale=[1,1,1]`.

---

## Sketch (Эскиз)

### Полная структура

```json
{
  "plane": "XY",
  "offset": 0.0,
  "elements": [ ... ],
  "face_normal": [0.0, 0.0, 1.0],
  "construction": [false, true, false],
  "revolve_axis": 1,
  "constraints": [ ... ]
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `plane` | "XY" \| "XZ" \| "YZ" | Плоскость эскиза |
| `offset` | f64 | Смещение от начала координат |
| `elements` | SketchElement[] | Элементы геометрии |
| `face_normal` | [f64; 3] | Нормаль грани (для Cut направления) |
| `construction` | boolean[] | Флаги вспомогательной геометрии |
| `revolve_axis` | usize | Индекс элемента-оси вращения |
| `constraints` | SketchConstraint[] | Геометрические ограничения |

### Плоскости эскиза (SketchPlane)

| Значение | Нормаль | 2D-оси |
|----------|---------|--------|
| `"XY"` | Z | X → right, Y → up |
| `"XZ"` | Y | X → right, Z → up |
| `"YZ"` | X | Y → right, Z → up |

### Вспомогательная геометрия (Construction)

Элементы, помеченные как `construction`, не участвуют в формировании 3D-геометрии. Используются для:
- Осей вращения
- Направляющих линий
- Вспомогательных построений

```json
{
  "elements": [
    { "type": "line", "start": {"x":0,"y":0}, "end": {"x":0,"y":5} },
    { "type": "circle", "center": {"x":2,"y":2}, "radius": 1 }
  ],
  "construction": [true, false]
}
```
В этом примере линия — вспомогательная (ось), окружность — рабочая геометрия.

### Ось вращения (Revolve Axis)

Индекс элемента (должен быть Line), используемого как ось для операции Revolve.

```json
{
  "elements": [
    { "type": "line", "start": {"x":0,"y":0}, "end": {"x":0,"y":5} },
    { "type": "polyline", "points": [...] }
  ],
  "revolve_axis": 0
}
```

---

## Элементы эскиза (SketchElement)

Все координаты — 2D (`Point2D: {x, y}`), углы в **радианах**.

### line

```json
{ "type": "line", "start": {"x":0,"y":0}, "end": {"x":1,"y":1} }
```

### circle

```json
{ "type": "circle", "center": {"x":0,"y":0}, "radius": 1.0 }
```

### arc

```json
{ "type": "arc", "center": {"x":0,"y":0}, "radius": 1.0, "start_angle": 0.0, "end_angle": 3.14 }
```

### rectangle

```json
{ "type": "rectangle", "corner": {"x":-0.5,"y":-0.5}, "width": 1.0, "height": 1.0 }
```

### polyline

```json
{ "type": "polyline", "points": [{"x":0,"y":0}, {"x":1,"y":0}, {"x":1,"y":1}] }
```

### spline

```json
{ "type": "spline", "points": [{"x":0,"y":0}, {"x":0.5,"y":1}, {"x":1,"y":0}] }
```

### dimension

```json
{ "type": "dimension", "from": {"x":0,"y":0}, "to": {"x":2,"y":0}, "value": 2.0 }
```

---

## Ограничения эскиза (SketchConstraint)

### Horizontal

Линия горизонтальна (параллельна оси X).

```json
{ "Horizontal": { "element": 0 } }
```

### Vertical

Линия вертикальна (параллельна оси Y).

```json
{ "Vertical": { "element": 0 } }
```

### Parallel

Две линии параллельны.

```json
{ "Parallel": { "element1": 0, "element2": 1 } }
```

### Perpendicular

Две линии перпендикулярны.

```json
{ "Perpendicular": { "element1": 0, "element2": 1 } }
```

### Coincident

Две точки совпадают (соединение концов отрезков).

```json
{
  "Coincident": {
    "point1": { "element_index": 0, "point_index": 1 },
    "point2": { "element_index": 1, "point_index": 0 }
  }
}
```

`point_index` для разных элементов:
- **Line**: 0 = start, 1 = end
- **Circle**: 0 = center
- **Arc**: 0 = center, 1 = start, 2 = end
- **Rectangle**: 0-3 = углы (по часовой)
- **Polyline/Spline**: индекс точки в массиве

### Fixed

Элемент зафиксирован (не перемещается при решении ограничений).

```json
{ "Fixed": { "element": 0 } }
```

---

## Операции между телами (BodyOperation)

### Boolean

CSG-операция между двумя телами.

```json
{
  "type": "boolean",
  "id": "bool_op_1",
  "op": "union",
  "left_body_id": "body_1",
  "right_body_id": "body_2",
  "result": "merge_into_left"
}
```

Варианты `op`: `"union"`, `"difference"`, `"intersection"`.

#### Варианты result:

**merge_into_left** — результат в левом теле, правое поглощается:
```json
{ "result": "merge_into_left" }
```

**merge_into_right** — результат в правом теле, левое поглощается:
```json
{ "result": "merge_into_right" }
```

**create_new_body** — создать новое тело из результата:
```json
{
  "result": {
    "create_new_body": {
      "new_body_id": "body_3",
      "new_body_name": "Combined"
    }
  }
}
```

---

## Полный пример: деталь с отверстием

```json
{
  "version": 2,
  "bodies": [
    {
      "id": "body_main",
      "name": "Корпус",
      "features": [
        {
          "type": "base_extrude",
          "id": "base",
          "sketch": {
            "plane": "XY",
            "offset": 0.0,
            "elements": [
              { "type": "rectangle", "corner": {"x":-5,"y":-5}, "width": 10, "height": 10 }
            ]
          },
          "sketch_transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] },
          "height": 3.0
        },
        {
          "type": "sketch",
          "id": "hole_sketch",
          "sketch": {
            "plane": "XY",
            "offset": 3.0,
            "elements": [
              { "type": "circle", "center": {"x":0,"y":0}, "radius": 2 }
            ]
          },
          "transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] }
        },
        {
          "type": "extrude",
          "id": "hole_cut",
          "sketch_id": "hole_sketch",
          "height": 3.0,
          "cut": true
        }
      ],
      "visible": true
    }
  ],
  "body_operations": []
}
```

---

## Полный пример: тело вращения с осью

```json
{
  "version": 2,
  "bodies": [
    {
      "id": "body_vase",
      "name": "Ваза",
      "features": [
        {
          "type": "base_revolve",
          "id": "vase_revolve",
          "sketch": {
            "plane": "XY",
            "offset": 0.0,
            "elements": [
              { "type": "line", "start": {"x":0,"y":0}, "end": {"x":0,"y":5} },
              { "type": "polyline", "points": [
                {"x":0.5,"y":0}, {"x":1,"y":0}, {"x":1.2,"y":1},
                {"x":0.8,"y":2}, {"x":1,"y":3}, {"x":0.6,"y":4},
                {"x":0.5,"y":5}, {"x":0,"y":5}
              ]}
            ],
            "construction": [true, false],
            "revolve_axis": 0
          },
          "sketch_transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] },
          "angle": 360.0,
          "segments": 48
        }
      ],
      "visible": true
    }
  ],
  "body_operations": []
}
```

---

## API-эндпоинты

| Endpoint | Метод | Тело запроса | Ответ |
|----------|-------|-------------|-------|
| `/api/chat` | POST | `AiChatRequest` | `AiChatResponse` |
| `/api/build` | POST | `SceneDescriptionV2` | GLB binary |
| `/api/inspect` | POST | `SceneDescriptionV2` | JSON-метрики |
| `/api/health` | GET | — | `{"status":"ok"}` |

### AI Chat

**Запрос:**
```json
{
  "message": "Создай куб с отверстием",
  "scene": { "version": 2, "bodies": [], "body_operations": [] }
}
```

**Ответ:**
```json
{
  "text": "Создал куб 10x10x10 с цилиндрическим отверстием радиусом 3.",
  "scene": { "version": 2, "bodies": [...], "body_operations": [] }
}
```

---

## AgentCommand (программное управление)

Команды отправляются через JSON с полем `"command"`:

```json
{"command": "load_scene", "scene": { "version": 2, "bodies": [...] }}
{"command": "add_body", "body": { ... }}
{"command": "delete_body", "body_id": "body_1"}
{"command": "add_feature", "body_id": "body_1", "feature": { ... }}
{"command": "undo"}
{"command": "redo"}
{"command": "clear"}
{"command": "select", "body_ids": ["body_1"]}
{"command": "clear_selection"}
{"command": "hide", "body_id": "body_1"}
{"command": "show", "body_id": "body_1"}
{"command": "build"}
{"command": "export_scene"}
```

**Ответ:**
```json
{
  "success": true,
  "error": null,
  "data": { ... }
}
```

---

## Конвейер отрисовки

```
SceneDescriptionV2 (JSON)
  │
  ├─ Body.features
  │     ├─ BasePrimitive  → vcad Part (CSG ядро) → mesh
  │     ├─ BaseExtrude    → sketch → 2D profile → extrude mesh
  │     ├─ BaseRevolve    → sketch → 2D profile → revolve mesh
  │     ├─ Sketch         → 2D wireframe overlay (egui painter)
  │     ├─ Extrude        → boolean union/difference
  │     ├─ Revolve        → boolean union/difference
  │     └─ BooleanModify  → CSG with tool body
  │
  └─ BodyOperations
        └─ Boolean        → left ∩/∪/− right → merged body
              │
              ▼
  HashMap<body_id, MeshData>  ← vertices [x,y,z, nx,ny,nz, r,g,b,a] + indices
              │
              ▼
  GlRenderer.sync_from_meshes()  ← загрузка в GPU (VAO/VBO/EBO)
              │
              ▼
  GlRenderer.paint()             ← отрисовка OpenGL
```

Sketch-элементы рисуются через `egui::Painter` поверх GL-контента как 2D-проекции 3D-точек.

---

## Валидация

### Обязательные поля

| Тип | Обязательные поля |
|-----|-------------------|
| `SceneDescriptionV2` | `version`, `bodies` |
| `Body` | `id`, `name`, `features` |
| `Sketch` | `plane`, `elements` |
| `Feature::Extrude` | `id`, `sketch_id` |
| `SketchElement::Line` | `start`, `end` |
| `SketchElement::Circle` | `center`, `radius` |

### Ограничения значений

| Поле | Ограничение |
|------|-------------|
| `radius` | > 0 |
| `width`, `height`, `depth` | > 0 |
| `segments` | ≥ 3 |
| `angle` | 0 < angle ≤ 360 |
| `version` | = 2 |
