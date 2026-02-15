/**
 * Visual test to verify arc drawing shows all 3 points
 *
 * This test verifies the fix for the issue where point 2 disappears
 * when setting point 3.
 *
 * Run with: npm run test:e2e:arc-visual
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Visual Test: Arc 3-Point Drawing\n')
  console.log('This test verifies all 3 points remain visible during arc drawing\n')

  const options = new chrome.Options()
  // Run in visible mode to see the points
  options.addArguments('--window-size=1920,1080')
  options.addArguments('--enable-webgl')

  const driver: WebDriver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  try {
    // Load application
    console.log('📝 Loading application...')
    await driver.get(APP_URL)
    await driver.wait(until.titleContains('vCAD'), WAIT_TIMEOUT)
    await driver.sleep(2000)

    const sketchButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Sketch')]")),
      WAIT_TIMEOUT
    )
    await sketchButton.click()
    await driver.sleep(500)
    console.log('✅ Sketch mode activated\n')

    const canvas = await driver.findElement(By.css('canvas'))
    const actions = driver.actions({ async: true })

    // Select Arc tool
    console.log('📝 Selecting Arc tool...')
    const arcButton = await driver.findElement(By.xpath("//button[@title='Arc (3-point)']"))
    await arcButton.click()
    await driver.sleep(300)

    console.log('\n🎯 Drawing arc with 3 points:')
    console.log('   Watch carefully - all 3 points should stay visible!\n')

    // Point 1: Start
    console.log('📍 Point 1: Click and drag to start arc')
    await actions.move({ origin: canvas, x: -100, y: 0 }).press().perform()
    await driver.sleep(200)
    await actions.move({ origin: canvas, x: -80, y: -20 }).perform()
    await driver.sleep(500)

    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/arc-point1-dragging.png', screenshot, 'base64')
    console.log('   📸 Screenshot: arc-point1-dragging.png (should show point 1)')

    // Release to set point 2
    console.log('\n📍 Point 2: Release mouse to set point 2')
    await actions.release().perform()
    await driver.sleep(1000)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/arc-point2-set.png', screenshot, 'base64')
    console.log('   📸 Screenshot: arc-point2-set.png (should show points 1 and 2)')

    // Move cursor to preview point 3
    console.log('\n📍 Point 3: Move cursor to preview third point')
    await actions.move({ origin: canvas, x: 100, y: 0 }).perform()
    await driver.sleep(2000)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/arc-point3-preview.png', screenshot, 'base64')
    console.log('   📸 Screenshot: arc-point3-preview.png')
    console.log('   ✅ Should show ALL 3 POINTS numbered 1, 2, 3')
    console.log('   ✅ Should show preview arc through all 3 points')

    // Click to finalize
    console.log('\n📍 Finalizing: Click to create arc')
    await actions.press().release().perform()
    await driver.sleep(1000)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/arc-final.png', screenshot, 'base64')
    console.log('   📸 Screenshot: arc-final.png (final arc)\n')

    console.log('\n🎉 Test completed!')
    console.log('\n📸 Review these screenshots:')
    console.log('  1. arc-point1-dragging.png  - Point 1 visible')
    console.log('  2. arc-point2-set.png       - Points 1 and 2 visible')
    console.log('  3. arc-point3-preview.png   - ALL 3 POINTS VISIBLE (1=green, 2=blue, 3=yellow)')
    console.log('  4. arc-final.png            - Completed arc')
    console.log('\n✅ If point 2 is visible in arc-point3-preview.png, the bug is FIXED!')

    console.log('\n✨ Press Enter to close browser...')
    await new Promise(resolve => {
      process.stdin.once('data', resolve)
    })

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    throw error
  } finally {
    await driver.quit()
  }
}

runTest().catch(error => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
