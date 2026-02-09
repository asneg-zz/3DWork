# Структура проекта VCAD

## Обзор

VCAD — это CAD-приложение для 3D-моделирования с поддержкой:
- Параметрического моделирования (примитивы, булевы операции)
- Эскизов и экструзии/вращения профилей
- Выбора граней и создания эскизов на гранях
- Операции Cut (вырезание по эскизу)
- Экспорт в STL/STEP

## Структура каталогов

```
3Dwork/
├── crates/                 # Rust-крейты (модули)
│   ├── gui/               # Десктопное GUI-приложение (egui + OpenGL)
│   ├── server/            # Веб-сервер (API + AI интеграция)
│   ├── shared/            # Общие типы данных (сцена, операции)
│   └── vcad-wasm/         # WebAssembly-модуль для веб-версии
├── web/                   # Веб-клиент (React + Babylon.js)
├── docs/                  # Документация
├── Cargo.toml             # Корневой workspace
└── Cargo.lock
```

---

## crates/gui — Десктопное приложение

Основное GUI-приложение на базе **egui** с OpenGL-рендерингом.

### Структура

```
gui/src/
├── main.rs              # Точка входа
├── app.rs               # Главный App, управление состоянием
├── lib.rs               # Библиотечный интерфейс
│
├── build.rs             # CSG-билдер: построение мешей из сцены
├── extrude.rs           # Экструзия и вращение профилей эскизов
├── export.rs            # Экспорт в STL/STEP
├── command.rs           # Система команд (undo/redo)
├── i18n.rs              # Интернационализация (RU/EN)
├── validation.rs        # Валидация сцены
├── fixtures.rs          # Тестовые данные
├── harness.rs           # Тестовый harness
│
├── state/               # Состояние приложения
│   ├── mod.rs           # AppState — главное состояние
│   ├── selection.rs     # Выделение объектов и граней
│   ├── sketch.rs        # Состояние эскизирования
│   └── chat.rs          # AI-чат (история)
│
├── ui/                  # UI-компоненты
│   ├── mod.rs           # Агрегация компонентов
│   ├── toolbar.rs       # Панель инструментов
│   ├── properties.rs    # Панель свойств
│   ├── scene_tree.rs    # Дерево сцены
│   ├── sketch_toolbar.rs # Инструменты эскиза
│   └── chat_panel.rs    # AI-чат панель
│
└── viewport/            # 3D-вьюпорт
    ├── mod.rs           # Viewport — основной виджет
    ├── camera.rs        # ArcBall камера
    ├── gl_renderer.rs   # OpenGL рендеринг
    ├── renderer.rs      # 2D overlay (сетка, оси)
    ├── mesh.rs          # MeshData — формат мешей
    ├── picking.rs       # Picking объектов и граней (ray casting)
    ├── gizmo.rs         # Gizmo перемещения
    └── sketch_interact.rs # Взаимодействие с эскизами
```

### Ключевые модули

#### `build.rs` — CSG-билдер
Преобразует `SceneDescription` в отображаемые меши:
- Создаёт `vcad::Part` для примитивов
- Выполняет булевы операции (union, difference, intersection)
- Обрабатывает Extrude, Revolve, Cut
- Применяет цвета выделения

Ключевые функции:
- `build_scene_meshes()` — главная функция построения
- `create_cutting_tool()` — создаёт режущий инструмент из эскиза
- `create_extrude_part()` — создаёт vcad Part из экструзии

#### `viewport/mod.rs` — 3D-вьюпорт
- Управление камерой (вращение, zoom, pan)
- Picking объектов по AABB
- Выбор граней (Shift+клик, ray-triangle intersection)
- Gizmo для перемещения
- Контекстное меню (правый клик)
- Автовыравнивание камеры при создании эскиза на грани

#### `viewport/picking.rs` — Picking
- `Ray` — луч от камеры
- `Aabb` — ограничивающий параллелепипед
- `pick_nearest()` — поиск ближайшего объекта
- `pick_triangle()` — поиск треугольника (Möller-Trumbore)
- `group_coplanar_triangles()` — группировка компланарных треугольников в грань

#### `state/selection.rs` — Выделение
- Множественное выделение объектов
- Выделение грани (`FaceSelection`)
- Primary selection для операций

---

## crates/shared — Общие типы

Типы данных, используемые всеми крейтами.

```
shared/src/lib.rs
```

### Основные типы

