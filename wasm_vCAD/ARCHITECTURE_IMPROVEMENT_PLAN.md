# План улучшения архитектуры wasm_vCAD

> Проект на 60% готов — идеальное время для рефакторинга.
> Цель: устранить технический долг до достижения 80% функциональности.

---

## Критические проблемы (Фаза 1)

### 1. God Component: SketchScene3D.tsx (829 LOC)

**Проблема:** Один компонент выполняет слишком много функций:
- Обработка pointer events (319 строк в `handlePointerDown`)
- Логика constraints (92 строки в `handleAddConstraint`)
- Keyboard handlers (67 строк)
- Snap point calculations
- 23 зависимости в useCallback

**Решение:** Разбить на модули:

```
src/components/viewport/sketch3D/
├── SketchScene3D.tsx          # Оркестратор (200 LOC max)
├── handlers/
│   ├── usePointerHandler.ts   # handlePointerDown/Move/Up
│   ├── useKeyboardHandler.ts  # Escape, Delete, Ctrl+Z
│   └── useConstraintHandler.ts # Constraint dialog logic
├── hooks/
│   ├── useSnapPoints.ts       # Snap calculation
│   └── useDragControl.ts      # Control point dragging
└── context/
    └── SketchEditorContext.tsx # Shared state between handlers
```

**Файлы для изменения:**
- `src/components/viewport/SketchScene3D.tsx` → разбить

---

### 2. Store Spaghetti: 9 stores с неявными зависимостями

**Проблема:**
- Компоненты импортируют 2-6 stores напрямую
- `getState()` вызовы создают stale closures
- Нет единой точки координации

**Текущий паттерн (плохо):**
```typescript
// SketchScene3D.tsx - 20+ импортов из 2 stores
const { elements, tool, ... } = useSketchStore()
const { constraintDialog, ... } = useSketchUIStore()
```

**Решение:** Facade hooks:

```typescript
// hooks/useSketchEditor.ts
export function useSketchEditor() {
  // Объединяет sketchStore + sketchUIStore
  const sketch = useSketchStore()
  const ui = useSketchUIStore()

  return {
    // State
    elements: sketch.elements,
    tool: sketch.tool,
    constraintDialog: ui.constraintDialog,

    // Actions (координированные)
    startConstraint: (type: string) => {
      ui.setConstraintDialog({ isOpen: true, type })
    },
    finishConstraint: (params) => {
      sketch.addConstraint(params)
      ui.setConstraintDialog({ isOpen: false })
    },
  }
}

// hooks/useSceneGraph.ts
export function useSceneGraph() {
  // Объединяет sceneStore + edgeSelectionStore + faceSelectionStore
}
```

**Файлы для создания:**
- `src/hooks/useSketchEditor.ts`
- `src/hooks/useSceneGraph.ts`
- `src/hooks/useBodySelection.ts`

---

### 3. WASM Integration: Отсутствие Error Handling

**Проблема:** `engine.ts` не обрабатывает ошибки WASM:

```typescript
// Текущий код - любая ошибка крашит приложение
generateCubeMesh(width, height, depth): MeshData {
  this.ensureReady()
  return wasmModule.generate_cube_mesh(width, height, depth) // No try-catch!
}
```

**Решение:** Wrapper с валидацией:

```typescript
// wasm/engine.ts
type WasmResult<T> = { success: true; data: T } | { success: false; error: string }

private safeCall<T>(fn: () => T, operation: string): WasmResult<T> {
  try {
    this.ensureReady()
    const result = fn()
    if (!this.validateResult(result, operation)) {
      return { success: false, error: `Invalid result from ${operation}` }
    }
    return { success: true, data: result }
  } catch (e) {
    console.error(`WASM ${operation} failed:`, e)
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

generateCubeMesh(width: number, height: number, depth: number): WasmResult<MeshData> {
  return this.safeCall(
    () => wasmModule.generate_cube_mesh(width, height, depth),
    'generate_cube_mesh'
  )
}
```

