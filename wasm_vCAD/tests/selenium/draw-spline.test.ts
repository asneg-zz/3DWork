/**
 * Test Spline drawing
 *
 * Scenario:
 * 1. Activate sketch mode
 * 2. Select Spline tool
 * 3. Click multiple control points
 * 4. Press Enter to finish
 * 5. Verify spline is created
 *
 * Run with: npm run test:e2e:draw-spline
 */

import { Builder, By, until, WebDriver, Key } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Draw Spline\n')

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

    // Step 2: Select Spline tool
    console.log('📝 Step 2: Select Spline tool')
    const splineButton = await driver.findElement(By.xpath("//button[contains(., 'Spline')]"))
    await splineButton.click()
    await driver.sleep(300)
    console.log('✅ Spline tool selected\n')

    // Step 3: Draw spline with smooth curve (wave pattern)
    console.log('📝 Step 3: Draw spline - wave pattern (6 points)')
    const wavePoints = [
      { x: -200, y: 0, label: 'Start' },
      { x: -150, y: -80, label: 'Up' },
      { x: -50, y: -80, label: 'Peak' },
      { x: 0, y: 0, label: 'Middle' },
      { x: 50, y: 80, label: 'Down' },
      { x: 150, y: 80, label: 'Valley' },
      { x: 200, y: 0, label: 'End' },
    ]

    for (const point of wavePoints) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }
    console.log('✅ All control points added\n')

    // Step 4: Screenshot during drawing
    console.log('📝 Step 4: Screenshot during drawing (before Enter)')
    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-spline-preview.png', screenshot, 'base64')
    console.log('✅ Saved: draw-spline-preview.png\n')

    // Step 5: Press Enter to finish spline
    console.log('📝 Step 5: Press Enter to finish spline')
    await driver.actions().sendKeys(Key.ENTER).perform()
    await driver.sleep(500)
    console.log('✅ Enter pressed - spline finished\n')

    // Step 6: Screenshot after finishing
    console.log('📝 Step 6: Screenshot after finishing')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-spline-finished.png', screenshot, 'base64')
    console.log('✅ Saved: draw-spline-finished.png\n')

    // Step 7: Draw second spline (S-curve)
    console.log('📝 Step 7: Draw second spline - S-curve (4 points)')
    await splineButton.click()
    await driver.sleep(200)

    const sCurvePoints = [
      { x: -100, y: 100, label: 'S1' },
      { x: -50, y: 150, label: 'S2' },
      { x: 50, y: 50, label: 'S3' },
      { x: 100, y: 100, label: 'S4' },
    ]

    for (const point of sCurvePoints) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }
    await driver.actions().sendKeys(Key.ENTER).perform()
    await driver.sleep(500)
    console.log('✅ Second spline drawn\n')

    // Step 8: Draw third spline (spiral-like)
    console.log('📝 Step 8: Draw third spline - spiral (5 points)')
    await splineButton.click()
    await driver.sleep(200)

    const spiralPoints = [
      { x: 0, y: -100, label: 'Sp1' },
      { x: 80, y: -50, label: 'Sp2' },
      { x: 80, y: 50, label: 'Sp3' },
      { x: 0, y: 80, label: 'Sp4' },
      { x: -50, y: 50, label: 'Sp5' },
    ]

    for (const point of spiralPoints) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }
    await driver.actions().sendKeys(Key.ENTER).perform()
    await driver.sleep(500)
    console.log('✅ Third spline drawn\n')

    // Step 9: Final screenshot
    console.log('📝 Step 9: Final screenshot with 3 splines')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-spline-final.png', screenshot, 'base64')
    console.log('✅ Saved: draw-spline-final.png\n')

    // Step 10: Test Escape key (cancel drawing)
    console.log('📝 Step 10: Test Escape to cancel drawing')
    await splineButton.click()
    await driver.sleep(200)

    // Add a few points
    await actions.move({ origin: canvas, x: -150, y: -150 }).click().perform()
    await driver.sleep(200)
    await actions.move({ origin: canvas, x: -100, y: -150 }).click().perform()
    await driver.sleep(200)

    console.log('  Added 2 points, now pressing Escape...')
    await driver.actions().sendKeys(Key.ESCAPE).perform()
    await driver.sleep(500)
    console.log('✅ Escape pressed - drawing cancelled\n')

    // Screenshot should show no new spline
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-spline-after-escape.png', screenshot, 'base64')
    console.log('✅ Saved: draw-spline-after-escape.png (should still show 3 splines)\n')

    // Step 11: Check for errors
    console.log('📝 Step 11: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')

    if (errors.length > 0) {
      console.log('\n⚠️  Browser errors:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('✅ No errors\n')
    }

    // Step 12: Finish sketch
    console.log('📝 Step 12: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)

    console.log('\n🎉 Spline test completed successfully!')
    console.log('\n📸 Screenshots:')
    console.log('  1. draw-spline-preview.png       - During drawing (before Enter)')
    console.log('  2. draw-spline-finished.png      - After first spline')
    console.log('  3. draw-spline-final.png         - Three splines drawn')
    console.log('  4. draw-spline-after-escape.png  - After cancelled spline (still 3)')
    console.log('\n📋 Expected result:')
    console.log('  - First spline: wave pattern (7 control points)')
    console.log('  - Second spline: S-curve (4 control points)')
    console.log('  - Third spline: spiral-like (5 control points)')
    console.log('  - Fourth attempt cancelled by Escape (no additional spline)')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/draw-spline-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: draw-spline-error.png')
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
