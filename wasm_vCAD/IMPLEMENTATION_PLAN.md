# Детальный план реализации vCAD WASM

## Обзор проекта

**Цель:** Создать полнофункциональный CAD редактор в браузере используя React + Rust/WASM

**Приоритет MVP функций:**
1. ✅ Sketch + Extrude (основа параметрического CAD)
2. ✅ Fillet/Chamfer 3D (finishing operations)
3. 📋 AI Chat (позже)

**Архитектура:**
```
React UI ←→ Zustand Store ←→ WASM Engine (Rust) ←→ vcad library
                ↓
           Three.js Viewport
```

---

## Фаза 0: Подготовка (ЗАВЕРШЕНА ✅)

### ✅ Сделано:
- [x] Создана структура проекта
- [x] Настроен Vite + React + TypeScript
- [x] Настроен Tailwind CSS
- [x] Создан Rust крейт vcad-engine
- [x] Базовые React компоненты (Toolbar, SceneTree, Properties, Viewport)
- [x] Zustand store
- [x] TypeScript wrapper для WASM
- [x] Three.js интеграция

### Следующий шаг:
```bash
cd wasm_vCAD
npm install
npm run build:wasm
npm run dev
```

---

## Фаза 1: Sketch Mode (2-3 недели)

### Приоритет: ВЫСОКИЙ
Sketch - основа параметрического CAD. Без него нельзя делать Extrude.

### 1.1 Базовая инфраструктура Sketch (3-5 дней)

#### Rust WASM (crates/vcad-engine/src/sketch.rs):
```rust
// Уже есть заглушки, нужно реализовать:

#[wasm_bindgen]
pub struct SketchBuilder {
    plane: SketchPlane,
    elements: Vec<SketchElement>,
}

impl SketchBuilder {
    // Внутренние методы для работы с kurbo
    fn add_line_internal(&mut self, start: Point, end: Point) -> String {
        let line = kurbo::Line::new(start, end);
        // Сохранить в elements
        // Вернуть ID
    }

    fn add_circle_internal(&mut self, center: Point, radius: f64) -> String {
        let circle = kurbo::Circle::new(center, radius);
        // ...
    }
}
```

**Задачи:**
- [ ] Интеграция kurbo для 2D геометрии
- [ ] Структура данных для хранения sketch elements
- [ ] Проекция 3D → 2D (плоскости XY, XZ, YZ)
- [ ] Генерация ID для элементов
- [ ] Валидация (self-intersecting curves, etc.)

**Оценка:** 3-5 дней

#### React Components (src/components/sketch/):

Создать новые компоненты:
```typescript
// src/components/sketch/SketchCanvas.tsx
// 2D canvas для рисования
// Использовать HTML Canvas API или SVG

// src/components/sketch/SketchToolbar.tsx
// Кнопки: Line, Circle, Rectangle, Arc, etc.

// src/stores/sketchStore.ts
// Состояние текущего sketch mode
interface SketchState {
  active: boolean
  tool: 'line' | 'circle' | 'rectangle' | null
  planeType: 'XY' | 'XZ' | 'YZ'
  elements: SketchElement[]
  // ...
}
```

**Задачи:**
- [ ] SketchCanvas компонент (2D рисование)
- [ ] SketchToolbar (выбор инструментов)
- [ ] Mouse event handling (click, drag)
- [ ] Preview линий/кругов при рисовании
- [ ] Snap to grid
- [ ] Store для sketch state

**Оценка:** 5-7 дней

### 1.2 Sketch Elements (5-7 дней)

Реализовать каждый тип элемента:

#### Line
- [ ] Rust: `sketch_add_line`
- [ ] React: Line drawing tool
- [ ] Preview во время рисования
- [ ] Snap to endpoints

#### Circle
- [ ] Rust: `sketch_add_circle`
- [ ] React: Circle drawing (center + radius)
- [ ] Preview

#### Rectangle
- [ ] Rust: `sketch_add_rectangle`
- [ ] React: Rectangle (2 corners)
- [ ] Preview