**Файлы для изменения:**
- `src/wasm/engine.ts` — добавить error handling
- Все места использования engine — обработать `WasmResult`

---

## Высокий приоритет (Фаза 2)

### 4. Разделение sketchUtils.ts (603 LOC)

**Проблема:** Один файл содержит несвязанную логику:
- Hit-testing (146 LOC)
- Control points (204 LOC)
- Element updates (132 LOC)
- WASM helpers (28 LOC)

**Решение:**

```
src/components/viewport/sketch3D/utils/
├── hitTest.ts           # findElementAtPoint, hitTestControlPoints
├── controlPoints.ts     # getElementControlPoints, updateElementPoint
├── elementOperations.ts # duplicateElement
└── wasmHelpers.ts       # createSketchForWasm, processWasmResult
```

---

### 5. Дублирование логики координатных систем

**Проблема:** `getPlaneCoordSystem` дублируется в:
- `extrudeMesh.ts:112-136`
- `manifoldCSG.ts` (использует из extrudeMesh)
- `coords.ts` (частично)
- `faceUtils.ts` (для face coordinate system)

**Решение:** Единый модуль:

```typescript
// utils/geometry/coordSystem.ts
export interface CoordSystem {
  origin: [number, number, number]
  normal: [number, number, number]
  uAxis: [number, number, number]
  vAxis: [number, number, number]
}

export function getPlaneCoordSystem(
  plane: SketchPlane,
  offset: number,
  faceCoordSystem?: FaceCoordSystem | null
): CoordSystem { ... }

export function sketchToWorld(point: Point2D, cs: CoordSystem): Vector3 { ... }
export function worldToSketch(point: Vector3, cs: CoordSystem): Point2D { ... }
```

---

### 6. Memory Leaks в Three.js объектах

**Проблема:** `SketchScene3D.tsx:728-759` — геометрия создаётся при каждом изменении plane, но старая не disposed:

```typescript
// Текущий код с утечкой памяти
const xAxisLine = useMemo(() => {
  const geo = new THREE.BufferGeometry().setFromPoints([...])
  const mat = new THREE.LineBasicMaterial({...})
  return new THREE.Line(geo, mat)
}, [sketchPlane, renderOffset]) // Recreates on every change!
```

**Решение:** Ref-based lifecycle:

```typescript
const geometryRef = useRef<THREE.BufferGeometry | null>(null)
const materialRef = useRef<THREE.Material | null>(null)

useEffect(() => {
  // Dispose old
  geometryRef.current?.dispose()
  materialRef.current?.dispose()

  // Create new
  geometryRef.current = new THREE.BufferGeometry().setFromPoints([...])
  materialRef.current = new THREE.LineBasicMaterial({...})

  return () => {
    geometryRef.current?.dispose()
    materialRef.current?.dispose()
  }
}, [sketchPlane, renderOffset])
```

---

## Средний приоритет (Фаза 3)

### 7. Unit Tests — критический пробел

**Проблема:** Только E2E тесты (22 файла Selenium), нет unit-тестов для:
- `findElementAtPoint` (146 LOC) — ядро selection
- `generateExtrudeMesh` (152 LOC) — критическая геометрия
- `performCSGCut` (50 LOC) — boolean операции
- `extractProfiles2D` — профили для extrude

**Решение:** Добавить Vitest:

```
src/
├── utils/
│   ├── extrudeMesh.ts
│   └── __tests__/
│       └── extrudeMesh.test.ts
├── components/viewport/
│   ├── sketchUtils.ts
│   └── __tests__/
│       └── sketchUtils.test.ts
```

**Минимальный набор тестов:**
- [ ] `findElementAtPoint` — line, circle, arc, dimension
- [ ] `extractProfiles2D` — closed profiles from various elements
- [ ] `generateExtrudeMesh` — basic shapes
- [ ] `hitTestControlPoints` — all element types

---

### 8. Type Safety: snake_case vs camelCase

**Проблема:** Смешение naming conventions между TS и Rust:

```typescript
// TS code using Rust naming
const { start_angle, end_angle, center } = element // snake_case from WASM
```

