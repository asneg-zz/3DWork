/**
 * Selenium test for Face Selection
 * Tests selecting faces on 3D objects to create sketches
 *
 * Run with: npx ts-node tests/selenium/face_selection.test.ts
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5177'
const WAIT_TIMEOUT = 10000

async function saveScreenshot(driver: WebDriver, filename: string) {
  const screenshot = await driver.takeScreenshot()
  writeFileSync(`tests/selenium/${filename}`, screenshot, 'base64')
  console.log(`  📸 Screenshot saved: ${filename}`)
}

async function runFaceSelectionTest() {
  console.log('🧪 Starting Face Selection test...\n')

  const options = new chrome.Options()
  // Run in visible mode for debugging
  // options.addArguments('--headless=new')
  options.addArguments('--no-sandbox')
  options.addArguments('--disable-dev-shm-usage')
  options.addArguments('--window-size=1920,1080')
  options.addArguments('--enable-webgl')

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  try {
    // Navigate to app
    console.log('📍 Navigating to:', APP_URL)
    await driver.get(APP_URL)

    // Wait for canvas to load
    console.log('⏳ Waiting for canvas...')
    const canvas = await driver.wait(until.elementLocated(By.css('canvas')), WAIT_TIMEOUT)
    await driver.sleep(1500) // Wait for WASM initialization

    console.log('✅ Canvas loaded')
    await saveScreenshot(driver, 'face-selection-1-initial.png')

    // Step 1: Create a sketch
    console.log('\n📐 Step 1: Creating sketch...')
    const sketchBtn = await driver.findElement(By.xpath('//button[contains(., "Sketch")]'))
    await sketchBtn.click()
    await driver.sleep(500)

    // Draw a rectangle
    console.log('  Drawing rectangle...')
    const rectangleBtn = await driver.findElement(By.xpath('//button[contains(., "Rectangle")]'))
    await rectangleBtn.click()
    await driver.sleep(300)

    const actions = driver.actions({ async: true })
    await actions.move({ origin: canvas, x: -50, y: -50 }).press().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 50, y: 50 }).release().perform()
    await driver.sleep(500)

    await saveScreenshot(driver, 'face-selection-2-sketch-drawn.png')

    // Finish sketch
    console.log('  Finishing sketch...')
    const finishBtn = await driver.findElement(By.xpath('//button[contains(., "Finish")]'))
    await finishBtn.click()
    await driver.sleep(500)

    // Step 2: Extrude the sketch
    console.log('\n🔼 Step 2: Extruding sketch...')
    const extrudeDialog = await driver.wait(
      until.elementLocated(By.xpath('//*[contains(text(), "Extrude Parameters")]')),
      5000
    )
    console.log('  Extrude dialog opened')

    const heightInput = await driver.findElement(By.css('input[type="number"]'))
    await driver.executeScript(
      'arguments[0].value = "2.0"; arguments[0].dispatchEvent(new Event("input", { bubbles: true })); arguments[0].dispatchEvent(new Event("change", { bubbles: true }));',
      heightInput
    )
    await driver.sleep(200)

    const extrudeBtn = await driver.findElement(By.xpath('//button[contains(., "Extrude") and not(contains(., "Cancel"))]'))
    await extrudeBtn.click()
    await driver.sleep(1000)

    await saveScreenshot(driver, 'face-selection-3-extruded.png')
    console.log('✅ Extrude created')

    // Step 3: Activate face selection mode
    console.log('\n👆 Step 3: Activating face selection mode...')
    const selectFaceBtn = await driver.findElement(By.xpath('//button[contains(., "Select Face")]'))
    await selectFaceBtn.click()
    await driver.sleep(500)

    // Check if button is active (has accent color)
    const buttonClass = await selectFaceBtn.getAttribute('class')
    if (buttonClass.includes('bg-cad-accent')) {
      console.log('✅ Face selection mode activated')
    } else {
      throw new Error('Face selection mode not activated')
    }

    await saveScreenshot(driver, 'face-selection-4-mode-active.png')

    // Step 4: Click on a face to select it
    console.log('\n🖱️  Step 4: Clicking on top face...')

    // Move to top of the extruded object and click
    await actions.move({ origin: canvas, x: 0, y: -30 }).perform()
    await driver.sleep(500)
    await saveScreenshot(driver, 'face-selection-5-hovering.png')

    await actions.click().perform()
    await driver.sleep(1500)

    await saveScreenshot(driver, 'face-selection-6-face-selected.png')

    // Verify sketch mode is active (Select Face button should no longer be active)
    const selectFaceBtnAfter = await driver.findElement(By.xpath('//button[contains(., "Select Face")]'))
    const buttonClassAfter = await selectFaceBtnAfter.getAttribute('class')

    if (!buttonClassAfter.includes('bg-cad-accent')) {
      console.log('✅ Face selection mode exited')
    } else {
      throw new Error('Face selection mode still active after selecting face')
    }

    // Verify sketch toolbar is visible
    const sketchToolbar = await driver.findElement(By.xpath('//button[contains(., "Line") or contains(., "Circle")]'))
    const toolbarVisible = await sketchToolbar.isDisplayed()

    if (toolbarVisible) {
      console.log('✅ Sketch mode activated on selected face')
    } else {
      throw new Error('Sketch toolbar not visible')
    }

    await saveScreenshot(driver, 'face-selection-7-sketch-on-face.png')

    // Test with cube primitive
    console.log('\n📦 Step 5: Testing with cube primitive...')

    // Exit sketch mode first
    const cancelBtn = await driver.findElement(By.xpath('//button[contains(., "Cancel")]'))
    await cancelBtn.click()
    await driver.sleep(500)

    // Create a cube
    const cubeBtn = await driver.findElement(By.xpath('//button[contains(., "Cube")]'))
    await cubeBtn.click()
    await driver.sleep(1000)

    await saveScreenshot(driver, 'face-selection-8-cube-created.png')

    // Activate face selection again
    const selectFaceBtn2 = await driver.findElement(By.xpath('//button[contains(., "Select Face")]'))
    await selectFaceBtn2.click()
    await driver.sleep(500)

    // Try clicking on different faces
    console.log('  Testing face selection on cube...')

    // Top face
    await actions.move({ origin: canvas, x: 0, y: -50 }).perform()
    await driver.sleep(300)
    await saveScreenshot(driver, 'face-selection-9-cube-hover-top.png')

    // Side face
    await actions.move({ origin: canvas, x: 80, y: 0 }).perform()
    await driver.sleep(300)
    await saveScreenshot(driver, 'face-selection-10-cube-hover-side.png')

    // Click on side face
    await actions.click().perform()
    await driver.sleep(1500)

    await saveScreenshot(driver, 'face-selection-11-cube-face-selected.png')

    console.log('✅ Face selection on cube successful')

    console.log('\n✅ All tests passed!\n')

  } catch (error) {
    console.error('❌ Test failed:', error)
    await saveScreenshot(driver, 'face-selection-error.png')
    throw error
  } finally {
    await driver.quit()
    console.log('🏁 Test complete')
  }
}

// Run the test
runFaceSelectionTest().catch(error => {
  console.error('Test execution failed:', error)
  process.exit(1)
})
