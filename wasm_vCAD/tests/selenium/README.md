# Selenium Tests for wasm_vCAD

## Установка

Selenium уже установлен в проект:
```bash
npm install --save-dev selenium-webdriver chromedriver @types/selenium-webdriver
```

## Запуск тестов

### 1. Запустите dev сервер
```bash
npm run dev
```

### 2. В другом терминале запустите тесты
```bash
# С UI (видно браузер)
npx ts-node tests/selenium/basic.test.ts

# Headless (без UI)
# Уже настроено по умолчанию в коде
```

### 3. Добавить в package.json
```json
{
  "scripts": {
    "test:e2e": "npx ts-node tests/selenium/basic.test.ts"
  }
}
```

Тогда можно запускать:
```bash
npm run test:e2e
```

## Возможности тестов

- ✅ Проверка загрузки приложения
- ✅ Проверка инициализации WASM
- ✅ Клики по кнопкам
- ✅ Рисование в скетче
- ✅ Скриншоты для визуальной проверки
- ✅ Автоматическое создание скриншотов при ошибках

## Примеры тестов

### Тест создания примитива
```typescript
const cubeButton = await driver.findElement(By.xpath("//button[@title='Cube']"))
await cubeButton.click()
await driver.sleep(500)
```

### Тест Boolean операций
```typescript
// Select two bodies
const body1 = await driver.findElement(By.xpath("//div[contains(text(), 'Body 1')]"))
await body1.click()

const body2 = await driver.findElement(By.xpath("//div[contains(text(), 'Body 2')]"))
await body2.click()

// Click Union
const unionBtn = await driver.findElement(By.xpath("//button[contains(text(), 'Union')]"))
await unionBtn.click()
```

### Тест Trim операции
```typescript
// Enter sketch mode
const sketchBtn = await driver.findElement(By.xpath("//button[contains(., 'Sketch')]"))
await sketchBtn.click()

// Draw two intersecting lines
// ... draw line 1
// ... draw line 2

// Select trim tool
const trimBtn = await driver.findElement(By.xpath("//button[@title='Trim']"))
await trimBtn.click()

// Click on line segment to trim
const canvas = await driver.findElement(By.css('canvas'))
await driver.actions().move({ origin: canvas, x: 150, y: 150 }).click().perform()
```

## Структура тестов

```
tests/
├── selenium/
│   ├── basic.test.ts         # Базовые тесты
│   ├── sketch.test.ts        # Тесты скетча (можно добавить)
│   ├── boolean.test.ts       # Тесты Boolean операций
│   ├── screenshot.png        # Скриншоты результатов
│   └── README.md            # Эта документация
```

## CI/CD интеграция

Для GitHub Actions:
```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build:wasm
      - run: npm run dev &
      - run: sleep 5
      - run: npm run test:e2e
```
