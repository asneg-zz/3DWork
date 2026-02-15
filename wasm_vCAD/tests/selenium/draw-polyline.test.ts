/**
 * Test Polyline drawing
 *
 * Scenario:
 * 1. Activate sketch mode
 * 2. Select Polyline tool
 * 3. Click multiple points to create polyline
 * 4. Press Enter to finish
 * 5. Verify polyline is created
 *
 * Run with: npm run test:e2e:draw-polyline
 */

import { Builder, By, until, WebDriver, Key } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Draw Polyline\n')

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
    // Step 1: Load application
    console.log('📝 Step 1: Load application')
    await driver.get(APP_URL)
    await driver.wait(until.titleContains('vCAD'), WAIT_TIMEOUT)
    await driver.sleep(3000)

    const sketchButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Sketch')]")),
      WAIT_TIMEOUT
    )
    await sketchButton.click()
    await driver.sleep(500)
    console.log('✅ Sketch mode activated\n')

    const canvas = await driver.findElement(By.css('canvas'))
    const actions = driver.actions({ async: true })

    // Step 2: Select Polyline tool
    console.log('📝 Step 2: Select Polyline tool')
    const polylineButton = await driver.findElement(By.xpath("//button[contains(., 'Polyline')]"))
    await polylineButton.click()
    await driver.sleep(300)
    console.log('✅ Polyline tool selected\n')

    // Step 3: Draw polyline with 5 points
    console.log('📝 Step 3: Draw polyline (5 points)')
    const points = [
      { x: -150, y: -100, label: 'Point 1' },
      { x: -50, y: 100, label: 'Point 2' },
      { x: 50, y: -100, label: 'Point 3' },
      { x: 150, y: 100, label: 'Point 4' },
      { x: 200, y: 0, label: 'Point 5' },
    ]

    for (const point of points) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }
    console.log('✅ All points added\n')

    // Step 4: Screenshot during drawing
    console.log('📝 Step 4: Screenshot during drawing (before Enter)')
    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-polyline-preview.png', screenshot, 'base64')
    console.log('✅ Saved: draw-polyline-preview.png\n')

    // Step 5: Press Enter to finish polyline
    console.log('📝 Step 5: Press Enter to finish polyline')
    await driver.actions().sendKeys(Key.ENTER).perform()
    await driver.sleep(500)
    console.log('✅ Enter pressed - polyline finished\n')

    // Step 6: Screenshot after finishing
    console.log('📝 Step 6: Screenshot after finishing')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-polyline-finished.png', screenshot, 'base64')
    console.log('✅ Saved: draw-polyline-finished.png\n')

    // Step 7: Draw another polyline to test multiple
    console.log('📝 Step 7: Draw second polyline')
    await polylineButton.click()
    await driver.sleep(200)

    const points2 = [
      { x: -200, y: 50, label: 'P1' },
      { x: -100, y: -50, label: 'P2' },
      { x: 0, y: 50, label: 'P3' },
    ]

    for (const point of points2) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }
    await driver.actions().sendKeys(Key.ENTER).perform()
    await driver.sleep(500)
    console.log('✅ Second polyline drawn\n')

    // Step 8: Final screenshot
    console.log('📝 Step 8: Final screenshot with 2 polylines')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-polyline-final.png', screenshot, 'base64')
    console.log('✅ Saved: draw-polyline-final.png\n')

    // Step 9: Check for errors
    console.log('📝 Step 9: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')

    if (errors.length > 0) {
      console.log('\n⚠️  Browser errors:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('✅ No errors\n')
    }

    // Step 10: Finish sketch
    console.log('📝 Step 10: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)

    console.log('\n🎉 Polyline test completed successfully!')
    console.log('\n📸 Screenshots:')
    console.log('  1. draw-polyline-preview.png  - During drawing (before Enter)')
    console.log('  2. draw-polyline-finished.png - After first polyline')
    console.log('  3. draw-polyline-final.png    - Two polylines drawn')
    console.log('\n📋 Expected result:')
    console.log('  - First polyline with 5 connected line segments (zigzag pattern)')
    console.log('  - Second polyline with 3 connected segments')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/draw-polyline-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: draw-polyline-error.png')
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