#### Arc
- [ ] Rust: `sketch_add_arc`
- [ ] React: Arc (3 points или center + angles)
- [ ] Preview

#### Polyline
- [ ] Rust: `sketch_add_polyline`
- [ ] React: Multi-point line
- [ ] Close polyline option

#### Spline
- [ ] Rust: `sketch_add_spline`
- [ ] React: Bezier curve
- [ ] Control points

**Оценка:** 5-7 дней (параллельно с constraints)

### 1.3 Sketch Constraints (опционально, MVP без них) (7-10 дней)

Если успеем, добавить базовые constraints:

- [ ] Horizontal/Vertical
- [ ] Parallel/Perpendicular
- [ ] Coincident (точки совпадают)
- [ ] Distance (между точками)
- [ ] Radius/Diameter

**Оценка:** 7-10 дней (можно отложить на Фазу 4)

### Milestone 1: ✅ Sketch Mode работает
**Результат:** Можно нарисовать 2D эскиз (линии, круги, прямоугольники) на плоскости

---

## Фаза 2: Extrude Operation (1-2 недели)

### Приоритет: ВЫСОКИЙ
Extrude превращает 2D sketch в 3D модель.

### 2.1 Rust WASM Implementation (5-7 дней)

```rust
// crates/vcad-engine/src/extrude.rs

pub fn extrude_sketch_impl(
    sketch: &Sketch,
    height: f64,
    height_backward: f64,
    draft_angle: f64
) -> Result<Part, String> {
    // 1. Получить контур из sketch elements
    let profile = build_profile_from_sketch(sketch)?;

    // 2. Проверить замкнутость
    if !profile.is_closed() {
        return Err("Sketch must be closed for extrude".into());
    }

    // 3. Использовать vcad::Part::extrude
    let part = vcad::Part::extrude(
        profile,
        height,
        height_backward,
        draft_angle
    )?;

    Ok(part)
}
```

**Задачи:**
- [ ] Интеграция vcad::Part::extrude
- [ ] Конвертация kurbo paths → vcad profiles
- [ ] Валидация замкнутости контура
- [ ] Поддержка draft angle
- [ ] Forward/backward extrude
- [ ] Генерация GLB mesh

**Оценка:** 5-7 дней

### 2.2 React UI (3-5 дней)

```typescript
// src/components/dialogs/ExtrudeDialog.tsx

interface ExtrudeParams {
  height: number
  heightBackward: number
  draftAngle: number
}

export function ExtrudeDialog() {
  const [params, setParams] = useState<ExtrudeParams>({
    height: 1.0,
    heightBackward: 0.0,
    draftAngle: 0.0
  })

  const handleExtrude = async () => {
    // Вызвать WASM engine
    const featureId = engine.extrudeSketch(
      sketchId,
      params.height,
      params.heightBackward,
      params.draftAngle
    )

    // Обновить сцену
    addFeature(bodyId, {
      id: featureId,
      type: 'extrude',
      // ...
    })
  }

  return (
    <Dialog>
      <Input label="Height" value={params.height} onChange={...} />
      <Input label="Height Backward" value={params.heightBackward} />
      <Input label="Draft Angle" value={params.draftAngle} />
      <Button onClick={handleExtrude}>Extrude</Button>
    </Dialog>
  )
}
```

**Задачи:**
- [ ] ExtrudeDialog компонент
- [ ] Параметры: height, height_backward, draft_angle
- [ ] Preview в 3D viewport
- [ ] Интеграция с scene store

**Оценка:** 3-5 дней

### 2.3 Cut Extrude (2-3 дня)

То же самое, но вычитание:

```rust
pub fn cut_extrude_impl(
    base_part: &Part,
    sketch: &Sketch,
    height: f64
) -> Result<Part, String> {
    let tool_part = extrude_sketch_impl(sketch, height, 0.0, 0.0)?;
    base_part.difference(&tool_part)
}
```

**Задачи:**
- [ ] Rust implementation
- [ ] React UI (похож на Extrude Dialog)
- [ ] Boolean difference

**Оценка:** 2-3 дня

