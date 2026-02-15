# План конвертации vCAD Desktop → WASM

## Текущее состояние

### ✅ Готовый пример
В `/wasm-demo` создан работающий WASM пример egui приложения:
- Запуск: `cd wasm-demo && trunk serve --release --open`
- URL: http://127.0.0.1:8080/
- Демонстрирует полный UI цикл в браузере

### 📊 Архитектура сейчас

```
┌──────────────────────┐     ┌──────────────────────┐
│  Desktop (Rust/egui) │     │  Web (React/Three.js)│
│  crates/gui          │     │  web/                │
│  ✅ Полный функционал│     │  ⚠️ Упрощенная версия│
│  ❌ Только локально  │     │  ✅ Браузер          │
└──────────────────────┘     └──────────────────────┘
                                      ↓ REST API
                             ┌──────────────────────┐
                             │  Backend (Rust/Axum) │
                             │  crates/server       │
                             └──────────────────────┘
```

### 🎯 Цель после конвертации

```
┌──────────────────────┐     ┌──────────────────────┐
│  Desktop (Rust/egui) │     │  Web WASM            │
│  crates/gui          │     │  Same crates/gui!    │
│  ✅ Native binary    │     │  ✅ Compiled to WASM │
│  ✅ Максимальная     │     │  ✅ В браузере       │
│     производительность│     │  ✅ Тот же код!      │
└──────────────────────┘     └──────────────────────┘

         ЕДИНАЯ КОДОВАЯ БАЗА
     Conditional compilation (#[cfg(target_arch = "wasm32")])
```

## Преимущества WASM подхода

### ✅ Плюсы
1. **Единая кодовая база** - один код для desktop и web
2. **Синхронизация функций** - все фичи автоматически в обеих версиях
3. **Производительность** - WASM близок к нативной скорости
4. **Безопасность** - Rust гарантии в браузере
5. **Офлайн работа** - можно кешировать WASM
6. **Нет серверной логики** - pure client-side

### ⚠️ Ограничения
1. **Размер загрузки** - WASM файл ~2-10 MB (сжимается gzip)
2. **Время инициализации** - 1-3 секунды на первую загрузку
3. **File system** - нет прямого доступа, только Web APIs
4. **Многопоточность** - ограничена (SharedArrayBuffer)
5. **Debugging** - сложнее чем JS (но есть source maps)

## Пошаговый план конвертации

### Фаза 1: Подготовка зависимостей (2-4 дня)

#### 1.1 Проверить совместимость крейтов

```bash
# Создать тестовый проект
cargo new --lib vcad-gui-wasm-test
cd vcad-gui-wasm-test

# Добавить зависимости по одной и пробовать собрать
cargo add eframe egui
cargo build --target wasm32-unknown-unknown

# Проверить каждую зависимость из crates/gui/Cargo.toml
```

**Потенциально проблемные:**
- ✅ `eframe`, `egui` - поддерживают WASM
- ✅ `glow` - WebGL backend работает
- ✅ `serde`, `serde_json` - совместимы
- ⚠️ `tokio` - нужна замена на `wasm-bindgen-futures`
- ⚠️ `reqwest` - работает с feature `wasm`
- ⚠️ `rfd` (file dialogs) - не работает, нужна замена
- ❓ `manifold-rs` - **КРИТИЧНО**: проверить поддержку WASM
- ❓ `vcad` library - проверить компиляцию в WASM

#### 1.2 Адаптировать Cargo.toml

```toml
# crates/gui/Cargo.toml

[dependencies]
# ... существующие зависимости ...

# WASM-specific dependencies
[target.'cfg(target_arch = "wasm32")'.dependencies]
wasm-bindgen = "0.2"
wasm-bindgen-futures = "0.4"
web-sys = { version = "0.3", features = [
    "Window",
    "Document",
    "HtmlCanvasElement",
    "HtmlInputElement",
    "FileReader",
    "Blob",
] }
console_error_panic_hook = "0.1"
tracing-wasm = "0.2"

# Replace tokio with wasm-bindgen-futures for WASM
[target.'cfg(not(target_arch = "wasm32"))'.dependencies]
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync"] }

# reqwest with WASM support
reqwest = { version = "0.12", default-features = false, features = [
    "json",
    "wasm",  # Enable WASM support
] }

# Replace rfd (не работает в WASM)
[target.'cfg(not(target_arch = "wasm32"))'.dependencies]
rfd = "0.15"
```