```rust
// Описание сцены
pub struct SceneDescription {
    pub operations: Vec<SceneOperation>,
}

// Операция над сценой
pub enum SceneOperation {
    CreatePrimitive { id, primitive, transform },
    Boolean { id, op, left, right },
    CreateSketch { id, sketch, transform },
    Extrude { id, sketch_id, height },
    Revolve { id, sketch_id, angle, segments },
    Cut { id, sketch_id, target_id, depth },
}

// Примитивы
pub enum Primitive {
    Cube { width, height, depth },
    Sphere { radius, segments },
    Cylinder { radius, height, segments },
    Cone { radius, height, segments },
}

// Эскиз
pub struct Sketch {
    pub plane: SketchPlane,  // Xy, Xz, Yz
    pub offset: f64,
    pub elements: Vec<SketchElement>,
}

// Элементы эскиза
pub enum SketchElement {
    Line { start, end },
    Circle { center, radius },
    Arc { center, radius, start_angle, end_angle },
    Rectangle { corner, width, height },
    Polyline { points },
    Spline { points },
    Dimension { from, to, value },
}
```

---

## crates/server — Веб-сервер

API-сервер для веб-клиента.

```
server/src/
├── main.rs           # Точка входа (Axum)
├── ai/mod.rs         # AI-интеграция (Claude API)
├── routes/mod.rs     # HTTP-роуты
├── storage/mod.rs    # Хранение сцен
└── build/mod.rs      # CSG-построение для сервера
```

### API endpoints
- `POST /api/chat` — AI-чат
- `GET /api/scene` — получить сцену
- `POST /api/scene` — сохранить сцену
- `POST /api/build` — построить меши

---

## crates/vcad-wasm — WebAssembly

WASM-модуль для веб-версии.

```
vcad-wasm/src/lib.rs
```

- Экспортирует функции для JavaScript
- Обёртка над `vcad` для CSG операций
- Сериализация/десериализация через JSON

---

## web/ — Веб-клиент

React-приложение с Babylon.js.

```
web/src/
├── App.tsx                    # Главный компонент
├── main.tsx                   # Точка входа
│
├── components/
│   ├── Viewport/              # 3D-сцена (Babylon.js)
│   ├── Toolbar/               # Панель инструментов
│   ├── Properties/            # Свойства объекта
│   ├── SceneTree/             # Дерево сцены
│   ├── SketchToolbar/         # Инструменты эскиза
│   ├── Chat/                  # AI-чат
│   └── DropdownMenu/          # Выпадающее меню
│
├── store/
│   └── useStore.ts            # Zustand store
│
├── types/
│   └── scene.ts               # TypeScript типы сцены
│
├── utils/
│   ├── sketchMath.ts          # Математика для эскизов
│   └── sketchRenderer.ts      # Рендеринг 2D эскизов
│
└── wasm/
    └── bridge.ts              # Мост к WASM модулю
```

---

## Поток данных

```
┌─────────────────────────────────────────────────────────────┐
│                        AppState                              │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ SceneManager │  │ SelectionState│  │   SketchState    │  │
│  │ (operations) │  │ (selected_ids)│  │ (active, points) │  │
│  └──────────────┘  └───────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        CsgCache                              │
│  build_scene_meshes() → HashMap<String, MeshData>           │
│  - Примитивы → vcad::Part                                   │
│  - Boolean → Part.union/difference/intersection             │
│  - Extrude → extrude_mesh() + create_extrude_part()        │
│  - Cut → create_cutting_tool() + difference                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      GlRenderer                              │
│  - Загрузка мешей в VBO/IBO                                 │
│  - Рендеринг с освещением                                   │
│  - Overlay: сетка, оси, gizmo                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Зависимости

### GUI
- **egui/eframe** — UI фреймворк
- **glow** — OpenGL биндинги
- **glam** — векторная математика
- **vcad** — CSG операции (manifold3d)
- **uuid** — генерация ID

### Server
- **axum** — веб-фреймворк
- **tokio** — async runtime
- **reqwest** — HTTP клиент (для AI)

### Web
- **React** — UI
- **Babylon.js** — 3D рендеринг
- **Zustand** — state management
- **Vite** — сборщик

---

## Команды сборки

```bash
# GUI приложение
cargo run -p vcad-gui

# Сервер
cargo run -p vcad-server

# WASM модуль
cd crates/vcad-wasm && wasm-pack build --target web

# Веб-клиент
cd web && npm run dev

# Тесты
cargo test -p vcad-gui
```
