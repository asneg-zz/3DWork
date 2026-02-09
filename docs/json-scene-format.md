# JSON Scene Format — vcad

## Обзор

Сцена описывается структурой `SceneDescription` — массивом операций, которые последовательно строят дерево конструирования (CSG tree). JSON используется для:

- Сохранения/загрузки проектов (File > Save/Open)
- Обмена с AI (POST `/api/chat`)
- Экспорта в GLB (POST `/api/build`)
- Программного управления (AgentCommand)

---

## Структура сцены

```json
{
  "operations": [
    { "type": "create_primitive", ... },
    { "type": "create_sketch", ... },
    { "type": "extrude", ... },
    { "type": "boolean", ... }
  ]
}
```

Каждая операция содержит поле `"type"` (snake_case) — дискриминатор варианта.

---

## Операции

### create_primitive

Создание 3D-примитива.

```json
{
  "type": "create_primitive",
  "id": "box1",
  "primitive": {
    "type": "cube",
    "width": 2.0,
    "height": 3.0,
    "depth": 1.0
  },
  "transform": {
    "position": [0.0, 0.0, 0.0],
    "rotation": [0.0, 0.0, 0.0],
    "scale": [1.0, 1.0, 1.0]
  }
}
```

### boolean

CSG-операция над двумя объектами.

```json
{
  "type": "boolean",
  "id": "diff1",
  "op": "difference",
  "left": "box1",
  "right": "hole1"
}
```

Варианты `op`: `"union"`, `"difference"`, `"intersection"`.

### create_sketch

Создание 2D-эскиза на плоскости.

```json
{
  "type": "create_sketch",
  "id": "sketch1",
  "sketch": {
    "plane": "XY",
    "offset": 0.0,
    "elements": [
      {
        "type": "circle",
        "center": { "x": 0.0, "y": 0.0 },
        "radius": 1.5
      }
    ]
  },
  "transform": {
    "position": [0.0, 0.0, 0.0],
    "rotation": [0.0, 0.0, 0.0],
    "scale": [1.0, 1.0, 1.0]
  }
}
```

### extrude

Выдавливание эскиза в 3D-тело.

```json
{
  "type": "extrude",
  "id": "solid1",
  "sketch_id": "sketch1",
  "height": 5.0
}
```

### revolve

Тело вращения из эскиза.

```json
{
  "type": "revolve",
  "id": "revolved1",
  "sketch_id": "sketch1",
  "angle": 360.0,
  "segments": 32
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

## Плоскости эскиза (SketchPlane)

| Значение | Нормаль | 2D-оси |
|----------|---------|--------|
| `"XY"` | Z | X → right, Y → up |
| `"XZ"` | Y | X → right, Z → up |
| `"YZ"` | X | Y → right, Z → up |

---

## Полный пример: куб с цилиндрическим отверстием

```json
{
  "operations": [
    {
      "type": "create_primitive",
      "id": "base",
      "primitive": { "type": "cube", "width": 10, "height": 10, "depth": 10 },
      "transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] }
    },
    {
      "type": "create_primitive",
      "id": "hole",
      "primitive": { "type": "cylinder", "radius": 3, "height": 20 },
      "transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] }
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
```

## Полный пример: тело вращения из эскиза

```json
{
  "operations": [
    {
      "type": "create_sketch",
      "id": "profile",
      "sketch": {
        "plane": "XY",
        "offset": 0.0,
        "elements": [
          { "type": "polyline", "points": [
            {"x":0.5,"y":0}, {"x":1,"y":0}, {"x":1,"y":2},
            {"x":0.7,"y":2.5}, {"x":0.5,"y":2.5}, {"x":0.5,"y":0}
          ]}
        ]
      },
      "transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] }
    },
    {
      "type": "revolve",
      "id": "vase",
      "sketch_id": "profile",
      "angle": 360.0,
      "segments": 48
    }
  ]
}
```

---

## API-эндпоинты

| Endpoint | Метод | Тело запроса | Ответ |
|----------|-------|-------------|-------|
| `/api/chat` | POST | `AiChatRequest` | `AiChatResponse` |
| `/api/build` | POST | `SceneDescription` | GLB binary |
| `/api/inspect` | POST | `SceneDescription` | JSON-метрики |
| `/api/health` | GET | — | `{"status":"ok"}` |

### AI Chat

**Запрос:**
```json
{
  "message": "Создай куб с отверстием",
  "scene": { "operations": [] }
}
```

**Ответ:**
```json
{
  "text": "Создал куб 10x10x10 с цилиндрическим отверстием радиусом 3.",
  "operations": [ ... ]
}
```

---

## AgentCommand (программное управление)

Команды отправляются через JSON с полем `"command"`:

```json
{"command": "add_operation", "operation": { ... }}
{"command": "add_operations", "operations": [ ... ]}
{"command": "load_scene", "operations": [ ... ]}
{"command": "delete", "id": "box1"}
{"command": "undo"}
{"command": "redo"}
{"command": "clear"}
{"command": "select", "ids": ["box1", "hole1"]}
{"command": "clear_selection"}
{"command": "hide", "id": "box1"}
{"command": "show", "id": "box1"}
{"command": "build"}
{"command": "inspect"}
{"command": "inspect_object", "id": "box1"}
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
SceneDescription (JSON)
  │
  ├─ CreatePrimitive → vcad Part (CSG ядро) → триангулированный mesh
  ├─ CreateSketch     → 2D wireframe overlay (egui painter)
  ├─ Extrude          → sketch → 2D profile → extrude mesh
  ├─ Revolve          → sketch → 2D profile → revolve mesh
  └─ Boolean          → left ∩/∪/− right → CSG mesh
        │
        ▼
  HashMap<id, MeshData>     ← vertices [x,y,z, nx,ny,nz, r,g,b,a] + indices
        │
        ▼
  GlRenderer.sync_from_meshes()  ← загрузка в GPU (VAO/VBO/EBO)
        │
        ▼
  GlRenderer.paint()             ← отрисовка OpenGL
```

Sketch-элементы рисуются отдельно через `egui::Painter` поверх GL-контента как 2D-проекции 3D-точек.
