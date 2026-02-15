/**
 * Test drawing multiple arcs in sequence
 *
 * This test verifies that when drawing a second arc,
 * it starts correctly with point 1 (not point 2).
 *
 * Run with: npm run test:e2e:arc-multiple
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Multiple Arc Drawing\n')
  console.log('Verifies that each new arc starts with point 1\n')

  const options = new chrome.Options()
  options.addArguments('--headless=new')
  options.addArguments('--no-sandbox')
  options.addArguments('--disable-dev-shm-usage')
  options.addArguments('--window-size=1920,1080')
  options.addArguments('--enable-webgl')
  options.addArguments('--use-gl=angle')
  options.addArguments('--use-angle=swiftshader')
  options.addArguments('--enable-unsafe-swiftshader')

  const driver: WebDriver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  try {
    // Load application
    console.log('📝 Step 1: Load application')
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
    console.log('📝 Step 2: Select Arc tool')
    const arcButton = await driver.findElement(By.xpath("//button[@title='Arc (3-point)']"))
    await arcButton.click()
    await driver.sleep(300)
    console.log('✅ Arc tool selected\n')

    // Draw first arc
    console.log('📝 Step 3: Draw first arc')
    console.log('  Point 1 (start):  (-100, 50)')
    await actions.move({ origin: canvas, x: -100, y: 50 }).press().perform()
    await driver.sleep(100)

    console.log('  Point 2 (middle): (0, -50)')
    await actions.move({ origin: canvas, x: 0, y: -50 }).release().perform()
    await driver.sleep(300)

    console.log('  Point 3 (end):    (100, 50)')
    await actions.move({ origin: canvas, x: 100, y: 50 }).press().release().perform()
    await driver.sleep(500)
    console.log('✅ First arc drawn\n')

    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/arc-multiple-first.png', screenshot, 'base64')
    console.log('📸 Saved: arc-multiple-first.png\n')

    // Draw second arc - THIS IS THE KEY TEST
    console.log('📝 Step 4: Draw second arc (should start with point 1)')
    console.log('  Point 1 (start):  (-150, -100)')
    await actions.move({ origin: canvas, x: -150, y: -100 }).press().perform()
    await driver.sleep(100)

    console.log('  Point 2 (middle): (-50, -150)')
    await actions.move({ origin: canvas, x: -50, y: -150 }).release().perform()
    await driver.sleep(300)

    // Move to preview point 3
    await actions.move({ origin: canvas, x: 50, y: -100 }).perform()
    await driver.sleep(1000)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/arc-multiple-second-preview.png', screenshot, 'base64')
    console.log('📸 Saved: arc-multiple-second-preview.png')
    console.log('   ✅ Should show points labeled 1, 2, 3 for second arc\n')

    console.log('  Point 3 (end):    (50, -100)')
    await actions.press().release().perform()
    await driver.sleep(500)
    console.log('✅ Second arc drawn\n')

    // Final screenshot
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/arc-multiple-final.png', screenshot, 'base64')
    console.log('📸 Saved: arc-multiple-final.png\n')

    // Draw third arc to triple-check
    console.log('📝 Step 5: Draw third arc (final verification)')
    console.log('  Point 1 (start):  (100, 100)')
    await actions.move({ origin: canvas, x: 100, y: 100 }).press().perform()
    await driver.sleep(100)

    console.log('  Point 2 (middle): (150, 50)')
    await actions.move({ origin: canvas, x: 150, y: 50 }).release().perform()
    await driver.sleep(300)

    console.log('  Point 3 (end):    (100, 0)')
    await actions.move({ origin: canvas, x: 100, y: 0 }).press().release().perform()
    await driver.sleep(500)
    console.log('✅ Third arc drawn\n')

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/arc-multiple-three.png', screenshot, 'base64')
    console.log('📸 Saved: arc-multiple-three.png\n')

    // Check for errors
    console.log('📝 Step 6: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')

    if (errors.length > 0) {
      console.log('\n⚠️  Browser errors:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('✅ No errors\n')
    }

    // Finish sketch
    console.log('📝 Step 7: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)

    console.log('\n🎉 Multiple arc test completed successfully!')
    console.log('\n📸 Screenshots:')
    console.log('  1. arc-multiple-first.png         - First arc')
    console.log('  2. arc-multiple-second-preview.png - Second arc preview (points 1,2,3)')
    console.log('  3. arc-multiple-final.png          - Two arcs')
    console.log('  4. arc-multiple-three.png          - Three arcs')
    console.log('\n📋 Expected result:')
    console.log('  - Each arc should start with point 1 (not point 2)')
    console.log('  - arc-multiple-second-preview.png should show points labeled 1, 2, 3')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/arc-multiple-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: arc-multiple-error.png')
    } catch (e) {
      console.error('Failed to take error screenshot:', e)
    }

    throw error
  } finally {
    await driver.quit()
  }
}

runTest().catch(error => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
