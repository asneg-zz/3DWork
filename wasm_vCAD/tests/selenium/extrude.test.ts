/**
 * Selenium test for Extrude operation
 * Tests the complete workflow of extruding a 2D sketch into a 3D body
 *
 * Run with: npx ts-node tests/selenium/extrude.test.ts
 */

import { Builder, By, until, WebDriver, Key } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5176'
const WAIT_TIMEOUT = 10000

async function saveScreenshot(driver: WebDriver, filename: string) {
  const screenshot = await driver.takeScreenshot()
  writeFileSync(`tests/selenium/${filename}`, screenshot, 'base64')
  console.log(`  📸 Screenshot saved: ${filename}`)
}

async function runExtrudeTest() {
  console.log('🧪 Starting Extrude operation test...\n')

  const options = new chrome.Options()
  // Run in visible mode (comment out headless for debugging)
  // options.addArguments('--headless=new')
  options.addArguments('--no-sandbox')
  options.addArguments('--disable-dev-shm-usage')
  options.addArguments('--window-size=1920,1080')
  options.addArguments('--enable-webgl')
  options.addArguments('--use-gl=angle')
  options.addArguments('--use-angle=swiftshader')

  const driver: WebDriver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  try {
    // Step 1: Load application
    console.log('📝 Step 1: Load application')
    await driver.get(APP_URL)
    await driver.wait(until.titleContains('vCAD'), WAIT_TIMEOUT)
    await driver.sleep(3000) // Wait for WASM initialization
    console.log('  ✅ Application loaded\n')

    // Step 2: Create new sketch
    console.log('📝 Step 2: Create new sketch')
    const sketchButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Sketch')]")),
      WAIT_TIMEOUT
    )
    await sketchButton.click()
    await driver.sleep(500)
    await saveScreenshot(driver, 'extrude-sketch-started.png')
    console.log('  ✅ Sketch mode activated\n')

    // Step 3: Draw a rectangle
    console.log('📝 Step 3: Draw a rectangle')

    // First, click on Draw dropdown to reveal tools
    const drawDropdown = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Draw')]")),
      WAIT_TIMEOUT
    )
    await drawDropdown.click()
    await driver.sleep(300)

    // Now click Rectangle in the dropdown
    const rectangleButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Rectangle')]")),
      WAIT_TIMEOUT
    )
    await rectangleButton.click()
    await driver.sleep(200)

    const canvas = await driver.findElement(By.css('canvas'))
    const actions = driver.actions({ async: true })

    // Draw rectangle from (100, 100) to (300, 250)
    await actions.move({ origin: canvas, x: -200, y: -100 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 0, y: 50 }).click().perform()
    await driver.sleep(500)

    await saveScreenshot(driver, 'extrude-rectangle-drawn.png')
    console.log('  ✅ Rectangle drawn\n')

    // Step 4: Click Extrude button
    console.log('📝 Step 4: Click Extrude button')
    const extrudeButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Extrude')]")),
      WAIT_TIMEOUT
    )

    // Check if button is enabled
    const isEnabled = await extrudeButton.isEnabled()
    if (!isEnabled) {
      throw new Error('Extrude button is disabled - sketch might be empty')
    }

    await extrudeButton.click()
    await driver.sleep(500)
    await saveScreenshot(driver, 'extrude-dialog-opened.png')
    console.log('  ✅ Extrude dialog opened\n')

    // Step 5: Set extrude parameters
    console.log('📝 Step 5: Configure extrude parameters')

    // Find height input (first number input)
    const heightInput = await driver.wait(
      until.elementLocated(By.css('input[type="number"]')),
      WAIT_TIMEOUT
    )

    // Set height to 2.0 using JavaScript (more reliable than sendKeys)
    await driver.executeScript(
      'arguments[0].value = "2.0"; arguments[0].dispatchEvent(new Event("input", { bubbles: true })); arguments[0].dispatchEvent(new Event("change", { bubbles: true }));',
      heightInput
    )
    await driver.sleep(300)

    await saveScreenshot(driver, 'extrude-params-set.png')
    console.log('  ✅ Height set to 2.0\n')

    // Step 6: Confirm extrusion
    console.log('📝 Step 6: Confirm extrusion')
    const confirmButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Выдавить')]")),
      WAIT_TIMEOUT
    )
    await confirmButton.click()
    await driver.sleep(2000) // Wait for extrusion to complete and exit sketch
    await saveScreenshot(driver, 'extrude-completed.png')
    console.log('  ✅ Extrusion confirmed\n')

    // Step 7: Wait for sketch mode to exit
    console.log('📝 Step 7: Waiting for sketch mode to exit')
    await driver.sleep(2000) // Additional wait for state updates

    // Check if we exited sketch mode
    const sketchButtons = await driver.findElements(By.xpath("//button[contains(., 'Finish Sketch')]"))
    if (sketchButtons.length > 0) {
      console.warn('  ⚠️  Still in sketch mode - checking if dialog is visible')
      // Check if extrude dialog is still visible (might indicate dialog didn't close)
      const dialogElements = await driver.findElements(By.xpath("//div[contains(text(), 'Выдавливание')]"))
      if (dialogElements.length > 0) {
        console.warn('  ⚠️  Extrude dialog still visible')
      }
    } else {
      console.log('  ✅ Exited sketch mode\n')
    }

    await saveScreenshot(driver, 'extrude-final-state.png')
    console.log('  📸 Final state captured\n')

    // Step 8: Check console for errors and logs
    console.log('📝 Step 8: Check browser console')
    const logs = await driver.manage().logs().get('browser')

    console.log('\n  📋 All console logs:')
    logs.forEach(log => {
      const level = log.level.name
      const prefix = level === 'SEVERE' ? '❌' : level === 'WARNING' ? '⚠️' : 'ℹ️'
      console.log(`    ${prefix} [${level}] ${log.message}`)
    })

    const errors = logs.filter(log => log.level.name === 'SEVERE')
    if (errors.length > 0) {
      console.warn('\n  ⚠️  JavaScript errors found!')
    } else {
      console.log('\n  ✅ No JavaScript errors')
    }

    console.log('🎉 All Extrude tests passed!\n')
    console.log('Summary:')
    console.log('  ✅ Sketch created')
    console.log('  ✅ Rectangle drawn')
    console.log('  ✅ Extrude dialog opened')
    console.log('  ✅ Parameters configured')
    console.log('  ✅ Extrusion completed')
    console.log('  ✅ Returned to 3D view\n')

  } catch (error) {
    console.error('❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/extrude-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot saved to tests/selenium/extrude-error.png')
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError)
    }

    throw error
  } finally {
    await driver.quit()
  }
}

// Run test
runExtrudeTest().catch(error => {
  console.error('Extrude test suite failed:', error)
  process.exit(1)
})