### Фаза 2: Адаптация кода (5-10 дней)

#### 2.1 Создать WASM entry point

```rust
// crates/gui/src/main.rs

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    // Существующий native код
    tracing_subscriber::fmt()
        .with_env_filter(...)
        .init();

    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("vCAD — 3D CAD Editor")
            .with_inner_size([1400.0, 900.0]),
        ..Default::default()
    };

    eframe::run_native(
        "vcad-gui",
        native_options,
        Box::new(|cc| Ok(Box::new(CadApp::new(cc, None)))),
    )
    .unwrap();
}

#[cfg(target_arch = "wasm32")]
fn main() {
    use eframe::wasm_bindgen::JsCast;

    // Setup panic hook for better error messages
    console_error_panic_hook::set_once();

    // Setup tracing for WASM
    tracing_wasm::set_as_global_default();

    let web_options = eframe::WebOptions::default();

    wasm_bindgen_futures::spawn_local(async {
        let document = web_sys::window()
            .expect("No window")
            .document()
            .expect("No document");

        let canvas = document
            .get_element_by_id("vcad_canvas")
            .expect("Failed to find vcad_canvas")
            .dyn_into::<web_sys::HtmlCanvasElement>()
            .expect("vcad_canvas was not a HtmlCanvasElement");

        eframe::WebRunner::new()
            .start(
                canvas,
                web_options,
                Box::new(|cc| Ok(Box::new(CadApp::new(cc, None)))),
            )
            .await
            .expect("failed to start eframe");
    });
}
```

#### 2.2 Адаптировать file operations

```rust
// crates/gui/src/export.rs (или где используется rfd)

#[cfg(not(target_arch = "wasm32"))]
pub fn save_file_dialog(extension: &str) -> Option<PathBuf> {
    rfd::FileDialog::new()
        .add_filter(extension, &[extension])
        .save_file()
}

#[cfg(target_arch = "wasm32")]
pub fn save_file_dialog(extension: &str) -> Option<PathBuf> {
    // В WASM используем download API
    None // Пока заглушка
}

#[cfg(target_arch = "wasm32")]
pub fn download_file(filename: &str, data: &[u8]) {
    use wasm_bindgen::JsCast;
    use web_sys::{Blob, HtmlAnchorElement, Url};

    let array = js_sys::Uint8Array::from(data);
    let blob = Blob::new_with_u8_array_sequence(&js_sys::Array::of1(&array))
        .expect("Failed to create blob");

    let url = Url::create_object_url_with_blob(&blob)
        .expect("Failed to create URL");

    let document = web_sys::window().unwrap().document().unwrap();
    let a = document
        .create_element("a")
        .unwrap()
        .dyn_into::<HtmlAnchorElement>()
        .unwrap();

    a.set_href(&url);
    a.set_download(filename);
    a.click();

    Url::revoke_object_url(&url).ok();
}
```

#### 2.3 Адаптировать AI chat (async)

```rust
// crates/gui/src/state/chat.rs

#[cfg(not(target_arch = "wasm32"))]
use tokio::sync::mpsc;

#[cfg(target_arch = "wasm32")]
use futures::channel::mpsc;

// Код остается практически таким же, но с conditional compilation
```

### Фаза 3: Сборка инфраструктура (1-2 дня)

#### 3.1 Создать index.html

```html
<!-- crates/gui/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>vCAD - 3D CAD Editor</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: #1a1a1a;
        }
        #vcad_canvas {
            width: 100%;
            height: 100%;
        }
        .loader {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-family: Arial, sans-serif;
        }
    </style>
</head>
<body>
    <div class="loader" id="loader">
        <h2>Loading vCAD...</h2>
        <progress></progress>
    </div>
    <canvas id="vcad_canvas"></canvas>

    <script>
        window.addEventListener('load', () => {
            setTimeout(() => {
                document.getElementById('loader').style.display = 'none';
            }, 2000);
        });
    </script>
</body>
</html>
```