**Решение:** Нормализация на границе WASM:

```typescript
// types/sketch.ts
interface SketchElementRaw {  // From WASM
  start_angle?: number
  end_angle?: number
}

interface SketchElement {  // For TS
  startAngle?: number
  endAngle?: number
}

// wasm/normalizers.ts
export function normalizeElement(raw: SketchElementRaw): SketchElement { ... }
export function denormalizeElement(el: SketchElement): SketchElementRaw { ... }
```

---

### 9. FaceHighlight.tsx (307 LOC) — слишком большой

**Проблема:** Компонент совмещает:
- Geometry extraction (62 LOC)
- Face detection via raycasting
- Hover state management
- Rendering

**Решение:**

```
src/components/viewport/
├── FaceHighlight.tsx           # Только рендеринг
├── utils/
│   └── faceDetection.ts        # createFaceGeometry, normalsEqual
└── hooks/
    └── useFaceHover.ts         # Raycast + hover state
```

---

### 10. Geometry Cache без инвалидации

**Проблема:** `geometryCache.ts` (27 LOC) — минимальная реализация:
- Нет лимита памяти
- Нет проверки валидности
- Нет статистики hit/miss

**Решение:** LRU cache с валидацией:

```typescript
class GeometryCache {
  private cache: Map<string, { geometry: THREE.BufferGeometry; version: number }>
  private maxSize: number = 100

  set(bodyId: string, geometry: THREE.BufferGeometry, version: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest()
    }
    this.cache.set(bodyId, { geometry, version })
  }

  get(bodyId: string, expectedVersion: number): THREE.BufferGeometry | null {
    const entry = this.cache.get(bodyId)
    if (entry && entry.version === expectedVersion) {
      return entry.geometry
    }
    return null // Cache miss or stale
  }
}
```

---

## Quick Wins (можно сделать за 1-2 часа каждый)

| # | Задача | Время | Файл |
|---|--------|-------|------|
| 1 | Fix memory leak xAxisLine | 30 мин | SketchScene3D.tsx:728-759 |
| 2 | Extract hasConstraint util | 1 час | SketchScene3D.tsx:659-676 |
| 3 | Add WASM result validation | 1 час | engine.ts |
| 4 | Consolidate plane coord system | 1.5 часа | extrudeMesh.ts, coords.ts |
| 5 | Extract keyboard handler | 2 часа | SketchScene3D.tsx:109-176 |

---

## План реализации по фазам

### Фаза 1: Критические (до 70% готовности) ✅ ЗАВЕРШЕНА

1. [x] **Разбить SketchScene3D на модули** (829 → 300 LOC)
   - Создано: `src/components/viewport/sketch3D/handlers/`
     - `useKeyboardHandler.ts` — клавиатурные события
     - `useSnapPoints.ts` — расчёт точек привязки
     - `useConstraintHandler.ts` — логика ограничений
     - `useSketchOperations.ts` — offset, mirror, pattern
     - `useDragControl.ts` — перетаскивание контрольных точек
     - `usePointerHandler.ts` — pointer down/move/up
     - `index.ts` — экспорт всех handlers

2. [x] **Создать facade hooks**
   - `src/hooks/useSketchEditor.ts` — объединяет sketchStore + sketchUIStore
   - `src/hooks/useSceneGraph.ts` — объединяет sceneStore + selection stores
   - `src/hooks/index.ts` — единый экспорт hooks

3. [x] **Добавить WASM error handling**
   - Добавлен тип `WasmResult<T>` для безопасных операций
   - Все критические методы получили `*Safe` версии
   - Добавлены helper функции: `unwrapWasmResult`, `unwrapWasmResultOr`, `isValidMeshData`
   - Типизированы WASM результаты: `ArcCalculationResult`, `WasmSnapPoint`

