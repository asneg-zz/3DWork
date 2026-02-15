# Roadmap: SaaS САПР для 3D-печати

## Общая архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    Браузер (React + Three.js)                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                        WebSocket + REST
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway (Rust/Axum)                    │
│                 Auth, Rate Limit, Load Balancing                │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  CAD Engine   │     │  Export Service │     │  User Service   │
│    (Rust)     │     │     (Rust)      │     │    (Rust)       │
└───────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                ▼
                    PostgreSQL + Redis + S3
```

---

## Фаза 1: Подготовка ядра (2-3 недели)

### 1.1 Рефакторинг crates/shared
- [ ] Выделить CSG операции в отдельный модуль `cad-core`
- [ ] Создать чистый API без зависимости от UI
- [ ] Добавить сериализацию всех операций (JSON/MessagePack)
- [ ] Написать unit-тесты для всех операций

### 1.2 Создание cad-core библиотеки
```
crates/
├── cad-core/          # Ядро CAD (новое)
│   ├── src/
│   │   ├── csg.rs           # CSG операции
│   │   ├── sketch.rs        # 2D эскизы
│   │   ├── constraints.rs   # Ограничения
│   │   ├── mesh.rs          # Работа с мешами
│   │   ├── export/          # Экспорт форматов
│   │   │   ├── stl.rs
│   │   │   ├── obj.rs
│   │   │   ├── step.rs
│   │   │   └── gcode.rs
│   │   └── lib.rs
│   └── Cargo.toml
├── shared/            # Общие типы
└── gui/               # Desktop GUI (существующий)
```

### 1.3 API интерфейс ядра
```rust
// cad-core/src/lib.rs
pub struct CadEngine {
    scene: Scene,
}

impl CadEngine {
    pub fn new() -> Self;
    pub fn execute(&mut self, command: Command) -> Result<CommandResult>;
    pub fn export(&self, format: ExportFormat) -> Result<Vec<u8>>;
    pub fn import(&mut self, data: &[u8], format: ImportFormat) -> Result<()>;
    pub fn get_mesh(&self) -> TriangleMesh;
    pub fn serialize(&self) -> Vec<u8>;
    pub fn deserialize(data: &[u8]) -> Result<Self>;
}

pub enum Command {
    CreateBody { name: String },
    AddSketch { body_id: String, plane: Plane },
    AddSketchElement { body_id: String, sketch_id: String, element: SketchElement },
    Extrude { body_id: String, sketch_id: String, params: ExtrudeParams },
    Revolve { body_id: String, sketch_id: String, params: RevolveParams },
    Boolean { op: BooleanOp, left: String, right: String },
    // ...
}
```

---

## Фаза 2: Backend API (3-4 недели)

### 2.1 Структура сервера
```
crates/
├── cad-core/
├── cad-server/        # API сервер (новое)
│   ├── src/
│   │   ├── main.rs
│   │   ├── api/
│   │   │   ├── mod.rs
│   │   │   ├── projects.rs    # CRUD проектов
│   │   │   ├── operations.rs  # CAD операции
│   │   │   ├── export.rs      # Экспорт файлов
│   │   │   └── websocket.rs   # Real-time обновления
│   │   ├── auth/
│   │   │   ├── mod.rs
│   │   │   ├── jwt.rs
│   │   │   └── middleware.rs
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── models.rs
│   │   │   └── queries.rs
│   │   └── services/
│   │       ├── cad.rs         # CAD сессии
│   │       ├── billing.rs     # Подписки
│   │       └── storage.rs     # S3 файлы
│   └── Cargo.toml
```

### 2.2 REST API эндпоинты
```
# Аутентификация
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh

# Проекты
GET    /api/projects
POST   /api/projects
GET    /api/projects/{id}
PUT    /api/projects/{id}
DELETE /api/projects/{id}

# CAD операции
POST   /api/projects/{id}/commands     # Выполнить команду
GET    /api/projects/{id}/mesh         # Получить меш для визуализации
GET    /api/projects/{id}/history      # История операций
POST   /api/projects/{id}/undo
POST   /api/projects/{id}/redo

# Экспорт
POST   /api/projects/{id}/export/stl
POST   /api/projects/{id}/export/obj
POST   /api/projects/{id}/export/step
POST   /api/projects/{id}/export/gcode

# WebSocket
WS     /api/ws/projects/{id}           # Real-time обновления
```

### 2.3 База данных (PostgreSQL)
```sql
-- Пользователи
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    plan VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Проекты
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    scene_data BYTEA,  -- Сериализованная сцена
    thumbnail_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- История операций (для undo/redo)
