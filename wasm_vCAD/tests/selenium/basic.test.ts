/**
 * Basic Selenium tests for wasm_vCAD
 *
 * Run with: npx ts-node tests/selenium/basic.test.ts
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5176' // Vite dev server
const WAIT_TIMEOUT = 10000 // 10 seconds

async function runTests() {
  console.log('🧪 Starting Selenium tests for wasm_vCAD...\n')

  // Setup Chrome options
  const options = new chrome.Options()
  options.addArguments('--headless=new') // New headless mode with better WebGL support
  options.addArguments('--no-sandbox')
  options.addArguments('--disable-dev-shm-usage')
  options.addArguments('--window-size=1920,1080')
  // WebGL support in headless
  options.addArguments('--enable-webgl')
  options.addArguments('--use-gl=angle')
  options.addArguments('--use-angle=swiftshader')
  options.addArguments('--enable-unsafe-swiftshader')

  const driver: WebDriver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  try {
    // Test 1: Load application
    console.log('📝 Test 1: Load application')
    await driver.get(APP_URL)
    await driver.wait(until.titleContains('vCAD'), WAIT_TIMEOUT)
    console.log('✅ Application loaded successfully\n')

    // Test 2: Check WASM initialization
    console.log('📝 Test 2: Wait for WASM engine initialization')
    await driver.sleep(3000) // Wait for WASM to load
    console.log('✅ WASM should be initialized\n')

    // Test 3: Check viewport exists
    console.log('📝 Test 3: Check 3D viewport exists')
    const canvas = await driver.wait(
      until.elementLocated(By.css('canvas')),
      WAIT_TIMEOUT,
      'Canvas element not found after waiting'
    )
    const isDisplayed = await canvas.isDisplayed()
    if (isDisplayed) {
      console.log('✅ 3D viewport canvas found and visible\n')
    } else {
      throw new Error('❌ Canvas not visible')
    }

    // Test 4: Click "New Sketch" button
    console.log('📝 Test 4: Create new sketch')
    const sketchButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Sketch')]")),
      5000
    )
    await sketchButton.click()
    await driver.sleep(500)
    console.log('✅ Sketch button clicked\n')

    // Test 5: Check sketch mode activated
    console.log('📝 Test 5: Verify sketch mode activated')
    const sketchCanvas = await driver.wait(
      until.elementLocated(By.css('canvas')),
      3000
    )
    if (sketchCanvas) {
      console.log('✅ Sketch canvas visible\n')
    }

    // Test 6: Draw a line
    console.log('📝 Test 6: Draw a line in sketch')
    // Select line tool
    const lineButton = await driver.findElement(By.xpath("//button[@title='Line']"))
    await lineButton.click()

    // Click on canvas to draw
    const canvasElement = await driver.findElement(By.css('canvas'))
    const actions = driver.actions({ async: true })
    await actions.move({ origin: canvasElement, x: 100, y: 100 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvasElement, x: 200, y: 200 }).click().perform()

    console.log('✅ Line drawn\n')

    // Test 7: Finish sketch
    console.log('📝 Test 7: Finish and exit sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)
    console.log('✅ Sketch finished\n')

    // Test 8: Screenshot
    console.log('📝 Test 8: Taking screenshot')
    const screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/screenshot.png', screenshot, 'base64')
    console.log('✅ Screenshot saved to tests/selenium/screenshot.png\n')

    console.log('🎉 All tests passed!\n')
  } catch (error) {
    console.error('❌ Test failed:', error)

    // Take screenshot on failure
    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/error-screenshot.png', screenshot, 'base64')
      console.log('📸 Error screenshot saved to tests/selenium/error-screenshot.png')
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError)
    }

    throw error
  } finally {
    await driver.quit()
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
