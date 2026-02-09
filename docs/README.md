# Документация VCAD

## Содержание

| Документ | Описание |
|----------|----------|
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | Структура проекта, модули, зависимости |
| [OPERATIONS.md](OPERATIONS.md) | Описание операций сцены (примитивы, булевы, эскизы, Cut) |
| [USER_GUIDE.md](USER_GUIDE.md) | Руководство пользователя |
| [json-scene-format.md](json-scene-format.md) | Формат JSON для сохранения сцен |

## Быстрый старт

### Запуск GUI приложения
```bash
cargo run -p vcad-gui
```

### Запуск веб-сервера
```bash
cargo run -p vcad-server
```

### Запуск веб-клиента
```bash
cd web
npm install
npm run dev
```

## Технологии

- **Rust** — основной язык
- **egui** — GUI фреймворк
- **vcad/manifold3d** — CSG операции
- **OpenGL** — 3D рендеринг
- **React + Babylon.js** — веб-клиент
