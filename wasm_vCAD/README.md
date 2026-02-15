# vCAD WASM - React + WASM CAD Editor

Полнофункциональный 3D CAD редактор, использующий:
- **React** - современный UI/UX
- **Rust/WASM** - высокопроизводительный CAD движок
- **Three.js** - 3D рендеринг

## Быстрый старт

### 1. Установка зависимостей

```bash
cd wasm_vCAD

# Установить Node.js зависимости
npm install

# Собрать WASM модуль
npm run build:wasm
```

### 2. Запуск dev сервера

```bash
npm run dev
```

Откроется http://localhost:5175

### 3. Production сборка

```bash
npm run build
```

Результат в `dist/`

## Структура проекта

```
wasm_vCAD/
├── src/
│   ├── components/         # React компоненты
│   │   ├── ui/            # Toolbar, Menu, Buttons
│   │   ├── panels/        # SceneTree, Properties
│   │   ├── viewport/      # 3D Viewport
│   │   └── dialogs/       # Модальные окна
│   ├── wasm/              # WASM интеграция
│   │   ├── engine.ts      # TypeScript wrapper
│   │   └── pkg/           # Скомпилированный WASM (генерируется)
│   ├── stores/            # Zustand state management
│   ├── hooks/             # React hooks
│   ├── utils/             # Утилиты
│   ├── types/             # TypeScript типы
│   ├── App.tsx            # Главный компонент
│   └── main.tsx           # Entry point
├── crates/
│   └── vcad-engine/       # Rust WASM модуль
│       ├── src/
│       │   ├── lib.rs           # Главный модуль
│       │   ├── primitives.rs    # Примитивы (Cube, Sphere, etc.)
│       │   ├── sketch.rs        # 2D эскизы
│       │   ├── extrude.rs       # Extrude операции
│       │   ├── fillet.rs        # Fillet/Chamfer
│       │   ├── boolean.rs       # CSG операции
│       │   └── export.rs        # GLB export
│       └── Cargo.toml
├── package.json
├── vite.config.ts
└── README.md
```

## Архитектура

### Поток данных

```
User Input
    ↓
React UI (Toolbar, SceneTree)
    ↓
Zustand Store (scene state)
    ↓
WASM Engine (TypeScript wrapper)
    ↓
Rust CAD Engine (vcad-engine)
    ↓
GLB Export
    ↓
Three.js Renderer (Viewport)
    ↓
WebGL (Browser)
```

### Типы данных

TypeScript типы (`src/types/scene.ts`) совпадают с Rust типами (`crates/shared`):
- `Body` - 3D объект
- `Feature` - операция (primitive, sketch, extrude, etc.)
- `SceneDescription` - вся сцена

### WASM интеграция

```typescript
// src/wasm/engine.ts
import { engine } from '@/wasm/engine'

// Инициализация
await engine.initialize()

// Использование
const cubeId = engine.createCube(1, 1, 1)
const glb = await engine.buildSceneGLB(scene)
```

## Доступные скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev сервер (auto rebuild WASM) |
| `npm run build` | Production сборка |
| `npm run preview` | Предпросмотр production |
| `npm run build:wasm` | Собрать только WASM |
| `npm run watch:wasm` | Watch режим для WASM |

## Технологический стек

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Immer** - Immutable updates

### 3D
- **Three.js** - WebGL рендеринг
- **@react-three/fiber** - React renderer для Three.js
- **@react-three/drei** - Helpers (OrbitControls, Grid, etc.)

### WASM
- **Rust** - Systems programming
- **wasm-bindgen** - JS/WASM interop
- **wasm-pack** - Build tool
- **vcad** - CAD kernel
- **manifold-rs** - CSG operations (optional)

## MVP Функции

### ✅ Реализовано (базовая структура)
- [x] React + WASM интеграция
- [x] Toolbar с примитивами
- [x] Scene Tree
- [x] Property Panel
- [x] 3D Viewport (Three.js)
- [x] Zustand state management
- [x] WASM модуль (заглушки)

### 🚧 В процессе
- [ ] Sketch mode
  - [ ] Line, Circle, Rectangle
  - [ ] Constraints
  - [ ] Dimension tools
- [ ] Extrude
  - [ ] Forward/backward
  - [ ] Draft angle
  - [ ] Cut extrude
- [ ] Fillet/Chamfer 3D
  - [ ] Edge selection
  - [ ] Preview
  - [ ] Apply operation
- [ ] CSG операции
  - [ ] Union, Difference, Intersection
  - [ ] Visual preview

### 📋 Запланировано
- [ ] Undo/Redo
- [ ] File operations (Save/Load)
- [ ] Export (STL, OBJ, STEP)
- [ ] Измерения
- [ ] Hotkeys
- [ ] Dark/Light theme
- [ ] AI Chat (позже)

## Разработка

### Добавление новой функции

1. **Rust side** (WASM):
```rust
// crates/vcad-engine/src/my_feature.rs
#[wasm_bindgen]
pub fn my_function(param: f64) -> Result<String, JsValue> {
    // Implementation
    Ok("result".to_string())
}
```

2. **TypeScript wrapper**:
```typescript
// src/wasm/engine.ts
export class VcadEngine {
  myFunction(param: number): string {
    this.ensureReady()
    return wasmModule.my_function(param)
  }
}
```

3. **React component**:
```tsx
// src/components/ui/MyButton.tsx
import { engine } from '@/wasm/engine'

export function MyButton() {
  const handleClick = () => {
    const result = engine.myFunction(42)
    console.log(result)
  }

  return <button onClick={handleClick}>My Feature</button>
}
```

### Debugging WASM

```bash
# Build в debug режиме
cd crates/vcad-engine
wasm-pack build --target web --dev --out-dir ../../src/wasm/pkg

# Логи в браузере
# WASM использует tracing-wasm → browser console
```

### Hot reload

```bash
# Terminal 1: Watch WASM changes
npm run watch:wasm

# Terminal 2: Dev server
npm run dev
```

## Отличия от desktop версии

| Функция | Desktop (egui) | Web (React + WASM) |
|---------|----------------|---------------------|
| UI Framework | egui | React |
| 3D Rendering | wgpu/OpenGL | Three.js/WebGL |
| CAD Engine | Native vcad | WASM vcad |
| File Dialogs | rfd | Web File API |
| Async | Tokio | wasm-bindgen-futures |
| Performance | 100% | ~95% |

## Performance

### Оптимизации WASM

```toml
# Cargo.toml
[profile.release]
opt-level = "z"     # Оптимизация по размеру
lto = true          # Link-time optimization
codegen-units = 1   # Лучшая оптимизация
```

### Ожидаемые размеры

- WASM module: ~1.5-3 MB (gzipped)
- React bundle: ~300 KB (gzipped)
- Total initial load: ~2-4 MB
- Cold start: 1-2 секунды
- Hot reload: мгновенно

## Deployment

### Static hosting (GitHub Pages, Netlify, Vercel)

```bash
npm run build

# Deploy dist/ folder
```

### Environment variables

```bash
# .env
VITE_API_URL=https://api.example.com
```

## Roadmap

См. [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) для детального плана разработки.

## Troubleshooting

### WASM module not found

```bash
# Пересобрать WASM
npm run build:wasm
```

### TypeScript errors

```bash
# Проверить типы
npx tsc --noEmit
```

### Build fails

```bash
# Очистить и пересобрать
rm -rf node_modules dist src/wasm/pkg
npm install
npm run build:wasm
npm run build
```

## License

MIT