CREATE TABLE project_history (
    id SERIAL PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    command_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Подписки
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    plan VARCHAR(50) NOT NULL,
    stripe_subscription_id VARCHAR(255),
    status VARCHAR(50),
    expires_at TIMESTAMP
);
```

### 2.4 WebSocket протокол
```json
// Клиент -> Сервер
{
    "type": "command",
    "payload": {
        "command": "Extrude",
        "params": { "body_id": "...", "height": 10 }
    }
}

// Сервер -> Клиент
{
    "type": "mesh_update",
    "payload": {
        "vertices": [...],
        "indices": [...],
        "normals": [...]
    }
}

{
    "type": "error",
    "payload": {
        "code": "INVALID_OPERATION",
        "message": "Cannot extrude empty sketch"
    }
}
```

---

## Фаза 3: Web Frontend (4-6 недель)

### 3.1 Структура фронтенда
```
web/
├── src/
│   ├── components/
│   │   ├── Viewport3D/        # Three.js canvas
│   │   ├── Toolbar/           # Инструменты
│   │   ├── SceneTree/         # Дерево объектов
│   │   ├── Properties/        # Свойства
│   │   └── SketchTools/       # Инструменты эскиза
│   ├── hooks/
│   │   ├── useCAD.ts          # CAD операции
│   │   ├── useWebSocket.ts    # Real-time
│   │   └── useProject.ts      # Управление проектом
│   ├── store/                 # Zustand/Redux
│   ├── api/                   # REST клиент
│   └── App.tsx
├── package.json
└── vite.config.ts
```

### 3.2 3D Визуализация (Three.js)
```typescript
// components/Viewport3D/index.tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

export function Viewport3D({ mesh }) {
    return (
        <Canvas camera={{ position: [5, 5, 5] }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} />

            <mesh geometry={mesh}>
                <meshStandardMaterial color="#888" />
            </mesh>

            <Grid infiniteGrid />
            <OrbitControls />
        </Canvas>
    );
}
```

### 3.3 Стек технологий
- **React 18** — UI фреймворк
- **Three.js + React Three Fiber** — 3D рендеринг
- **Zustand** — State management
- **TanStack Query** — API запросы
- **Tailwind CSS** — Стилизация
- **Vite** — Сборка

---

## Фаза 4: Фичи для 3D-печати (3-4 недели)

### 4.1 Подготовка к печати
- [ ] Проверка водонепроницаемости меша
- [ ] Авто-ремонт (закрытие дыр, исправление нормалей)
- [ ] Анализ нависающих частей
- [ ] Оценка времени печати
- [ ] Расчёт материала

### 4.2 Генерация поддержек
- [ ] Автоматическая генерация
- [ ] Ручное редактирование
- [ ] Разные типы (линейные, древовидные)

### 4.3 Слайсинг (опционально)
- [ ] Интеграция с существующими слайсерами API
- [ ] Или встроенный слайсер на Rust

### 4.4 Форматы экспорта
- [ ] STL (ASCII и Binary)
- [ ] OBJ + MTL
- [ ] 3MF (с метаданными)
- [ ] STEP (для ЧПУ)
- [ ] GCODE (прямой)

---

## Фаза 5: Параметризация (4-5 недель)

Полноценное параметрическое моделирование — ключевое отличие от Tinkercad.

### 5.1 Переменные и параметры

**Структура данных:**
```rust
// cad-core/src/parameters.rs

/// Параметр — именованное значение
pub struct Parameter {
    pub name: String,           // "width", "hole_radius"
    pub value: ParameterValue,  // число, формула или ссылка
    pub unit: Option<Unit>,     // mm, deg, etc.
    pub description: String,
}

pub enum ParameterValue {
    /// Фиксированное число
    Number(f64),
    /// Формула: "width * 2 + 10"
    Formula(String),
    /// Ссылка на другой параметр или размер
    Reference(ParameterRef),
}