#### 3.2 Создать Trunk.toml

```toml
# crates/gui/Trunk.toml

[build]
target = "index.html"
release = true
dist = "dist"

[watch]
ignore = ["target/", "dist/"]

[serve]
addresses = ["127.0.0.1"]
port = 8081
open = true

[clean]
dist = "dist"

[[hooks]]
stage = "pre_build"
command = "echo"
command_arguments = ["Building vCAD WASM..."]

[[hooks]]
stage = "post_build"
command = "echo"
command_arguments = ["Build complete! WASM ready."]
```

### Фаза 4: Тестирование (3-5 дней)

#### 4.1 Сборка и первый запуск

```bash
cd crates/gui

# Первая сборка (может занять время)
trunk build --release

# Dev режим
trunk serve

# Production
trunk build --release --public-url /vcad/
```

#### 4.2 Чек-лист тестирования

- [ ] Загрузка приложения в браузере
- [ ] Меню работает
- [ ] Scene tree отображается
- [ ] 3D viewport рендерит
- [ ] Создание примитивов
- [ ] Sketch mode
- [ ] CSG операции
- [ ] Fillet/Chamfer
- [ ] Экспорт (download через browser API)
- [ ] Undo/Redo
- [ ] Persistence (localStorage)
- [ ] Performance (60 FPS при вращении)

### Фаза 5: Оптимизация (2-3 дня)

#### 5.1 Размер WASM

```toml
# Cargo.toml - оптимизации для WASM
[profile.release]
opt-level = 'z'     # Optimize for size
lto = true          # Link-time optimization
codegen-units = 1   # Better optimization
panic = 'abort'     # Smaller binary
strip = true        # Strip symbols
```

```bash
# После сборки - сжатие
wasm-opt -Oz -o output.wasm input.wasm
gzip output.wasm
```

**Ожидаемые размеры:**
- WASM без оптимизации: ~15 MB
- WASM с оптимизациями: ~5 MB
- WASM.gz (gzip): ~1.5-2 MB

#### 5.2 Lazy loading

Рассмотреть разделение на модули:
- Core UI - загружается сразу
- CAD engine - lazy load
- Экспорт форматы - lazy load по требованию

### Фаза 6: Deploy (1 день)

#### 6.1 Static hosting

Результат `trunk build --release` можно разместить на:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- S3 + CloudFront

#### 6.2 COOP/COEP заголовки

Для SharedArrayBuffer (многопоточность):
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Гибридный подход

Если полная конвертация слишком сложна, можно сделать **два билда**:

```
crates/
├── gui/              # Native desktop (полный функционал)
└── gui-wasm/         # WASM версия (упрощенная)
    ├── src/
    │   └── main.rs   # Re-exports from gui, но WASM entry point
    └── Cargo.toml    # Зависимости с WASM constraints
```

Общий код в `crates/gui/src/lib.rs`, разные main.rs для каждой платформы.

## Риски и их митигация

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| manifold-rs не работает в WASM | Высокая | Fallback на three-bvh-csg (как в web/) |
| vcad library несовместим | Средняя | Использовать Server API для CAD операций |
| Большой размер WASM | Средняя | Агрессивные оптимизации + lazy loading |
| Медленный startup | Низкая | Streaming compilation, кеширование |
| File dialogs не работают | 100% | Web File API (уже решено) |

## Рекомендации

### Начать с:
1. ✅ **Минимальный пример** (уже готов в `/wasm-demo`)
2. Проверить **manifold-rs** совместимость с WASM
3. Если manifold работает → **полная конвертация**
4. Если нет → **гибридный подход** (UI в WASM, CAD через Server API)

### Альтернативный подход:
Оставить оба проекта:
- `crates/gui` - Desktop (native, максимальная производительность)
- `web/` - Web (React, современный UX, проще для веб-разработчиков)
- Синхронизировать **только типы данных** через `crates/shared`

Это позволит:
- Desktop → для профессионалов, оффлайн работы
- Web → для быстрого доступа, демо, collaboration

## Следующий шаг

Хотите:
1. Попробовать собрать vcad-gui в WASM?
2. Проверить manifold-rs совместимость?
3. Создать proof-of-concept с упрощенной версией?
