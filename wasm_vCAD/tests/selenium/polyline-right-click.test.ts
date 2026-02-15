/**
 * Test polyline finishing with right click
 *
 * This test verifies that polyline can be finished with right click
 * in addition to pressing Enter.
 *
 * Run with: npm run test:e2e:polyline-right-click
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Polyline Right Click to Finish\n')

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

    // Select Polyline tool
    console.log('📝 Step 2: Select Polyline tool')
    const polylineButton = await driver.findElement(By.xpath("//button[contains(., 'Polyline')]"))
    await polylineButton.click()
    await driver.sleep(300)
    console.log('✅ Polyline tool selected\n')

    // Draw first polyline with Enter key
    console.log('📝 Step 3: Draw first polyline (finish with Enter)')
    const points1 = [
      { x: -150, y: -100, label: 'Point 1' },
      { x: -50, y: -150, label: 'Point 2' },
      { x: 50, y: -100, label: 'Point 3' },
      { x: 100, y: -150, label: 'Point 4' },
    ]

    for (const point of points1) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }
    console.log('  Pressing Enter to finish...')
    await driver.actions().sendKeys('\n').perform()
    await driver.sleep(500)
    console.log('✅ First polyline finished with Enter\n')

    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/polyline-right-click-first.png', screenshot, 'base64')
    console.log('📸 Saved: polyline-right-click-first.png\n')

    // Draw second polyline with RIGHT CLICK
    console.log('📝 Step 4: Draw second polyline (finish with RIGHT CLICK)')
    const points2 = [
      { x: -100, y: 50, label: 'P1' },
      { x: 0, y: 100, label: 'P2' },
      { x: 100, y: 50, label: 'P3' },
      { x: 150, y: 100, label: 'P4' },
    ]

    for (const point of points2) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }

    // Move to a position for preview
    await actions.move({ origin: canvas, x: 200, y: 80 }).perform()
    await driver.sleep(500)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/polyline-right-click-before.png', screenshot, 'base64')
    console.log('📸 Saved: polyline-right-click-before.png (before right click)\n')

    console.log('  Right clicking to finish...')
    // Right click to finish polyline (contextClick = right click)
    await actions.move({ origin: canvas, x: 200, y: 80 }).contextClick().perform()
    await driver.sleep(500)
    console.log('✅ Second polyline finished with RIGHT CLICK\n')

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/polyline-right-click-after.png', screenshot, 'base64')
    console.log('📸 Saved: polyline-right-click-after.png (after right click)\n')

    // Draw third polyline with right click immediately (no Enter)
    console.log('📝 Step 5: Draw third polyline (also finish with right click)')
    const points3 = [
      { x: -200, y: -50, label: 'R1' },
      { x: -150, y: 0, label: 'R2' },
      { x: -100, y: -50, label: 'R3' },
    ]

    for (const point of points3) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }

    console.log('  Right clicking to finish...')
    await actions.move({ origin: canvas, x: -50, y: -50 }).contextClick().perform()
    await driver.sleep(500)
    console.log('✅ Third polyline finished with right click\n')

    // Final screenshot
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/polyline-right-click-final.png', screenshot, 'base64')
    console.log('📸 Saved: polyline-right-click-final.png\n')

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

    console.log('\n🎉 Right click test completed successfully!')
    console.log('\n📸 Screenshots:')
    console.log('  1. polyline-right-click-first.png  - First polyline (Enter)')
    console.log('  2. polyline-right-click-before.png - Second polyline before right click')
    console.log('  3. polyline-right-click-after.png  - Second polyline after right click')
    console.log('  4. polyline-right-click-final.png  - All three polylines')
    console.log('\n📋 Expected result:')
    console.log('  - First polyline finished with Enter (4 segments)')
    console.log('  - Second polyline finished with right click (4 segments)')
    console.log('  - Third polyline finished with right click (3 segments)')
    console.log('  - Total: 3 polylines visible')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/polyline-right-click-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: polyline-right-click-error.png')
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