pub struct ParameterRef {
    pub body_id: Option<String>,
    pub feature_id: Option<String>,
    pub element_id: Option<String>,
    pub property: String,  // "length", "radius", "angle"
}
```

**Задачи:**
- [ ] Создать модуль `parameters.rs` в cad-core
- [ ] Добавить `parameters: HashMap<String, Parameter>` в Body
- [ ] UI для создания/редактирования переменных
- [ ] Сохранение/загрузка параметров в JSON

### 5.2 Формулы и вычисления

**Поддерживаемый синтаксис:**
```
width * 2              // умножение
height + 10            // сложение
sqrt(a^2 + b^2)        // функции
min(width, height)     // min/max
sin(angle), cos(angle) // тригонометрия
if(width > 10, 5, 3)   // условия
```

**Задачи:**
- [ ] Парсер формул (использовать `evalexpr` или свой)
- [ ] Валидация формул (циклические зависимости)
- [ ] Пересчёт зависимых параметров при изменении
- [ ] Отображение ошибок в формулах
- [ ] Автодополнение имён параметров в UI

**Структура зависимостей:**
```
┌─────────────────────────────────────────┐
│  width = 10                             │
│    ↓                                    │
│  height = width * 2  (= 20)             │
│    ↓                                    │
│  depth = height / 2  (= 10)             │
│    ↓                                    │
│  hole_radius = min(width, depth) * 0.3  │
└─────────────────────────────────────────┘
```

### 5.3 Связи между элементами

**Типы связей:**
```rust
pub enum DimensionLink {
    /// Равенство: длина линии A = длина линии B
    Equal {
        source: ParameterRef,
        target: ParameterRef,
    },
    /// Пропорция: радиус = длина * 0.5
    Proportional {
        source: ParameterRef,
        target: ParameterRef,
        factor: f64,
    },
    /// Формула: высота = sqrt(a^2 + b^2)
    Formula {
        target: ParameterRef,
        formula: String,
    },
}
```

**Задачи:**
- [ ] UI для создания связей (drag-and-drop между размерами)
- [ ] Визуализация связей на эскизе (стрелки/линии)
- [ ] Автоматическое обновление при изменении источника
- [ ] Обнаружение и предотвращение циклов
- [ ] Блокировка переопределённых размеров

### 5.4 Панель параметров

**UI компоненты:**
```
┌─────────────────────────────────────┐
│ Параметры                       [+] │
├─────────────────────────────────────┤
│ width      │ 10.0    │ мм    │ [=] │
│ height     │ =width*2│ 20.0  │ [f] │
│ depth      │ 15.0    │ мм    │ [=] │
│ hole_r     │ 3.0     │ мм    │ [=] │
├─────────────────────────────────────┤
│ Связи                               │
│ Line1.length ─────► Line2.length    │
│ Circle1.radius = hole_r             │
└─────────────────────────────────────┘

[=] — фиксированное значение
[f] — формула
```

**Задачи:**
- [ ] Панель параметров в UI (свёрнутая/развёрнутая)
- [ ] Редактирование значений inline
- [ ] Редактор формул с подсветкой синтаксиса
- [ ] Drag параметра на размер для создания связи
- [ ] Контекстное меню: "Сделать параметром"

### 5.5 Решатель ограничений (Constraint Solver)

**Улучшение существующего решателя:**
- [ ] Учёт параметрических размеров
- [ ] Приоритеты ограничений
- [ ] Недоопределённые/переопределённые эскизы
- [ ] Визуализация степеней свободы

**Статусы эскиза:**
```
┌─────────────────────────────────────┐
│ Статус эскиза:                      │
│ ● Полностью определён (зелёный)     │
│ ○ Недоопределён: 2 DOF (жёлтый)     │
│ ○ Переопределён: конфликт (красный) │
└─────────────────────────────────────┘
```

### 5.6 Примеры использования

**Пример 1: Параметрическая коробка**
```json
{
  "parameters": {
    "width": { "value": 50, "unit": "mm" },
    "height": { "value": "width * 0.6" },
    "wall": { "value": 2, "unit": "mm" },
    "inner_w": { "value": "width - wall * 2" },
    "inner_h": { "value": "height - wall * 2" }
  }
}
```

**Пример 2: Связанные отверстия**
```
hole1.radius = main_radius
hole2.radius = main_radius
hole3.radius = main_radius
→ Изменил main_radius — все отверстия обновились
```

---

## Фаза 6: Биллинг и монетизация (2-3 недели)

### 5.1 Тарифные планы (Россия)
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   Старт     │   Хобби     │   Про       │   Бизнес    │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ Бесплатно   │ 299 ₽/мес   │ 990 ₽/мес   │ 2,990 ₽/мес │
│             │ 2,990 ₽/год │ 9,900 ₽/год │ 29,900 ₽/год│
├─────────────┼─────────────┼─────────────┼─────────────┤
│ 3 проекта   │ 20 проектов │ Безлимит    │ + Команда   │
│ 100 MB      │ 2 GB        │ 20 GB       │ 100 GB      │
│ STL         │ + OBJ, 3MF  │ + STEP      │ + API       │
│ Водяной знак│             │             │ White-label │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### 5.2 Интеграция платежей (Россия)

**Основной: ЮKassa**
- [ ] Интеграция ЮKassa API
- [ ] Рекуррентные платежи (подписки)
- [ ] Webhook обработка
- [ ] Автоматическая фискализация (54-ФЗ)

**Резервный: CloudPayments**
- [ ] Интеграция как fallback

**Способы оплаты:**
- Банковские карты (Visa, MasterCard, МИР)
- СБП (Система быстрых платежей)
- ЮMoney (бывш. Яндекс.Деньги)
- SberPay

### 5.3 Лимиты и квоты
- [ ] Ограничение по количеству проектов
- [ ] Ограничение по размеру хранилища
- [ ] Rate limiting API
- [ ] Сложность операций (для бесплатного плана)

---

## Фаза 7: Инфраструктура (2-3 недели)

### 6.1 Docker
```dockerfile
# Dockerfile для cad-server
FROM rust:1.75 as builder
WORKDIR /app
COPY . .
RUN cargo build --release -p cad-server

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/cad-server /usr/local/bin/
CMD ["cad-server"]
```

### 6.2 Docker Compose (dev)
```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://...
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7

  web:
    build: ./web
    ports:
      - "3000:3000"