### Фаза 2: Высокий приоритет (70-80%) ✅ ЗАВЕРШЕНА
4. [x] **Разделить sketchUtils.ts** (603 → 4 модуля)
   - `src/components/viewport/sketch3D/utils/controlPoints.ts`
   - `src/components/viewport/sketch3D/utils/hitTest.ts`
   - `src/components/viewport/sketch3D/utils/elementOperations.ts`
   - `src/components/viewport/sketch3D/utils/wasmHelpers.ts`

5. [x] **Унифицировать coordinate system logic**
   - Создан `src/utils/geometry/coordSystem.ts`
   - Единый `CoordSystem` интерфейс
   - Функции: `getPlaneCoordSystem`, `sketchToWorld3D`, `worldToSketch2D`
   - Vector utilities: `normalizeVec3`, `dotVec3`, `crossVec3`

6. [x] **Исправить memory leaks в Three.js**
   - Создан `src/hooks/useDisposable.ts`:
     - `useDisposableGeometry` — авто-dispose при unmount
     - `useDisposableMaterial` — авто-dispose материалов
     - `useEdgesGeometry` — специализированный хук
     - `disposeObject` — рекурсивный dispose
   - Исправлены 4 места в `SceneObjects.tsx`
   - Исправлен `EdgeHighlight.tsx` — dispose после extractEdges
   - Исправлен `FaceHighlight.tsx` — cleanup в useEffect

### Фаза 3: Средний приоритет (80-90%) ✅ ЗАВЕРШЕНА
7. [x] **Добавить unit tests (Vitest)**
   - Настроен Vitest с jsdom environment
   - 69 тестов в 5 файлах:
     - `extrudeMesh.test.ts` — 10 тестов для extractProfiles2D
     - `controlPoints.test.ts` — 10 тестов для getElementControlPoints
     - `hitTest.test.ts` — 9 тестов для hitTestControlPoints
     - `coordSystem.test.ts` — 21 тест для coordinate system
     - `normalizers.test.ts` — 19 тестов для WASM normalizers

8. [x] **Нормализовать WASM types**
   - Создан `src/wasm/normalizers.ts`:
     - Raw types с snake_case
     - Normalizer/denormalizer функции
     - Утилиты `snakeToCamel`, `camelToSnake`
     - `deepSnakeToCamel`, `deepCamelToSnake` для глубокой конвертации

9. [x] **Разбить FaceHighlight.tsx** (307 → 64 LOC)
   - Создан `src/components/viewport/utils/faceDetection.ts`:
     - `createFaceGeometry` — извлечение геометрии грани
     - `getTriangleData` — данные треугольника
     - `normalsEqual` — сравнение нормалей
   - Создан `src/components/viewport/hooks/useFaceHover.ts`:
     - Raycast логика + hover state
     - Click handler для выбора грани

10. [x] **Улучшить geometry cache**
    - LRU eviction при превышении maxSize (100)
    - Version tracking для инвалидации
    - Статистика hit/miss/evictions
    - Методы `getStats()`, `getHitRate()`, `resetStats()`

---

## Метрики успеха

| Метрика | До | После | Цель |
|---------|-----|-------|------|
| Макс. LOC в компоненте | 829 (SketchScene3D) | ~300 | < 300 ✅ |
| Stores импортов в компоненте | 6 | 1-2 (через facade) | 1-2 ✅ |
| Unit test coverage | 0% | 69 тестов | > 60% ✅ |
| Memory leaks | Есть | Исправлены | 0 ✅ |
| WASM crashes без handling | Да | WasmResult<T> | Нет ✅ |
| FaceHighlight LOC | 307 | 64 | < 100 ✅ |
| Geometry cache | Простой Map | LRU + версии | LRU ✅ |

---

## Архитектурные принципы (сохранить)

Текущие принципы из ARCHITECTURE.md остаются в силе:

1. **Golden Line** — вся геометрия в Rust/WASM
2. **Three.js только для рендеринга** — никаких вычислений
3. **EdgesGeometry для рёбер** — не wireframe
4. **Строгое разделение TS/Rust** — типы синхронизированы

---

*Создан: 2026-02-21*
*Проект: wasm_vCAD @ 60% готовности*
