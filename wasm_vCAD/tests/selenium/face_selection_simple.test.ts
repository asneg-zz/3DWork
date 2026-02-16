/**
 * Selenium test for Face Selection (simplified)
 * Tests selecting faces on a cube primitive
 *
 * Run with: npx ts-node tests/selenium/face_selection_simple.test.ts
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
  console.log('🧪 Starting Face Selection test (simplified)...\n')

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
    await saveScreenshot(driver, 'face-simple-1-initial.png')

    // Step 1: Create a cube
    console.log('\n📦 Step 1: Creating cube...')
    const cubeBtn = await driver.findElement(By.xpath('//button[contains(., "Cube")]'))
    await cubeBtn.click()
    await driver.sleep(1000)

    await saveScreenshot(driver, 'face-simple-2-cube-created.png')
    console.log('✅ Cube created')

    // Step 2: Activate face selection mode
    console.log('\n👆 Step 2: Activating face selection mode...')
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

    await saveScreenshot(driver, 'face-simple-3-mode-active.png')

    // Step 3: Hover over faces to see highlighting
    console.log('\n🖱️  Step 3: Hovering over different faces...')
    const actions = driver.actions({ async: true })

    // Top face
    console.log('  Hovering over top face...')
    await actions.move({ origin: canvas, x: 0, y: -60 }).perform()
    await driver.sleep(800)
    await saveScreenshot(driver, 'face-simple-4-hover-top.png')

    // Right side face
    console.log('  Hovering over right side face...')
    await actions.move({ origin: canvas, x: 100, y: 0 }).perform()
    await driver.sleep(800)
    await saveScreenshot(driver, 'face-simple-5-hover-right.png')

    // Left side face
    console.log('  Hovering over left side face...')
    await actions.move({ origin: canvas, x: -100, y: 0 }).perform()
    await driver.sleep(800)
    await saveScreenshot(driver, 'face-simple-6-hover-left.png')

    // Step 4: Click on a face to select it
    console.log('\n🖱️  Step 4: Clicking on top face...')
    await actions.move({ origin: canvas, x: 0, y: -60 }).perform()
    await driver.sleep(300)
    await actions.click().perform()
    await driver.sleep(1500)

    await saveScreenshot(driver, 'face-simple-7-face-selected.png')

    // Verify face selection mode exited
    const selectFaceBtnAfter = await driver.findElement(By.xpath('//button[contains(., "Select Face")]'))
    const buttonClassAfter = await selectFaceBtnAfter.getAttribute('class')

    if (!buttonClassAfter.includes('bg-cad-accent')) {
      console.log('✅ Face selection mode exited automatically')
    } else {
      console.log('⚠️  Warning: Face selection mode still active')
    }

    // Check console logs
    console.log('\n📋 Browser console logs:')
    const logs = await driver.manage().logs().get('browser')

    // Print all logs (not just errors)
    logs.forEach(log => {
      console.log(`  [${log.level.name}] ${log.message}`)
    })

    const errors = logs.filter(log => log.level.name === 'SEVERE')
    if (errors.length > 0) {
      console.log(`\n⚠️  Found ${errors.length} console errors`)
    }

    console.log('\n✅ Test completed successfully!\n')

  } catch (error) {
    console.error('❌ Test failed:', error)
    await saveScreenshot(driver, 'face-simple-error.png')

    // Get browser logs for debugging
    try {
      const logs = await driver.manage().logs().get('browser')
      console.log('\n📋 Browser console logs:')
      logs.forEach(log => {
        console.log(`  [${log.level.name}] ${log.message}`)
      })
    } catch (logError) {
      console.log('Could not retrieve browser logs')
    }

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