```

### 6.3 Хостинг (Россия)

**Рекомендуемые провайдеры:**
| Провайдер | Использование | ФЗ-152 |
|-----------|---------------|--------|
| Яндекс Cloud | Основной | ✓ |
| VK Cloud | Резервный | ✓ |
| Selectel | S3 хранилище | ✓ |

**Компоненты:**
- [ ] Compute Cloud (VM для API)
- [ ] Managed PostgreSQL
- [ ] Object Storage (S3-совместимый)
- [ ] CDN для статики

### 6.4 CI/CD (GitHub Actions)
- [ ] Тесты на PR
- [ ] Автосборка Docker образов
- [ ] Деплой в staging (Яндекс Cloud)
- [ ] Деплой в production

### 6.5 Соответствие законодательству
- [ ] ФЗ-152 (персональные данные на серверах в РФ)
- [ ] 54-ФЗ (онлайн-кассы через ЮKassa)
- [ ] Заявка в реестр отечественного ПО

---

## Фаза 8: Дополнительные фичи (ongoing)

### 7.1 Коллаборация
- [ ] Общие проекты
- [ ] Права доступа (view/edit/admin)
- [ ] Комментарии к моделям
- [ ] История изменений с авторством

### 7.2 Библиотека компонентов
- [ ] Стандартные детали (болты, гайки)
- [ ] Пользовательские библиотеки
- [ ] Публичный каталог

### 7.3 Интеграции
- [ ] OctoPrint — прямая печать
- [ ] Klipper — прямая печать
- [ ] Thingiverse — импорт/экспорт
- [ ] Printables — импорт/экспорт

### 7.4 AI фичи
- [ ] Генерация моделей по описанию
- [ ] Оптимизация для печати
- [ ] Авто-ориентация модели

---

## Оценка времени

| Фаза | Описание | Срок |
|------|----------|------|
| 1 | Подготовка ядра | 2-3 недели |
| 2 | Backend API | 3-4 недели |
| 3 | Web Frontend | 4-6 недель |
| 4 | Фичи 3D-печати | 3-4 недели |
| 5 | **Параметризация** | **4-5 недель** |
| 6 | Биллинг | 2-3 недели |
| 7 | Инфраструктура | 2-3 недели |
| **Итого MVP** | | **20-28 недель** |

---

## Приоритеты MVP

**Must have:**
- Базовые CAD операции (эскиз, выдавливание, вырез)
- **Параметры и переменные**
- **Формулы в размерах**
- STL экспорт
- Регистрация/авторизация
- 1 бесплатный тариф + 1 платный

**Should have:**
- **Связи между элементами (размер A = размер B)**
- Проверка печатаемости
- История операций (undo/redo)
- OBJ/3MF экспорт

**Nice to have:**
- Генерация поддержек
- Коллаборация
- API для интеграций

---

## Конкуренты для анализа

1. **Onshape** — профессиональный облачный CAD
2. **Tinkercad** — простой CAD для начинающих
3. **SelfCAD** — CAD с фичами для 3D-печати
4. **Vectary** — 3D дизайн в браузере
5. **Clara.io** — облачное 3D моделирование

---

*Документ создан: 2026-02-11*
*Последнее обновление: 2026-02-11*
