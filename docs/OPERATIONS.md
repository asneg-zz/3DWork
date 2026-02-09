# Операции сцены

## Обзор

Сцена в VCAD представляет собой список операций (`SceneOperation`), которые последовательно применяются для построения 3D-модели.

---

## CreatePrimitive — Создание примитива

Создаёт базовый 3D-объект.

```rust
CreatePrimitive {
    id: String,
    primitive: Primitive,
    transform: Transform,
}
```

### Примитивы

| Тип | Параметры |
|-----|-----------|
| Cube | width, height, depth |
| Sphere | radius, segments |
| Cylinder | radius, height, segments |
| Cone | radius, height, segments |

### Transform

```rust
Transform {
    position: [f64; 3],  // смещение
    rotation: [f64; 3],  // углы Эйлера (градусы)
    scale: [f64; 3],     // масштаб
}
```

---

## Boolean — Булевы операции

Комбинирует два объекта.

```rust
Boolean {
    id: String,
    op: BooleanOp,  // Union, Difference, Intersection
    left: String,   // ID левого объекта
    right: String,  // ID правого объекта
}
```

| Операция | Результат |
|----------|-----------|
| Union | Объединение (A ∪ B) |
| Difference | Вычитание (A - B) |
| Intersection | Пересечение (A ∩ B) |

**Важно:** Исходные объекты (left, right) становятся "consumed" и не отображаются отдельно.

---

## CreateSketch — Создание эскиза

Создаёт 2D-эскиз на плоскости.

```rust
CreateSketch {
    id: String,
    sketch: Sketch,
    transform: Transform,
}
```

### Sketch

```rust
Sketch {
    plane: SketchPlane,        // Xy, Xz, Yz
    offset: f64,               // смещение от начала координат
    elements: Vec<SketchElement>,
}
```

### SketchPlane

| Плоскость | Нормаль | Координаты эскиза |
|-----------|---------|-------------------|
| Xy | +Z | U=X, V=Y |
| Xz | +Y | U=X, V=Z |
| Yz | +X | U=Y, V=Z |

### SketchElement

```rust
// Линия
Line { start: Point2D, end: Point2D }

// Круг
Circle { center: Point2D, radius: f64 }

// Дуга
Arc { center: Point2D, radius: f64, start_angle: f64, end_angle: f64 }

// Прямоугольник
Rectangle { corner: Point2D, width: f64, height: f64 }

// Полилиния
Polyline { points: Vec<Point2D> }

// Сплайн
Spline { points: Vec<Point2D> }

// Размер (аннотация)
Dimension { from: Point2D, to: Point2D, value: f64 }
```

---

## Extrude — Экструзия

Выдавливает профиль эскиза вдоль нормали плоскости.

```rust
Extrude {
    id: String,
    sketch_id: String,  // ID исходного эскиза
    height: f64,        // высота (может быть отрицательной)
}
```

**Поддерживаемые элементы:**
- Circle → цилиндр
- Rectangle → параллелепипед
- Polyline/Spline → произвольный профиль

**Результат:** Создаётся MeshData для отображения и vcad::Part для булевых операций (только для простых форм).

---

## Revolve — Вращение

Вращает профиль вокруг оси Y эскиза.

```rust
Revolve {
    id: String,
    sketch_id: String,
    angle: f64,      // угол вращения (градусы)
    segments: u32,   // количество сегментов
}
```

**Ось вращения:** Линия X=0 в координатах эскиза (вертикальная ось V).

---

## Cut — Вырезание

Вырезает форму эскиза из целевого объекта.

```rust
Cut {
    id: String,
    sketch_id: String,   // эскиз с формой выреза
    target_id: String,   // целевой объект
    depth: f64,          // глубина выреза
}
```

### Как работает

1. Для каждого элемента эскиза создаётся "режущий инструмент":
   - Circle → centered_cylinder
   - Rectangle → centered_cube

2. Все инструменты объединяются (union)

3. Выполняется `target.difference(cutter)`

### Направление выреза

- `depth > 0` — вырез в направлении, противоположном нормали плоскости
- `depth < 0` — вырез в направлении нормали

### Множественные элементы

Если эскиз содержит несколько элементов (например, 3 круга), все они будут вырезаны одновременно.

---

## Порядок обработки

```
1. CreatePrimitive → parts[id] = vcad::Part

2. Boolean → parts[id] = parts[left].op(parts[right])

3. CreateSketch → sketches[id] = Sketch (не создаёт геометрию)

4. Extrude →
   - direct_meshes[id] = extrude_mesh() (для отображения)
   - parts[id] = create_extrude_part() (для булевых, если простая форма)

5. Revolve → direct_meshes[id] = revolve_mesh()

6. Cut →
   - cutter = create_cutting_tool()
   - parts[id] = parts[target].difference(cutter)
```

---

## Consumed IDs

Объекты, использованные в операциях, становятся "consumed" и не отображаются:

- `Boolean.left` и `Boolean.right`
- `Extrude.sketch_id`
- `Revolve.sketch_id`
- `Cut.sketch_id` и `Cut.target_id`

Это позволяет избежать дублирования геометрии.

---

## Пример сцены

```json
{
  "operations": [
    {
      "CreatePrimitive": {
        "id": "cylinder1",
        "primitive": { "Cylinder": { "radius": 1.0, "height": 2.0, "segments": 32 } },
        "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] }
      }
    },
    {
      "CreateSketch": {
        "id": "sketch1",
        "sketch": {
          "plane": "Xz",
          "offset": 2.0,
          "elements": [
            { "Circle": { "center": { "x": 0, "y": 0 }, "radius": 0.3 } },
            { "Circle": { "center": { "x": 0.5, "y": 0 }, "radius": 0.2 } }
          ]
        },
        "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] }
      }
    },
    {
      "Cut": {
        "id": "cut1",
        "sketch_id": "sketch1",
        "target_id": "cylinder1",
        "depth": 0.5
      }
    }
  ]
}
```

Результат: Цилиндр с двумя отверстиями на верхней грани.