### Milestone 2: ✅ Extrude работает
**Результат:** Можно нарисовать sketch и выдавить его в 3D

---

## Фаза 3: Fillet/Chamfer 3D (1.5-2 недели)

### Приоритет: ВЫСОКИЙ (часть MVP)

### 3.1 Edge Selection System (3-5 дней)

Самое сложное - выбор ребер в 3D viewport.

```typescript
// src/components/viewport/EdgeSelector.tsx

export function EdgeSelector() {
  const { fillet3d } = useSceneStore()

  const handleEdgeClick = (edgeId: string) => {
    if (fillet3d.active) {
      toggleEdgeSelection(edgeId)
    }
  }

  return (
    // Three.js raycasting для клика на ребрах
  )
}
```

**Задачи:**
- [ ] Rust: Экспорт списка ребер с ID
- [ ] Three.js: Визуализация ребер (LineSegments)
- [ ] Raycasting для выбора ребер
- [ ] Highlight выбранных ребер
- [ ] Multi-select (Ctrl+Click)

**Оценка:** 3-5 дней

### 3.2 Fillet Implementation (4-6 дней)

```rust
// crates/vcad-engine/src/fillet.rs

pub fn apply_fillet_impl(
    part: &Part,
    edge_ids: Vec<String>,
    radius: f64
) -> Result<Part, String> {
    // Использовать vcad::Part::fillet или manifold-rs
    // Если vcad не поддерживает - через манипуляции mesh

    let mut result = part.clone();

    for edge_id in edge_ids {
        result = result.fillet_edge(edge_id, radius)?;
    }

    Ok(result)
}
```

**Задачи:**
- [ ] Rust: Fillet алгоритм (vcad или manifold-rs)
- [ ] Маппинг edge ID → геометрия
- [ ] Валидация radius (не больше чем edge size)
- [ ] Поддержка multiple edges
- [ ] Preview

**Оценка:** 4-6 дней

**Альтернатива (если vcad не поддерживает):**
- Использовать OpenCascade через WASM (сложнее)
- Или three-bvh-csg для approximate fillet

### 3.3 Chamfer Implementation (2-3 дня)

Похоже на Fillet, но проще:

```rust
pub fn apply_chamfer_impl(
    part: &Part,
    edge_ids: Vec<String>,
    distance: f64
) -> Result<Part, String> {
    // Chamfer = срез под 45°
    let mut result = part.clone();

    for edge_id in edge_ids {
        result = result.chamfer_edge(edge_id, distance)?;
    }

    Ok(result)
}
```

**Задачи:**
- [ ] Rust implementation
- [ ] React UI (похож на Fillet Panel)
- [ ] Preview

**Оценка:** 2-3 дня

### 3.4 React UI (2-3 дня)

```typescript
// src/components/panels/Fillet3DPanel.tsx

export function Fillet3DPanel() {
  const { active, selectedEdges, radius } = useFilletStore()

  if (!active) return null

  return (
    <div className="p-4">
      <h3>Fillet</h3>
      <p>Selected edges: {selectedEdges.length}</p>
      <Input
        label="Radius"
        type="number"
        value={radius}
        onChange={setRadius}
      />
      <Button onClick={applyFillet}>Apply</Button>
      <Button onClick={cancel}>Cancel</Button>
    </div>
  )
}
```

**Задачи:**
- [ ] Fillet3DPanel компонент
- [ ] Chamfer3DPanel компонент
- [ ] Режим edge selection
- [ ] Preview в viewport
- [ ] Apply/Cancel

**Оценка:** 2-3 дня

### Milestone 3: ✅ Fillet/Chamfer работает
**Результат:** Можно скруглить или снять фаску с ребер 3D модели

---

## Фаза 4: Доп. функции (по необходимости)

### 4.1 Boolean Operations (3-5 дней)

```rust
// Уже есть заглушки в boolean.rs

pub fn boolean_union_impl(part1: &Part, part2: &Part) -> Result<Part, String> {
    part1.union(part2)
}
```

**Задачи:**
- [ ] Union
- [ ] Difference
- [ ] Intersection
- [ ] React UI (BooleanPanel)

