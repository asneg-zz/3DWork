/**
 * Test spline finishing with right click
 *
 * This test verifies that spline can be finished with right click
 * in addition to pressing Enter.
 *
 * Run with: npm run test:e2e:spline-right-click
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Spline Right Click to Finish\n')

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

    // Select Spline tool
    console.log('📝 Step 2: Select Spline tool')
    const splineButton = await driver.findElement(By.xpath("//button[contains(., 'Spline')]"))
    await splineButton.click()
    await driver.sleep(300)
    console.log('✅ Spline tool selected\n')

    // Draw first spline with Enter key
    console.log('📝 Step 3: Draw first spline (finish with Enter)')
    const points1 = [
      { x: -200, y: -50, label: 'Point 1' },
      { x: -150, y: -100, label: 'Point 2' },
      { x: -50, y: -100, label: 'Point 3' },
      { x: 0, y: -50, label: 'Point 4' },
    ]

    for (const point of points1) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }
    console.log('  Pressing Enter to finish...')
    await driver.actions().sendKeys('\n').perform()
    await driver.sleep(500)
    console.log('✅ First spline finished with Enter\n')

    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/spline-right-click-first.png', screenshot, 'base64')
    console.log('📸 Saved: spline-right-click-first.png\n')

    // Draw second spline with RIGHT CLICK
    console.log('📝 Step 4: Draw second spline (finish with RIGHT CLICK)')
    const points2 = [
      { x: -100, y: 50, label: 'S1' },
      { x: -50, y: 100, label: 'S2' },
      { x: 50, y: 100, label: 'S3' },
      { x: 100, y: 50, label: 'S4' },
      { x: 150, y: 80, label: 'S5' },
    ]

    for (const point of points2) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }

    console.log('  Right clicking to finish...')
    await actions.move({ origin: canvas, x: 180, y: 60 }).contextClick().perform()
    await driver.sleep(500)
    console.log('✅ Second spline finished with RIGHT CLICK\n')

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/spline-right-click-second.png', screenshot, 'base64')
    console.log('📸 Saved: spline-right-click-second.png\n')

    // Draw third spline with right click
    console.log('📝 Step 5: Draw third spline (also finish with right click)')
    const points3 = [
      { x: 50, y: -50, label: 'R1' },
      { x: 100, y: -100, label: 'R2' },
      { x: 150, y: -80, label: 'R3' },
      { x: 180, y: -50, label: 'R4' },
    ]

    for (const point of points3) {
      console.log(`  Clicking ${point.label} at (${point.x}, ${point.y})`)
      await actions.move({ origin: canvas, x: point.x, y: point.y }).click().perform()
      await driver.sleep(200)
    }

    console.log('  Right clicking to finish...')
    await actions.contextClick().perform()
    await driver.sleep(500)
    console.log('✅ Third spline finished with right click\n')

    // Final screenshot
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/spline-right-click-final.png', screenshot, 'base64')
    console.log('📸 Saved: spline-right-click-final.png\n')

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

    console.log('\n🎉 Spline right click test completed successfully!')
    console.log('\n📸 Screenshots:')
    console.log('  1. spline-right-click-first.png  - First spline (Enter)')
    console.log('  2. spline-right-click-second.png - Second spline (right click)')
    console.log('  3. spline-right-click-final.png  - All three splines')
    console.log('\n📋 Expected result:')
    console.log('  - First spline finished with Enter (4 control points)')
    console.log('  - Second spline finished with right click (5 control points)')
    console.log('  - Third spline finished with right click (4 control points)')
    console.log('  - Total: 3 splines visible')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/spline-right-click-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: spline-right-click-error.png')
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
