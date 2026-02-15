# Архитектура wasm_vCAD

## Принципы разделения кода

### ❌ ЗАПРЕЩЕНО в TypeScript:
- Геометрические вычисления
- CAD операции (Boolean, Trim, Fillet, Offset и т.д.)
- Генерация mesh/геометрии
- Математические расчеты для 3D/2D
- Алгоритмы работы со скетчем
- Constraints solver
- Intersection calculations

### ✅ РАЗРЕШЕНО в TypeScript:
- UI компоненты (React)
- Обработка событий (клики, мышь, клавиатура)
- State management (Zustand stores)
- Отображение данных (Three.js rendering)
- Вызовы WASM функций
- Сериализация/десериализация для WASM
- Навигация и роутинг
- Форматирование данных для UI
- Простые расчеты для preview при рисовании (Math.sqrt для радиуса круга во время mouse move)
- Координатные преобразования для viewport (screen to world coords)
- Расчет производных значений только для отображения в UI (длина, площадь в properties panel)

## Правило золотой линии

```
┌─────────────────────────────────────────────────┐
│           TypeScript (Frontend)                 │
│  - React Components                             │
│  - Event Handlers                               │
│  - State Management (Zustand)                   │
│  - Three.js Rendering (display only)            │
│  - UI Controls                                  │
└────────────────┬────────────────────────────────┘
                 │
         WASM API (engine.ts)
                 │
┌────────────────▼────────────────────────────────┐
│            Rust WASM (Backend)                  │
│  - All CAD Operations                           │
│  - Geometry Generation                          │
│  - Mesh Generation (truck)                      │
│  - Sketch Operations (trim, fillet, etc)        │
│  - Boolean Operations                           │
│  - Constraints Solving                          │
│  - All Mathematical Calculations                │
└─────────────────────────────────────────────────┘
```

## Примеры правильного использования

### ✅ ПРАВИЛЬНО:

```typescript
// TypeScript - только вызов WASM и отображение
const geometry = useMemo(() => {
  const meshData = engine.generateCubeMesh(width, height, depth)
  return createGeometryFromMeshData(meshData)
}, [width, height, depth])

return <mesh geometry={geometry} />
```

```rust
// Rust WASM - вся логика
#[wasm_bindgen]
pub fn generate_cube_mesh(width: f64, height: f64, depth: f64) -> JsValue {
    // Generate vertices, indices, normals
    // Return MeshData
}
```

### ❌ НЕПРАВИЛЬНО:

```typescript
// TypeScript - НЕ делать вычисления!
const geometry = new THREE.BoxGeometry(width, height, depth)
const result = CSG.subtract(meshA, meshB) // НЕТ!
```

## Текущее состояние

### ✅ Уже в WASM:
- Генерация примитивов (Cube, Cylinder, Sphere, Cone)
- Mesh generation через truck (truck-modeling, truck-polymesh, truck-meshalgo)
- Sketch операции (Trim, Fillet, Offset, Mirror, Pattern)
- UI Helper функции:
  - `sketch_find_element_at_point` - Hit detection для поиска элемента под курсором
  - `sketch_calculate_arc_from_3_points` - Расчет параметров дуги по 3 точкам
- Boolean операции (API готов, реализация в процессе)

### ⚠️ Нужно реализовать в WASM:
- Фактическая реализация Boolean operations (union, difference, intersection)
- Extrude операции (Cut Extrude, Revolve)
- 3D Fillet/Chamfer операции
- Получение результата Boolean операций (сейчас возвращается placeholder)

## Зависимости

### TypeScript:
```json
{
  "react": "UI framework",
  "three": "3D rendering ONLY (display)",
  "@react-three/fiber": "React renderer for Three.js",
  "zustand": "State management"
}
```

### Rust WASM:
```toml
truck-modeling = "CAD kernel"
truck-polymesh = "Mesh operations"
kurbo = "2D geometry"
shared = "Types from desktop app"
```

## Правила Code Review

Перед коммитом проверить:
- [ ] Нет ли геометрических вычислений в TypeScript?
- [ ] Все CAD операции вызываются через `engine.*`?
- [ ] Three.js используется только для рендеринга?
- [ ] Нет ли дублирования логики между TS и Rust?
- [ ] Hit detection (поиск элемента под курсором) через WASM?
- [ ] Расчет arc, fillet, offset через WASM?
- [ ] Intersection calculations через WASM?

### Примеры миграции:

**❌ БЫЛО (TypeScript):**
```typescript
// Hit detection in TypeScript
const findElementAtPoint = (point: Point2D) => {
  for (const element of elements) {
    const dist = Math.sqrt((point.x - element.x) ** 2 + (point.y - element.y) ** 2)
    if (dist < threshold) return element.id
  }
}
```

**✅ СТАЛО (WASM через engine):**
```typescript
// Hit detection via WASM
const findElementAtPoint = (point: Point2D) => {
  const sketch = { id: uuid(), plane, elements }
  const index = engine.findElementAtPoint(JSON.stringify(sketch), point.x, point.y, threshold)
  return index >= 0 ? elements[index].id : null
}
```

## Миграция существующего кода

1. Найти геометрические вычисления в TypeScript
2. Переместить в Rust модуль
3. Создать WASM binding
4. Добавить wrapper в engine.ts
5. Обновить TypeScript на вызов WASM
6. Удалить старый TypeScript код

## Производительность

**WASM** - быстрее для:
- Сложных вычислений
- Циклов с большим количеством итераций
- Математических операций
- Работы с большими массивами данных

**TypeScript** - нормально для:
- UI событий
- Простых условий
- Вызовов API
- Работы с DOM