### 4.2 Undo/Redo (2-3 дня)

```typescript
// src/stores/historyStore.ts

interface HistoryState {
  past: SceneDescription[]
  present: SceneDescription
  future: SceneDescription[]
  undo: () => void
  redo: () => void
}
```

### 4.3 File Operations (3-5 дней)

- [ ] Save scene to JSON
- [ ] Load scene from JSON
- [ ] Export STL
- [ ] Export OBJ
- [ ] Import STEP (если vcad поддерживает)

### 4.4 Measurements (2-3 дня)

- [ ] Distance between points
- [ ] Angle
- [ ] Bounding box dimensions

---

## Фаза 5: AI Chat Integration (1 неделя)

### Приоритет: НИЗКИЙ (после MVP)

Интеграция после основного функционала.

**План:**
- [ ] Chat UI компонент
- [ ] WebSocket или REST API к AI backend
- [ ] Парсинг команд из AI ответов
- [ ] Выполнение команд через WASM engine

---

## Timeline (суммарно)

| Фаза | Функция | Оценка | Приоритет |
|------|---------|--------|-----------|
| 0 | Setup | ✅ Готово | - |
| 1 | Sketch Mode | 2-3 недели | ВЫСОКИЙ |
| 2 | Extrude | 1-2 недели | ВЫСОКИЙ |
| 3 | Fillet/Chamfer | 1.5-2 недели | ВЫСОКИЙ |
| 4 | Доп. функции | 1-2 недели | СРЕДНИЙ |
| 5 | AI Chat | 1 неделя | НИЗКИЙ |

**Общая оценка MVP (Фазы 1-3):** 4.5-7 недель

**Полный функционал:** 7.5-12 недель

---

## Критические риски

### 🔴 РИСК 1: vcad library не поддерживает WASM
**Вероятность:** Средняя
**Влияние:** Критическое

**Решение:**
1. Проверить vcad совместимость с wasm32 target
2. Если не работает:
   - Option A: Использовать manifold-rs (поддерживает WASM)
   - Option B: Fallback на three-bvh-csg (уже используется в web/)
   - Option C: Server-side processing (hybrid approach)

### 🔴 РИСК 2: Fillet/Chamfer алгоритмы отсутствуют
**Вероятность:** Высокая
**Влияние:** Среднее

**Решение:**
- Simplified fillet через mesh approximation
- Или использовать готовые библиотеки (OpenCascade.js)

### 🟡 РИСК 3: Performance проблемы
**Вероятность:** Средняя
**Влияние:** Среднее

**Решение:**
- Оптимизация WASM сборки (opt-level = "z", lto)
- Web Workers для тяжелых вычислений
- Streaming compilation для WASM
- Lazy loading features

---

## Следующие шаги

1. **Проверить vcad совместимость:**
```bash
cd crates/vcad-engine
cargo build --target wasm32-unknown-unknown
```

2. **Если vcad работает:**
   - Начать Фазу 1 (Sketch Mode)

3. **Если vcad НЕ работает:**
   - Переключиться на manifold-rs
   - Обновить Cargo.toml

---

## Вопросы для обсуждения

1. **Нужны ли constraints в Sketch для MVP?**
   - Да → +7-10 дней
   - Нет → Можно добавить позже

2. **Какой приоритет у Boolean операций?**
   - Высокий → Фаза 3
   - Низкий → Фаза 4

3. **Нужен ли Revolve для MVP?**
   - Да → +3-5 дней (Фаза 2.4)
   - Нет → Отложить

4. **Performance requirements?**
   - Сколько объектов должно поддерживаться?
   - Целевой framerate в viewport?

---

## Метрики успеха MVP

- [ ] Можно нарисовать 2D sketch (линии, круги, прямоугольники)
- [ ] Можно выдавить sketch в 3D (extrude)
- [ ] Можно применить fillet к ребрам
- [ ] Можно применить chamfer к ребрам
- [ ] Viewport работает плавно (>30 FPS)
- [ ] WASM модуль < 3 MB
- [ ] Load time < 3 секунды

---

Готов начинать! 🚀
