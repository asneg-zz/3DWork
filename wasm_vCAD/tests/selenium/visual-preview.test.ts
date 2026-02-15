/**
 * Visual test for drawing previews
 *
 * This test demonstrates the visual preview improvements for all drawing tools:
 * - Line: shows start/end points
 * - Circle: shows center, radius line, and radius value
 * - Rectangle: shows corners and dimensions
 * - Arc: shows 3 points with numbers during drawing
 * - Polyline: shows numbered points and dashed preview line
 * - Spline: shows numbered control points
 *
 * Run with: npm run test:e2e:visual-preview
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Visual Test: Drawing Previews\n')
  console.log('This test captures preview states for all drawing tools\n')

  const options = new chrome.Options()
  // NOT headless - we want to see the previews!
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

    // Test 1: Line preview with endpoints
    console.log('📝 Test 1: Line preview')
    const lineButton = await driver.findElement(By.xpath("//button[@title='Line']"))
    await lineButton.click()
    await driver.sleep(300)

    // Start line
    await actions.move({ origin: canvas, x: -150, y: -100 }).press().perform()
    await driver.sleep(100)

    // Move to show preview
    await actions.move({ origin: canvas, x: 100, y: 80 }).perform()
    await driver.sleep(1000) // Pause to see preview

    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/visual-preview-line.png', screenshot, 'base64')
    console.log('✅ Captured: visual-preview-line.png (green start, yellow end points)\n')

    // Release to finish
    await actions.release().perform()
    await driver.sleep(300)

    // Test 2: Circle preview with radius
    console.log('📝 Test 2: Circle preview')
    const circleButton = await driver.findElement(By.xpath("//button[@title='Circle']"))
    await circleButton.click()
    await driver.sleep(300)

    // Start circle
    await actions.move({ origin: canvas, x: 0, y: 0 }).press().perform()
    await driver.sleep(100)

    // Drag to show radius
    await actions.move({ origin: canvas, x: 120, y: 90 }).perform()
    await driver.sleep(1000)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/visual-preview-circle.png', screenshot, 'base64')
    console.log('✅ Captured: visual-preview-circle.png (center point, radius line, value)\n')

    await actions.release().perform()
    await driver.sleep(300)

    // Test 3: Rectangle preview with dimensions
    console.log('📝 Test 3: Rectangle preview')
    const rectButton = await driver.findElement(By.xpath("//button[@title='Rectangle']"))
    await rectButton.click()
    await driver.sleep(300)

    await actions.move({ origin: canvas, x: -180, y: 50 }).press().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: -50, y: 150 }).perform()
    await driver.sleep(1000)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/visual-preview-rectangle.png', screenshot, 'base64')
    console.log('✅ Captured: visual-preview-rectangle.png (corners, dimensions)\n')

    await actions.release().perform()
    await driver.sleep(300)

    // Test 4: Arc preview with 3 numbered points
    console.log('📝 Test 4: Arc preview (3-point)')
    const arcButton = await driver.findElement(By.xpath("//button[@title='Arc (3-point)']"))
    await arcButton.click()
    await driver.sleep(300)

    // Point 1
    await actions.move({ origin: canvas, x: 80, y: -100 }).click().perform()
    await driver.sleep(300)

    // Point 2 - capture after 2nd point
    await actions.move({ origin: canvas, x: 150, y: -40 }).click().perform()
    await driver.sleep(300)

    // Move cursor to show preview arc
    await actions.move({ origin: canvas, x: 80, y: 40 }).perform()
    await driver.sleep(1500) // Longer pause to see the arc

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/visual-preview-arc.png', screenshot, 'base64')
    console.log('✅ Captured: visual-preview-arc.png (3 numbered points, preview arc)\n')

    // Click at current position to finish arc
    await actions.move({ origin: canvas, x: 80, y: 40 }).click().perform()
    await driver.sleep(300)

    // Test 5: Polyline preview with numbered points
    console.log('📝 Test 5: Polyline preview')
    const polylineButton = await driver.findElement(By.xpath("//button[contains(., 'Polyline')]"))
    await polylineButton.click()
    await driver.sleep(300)

    const polyPoints = [
      { x: -150, y: -40 },
      { x: -100, y: -100 },
      { x: -40, y: -80 },
      { x: 0, y: -100 },
    ]

    for (const pt of polyPoints) {
      await actions.move({ origin: canvas, x: pt.x, y: pt.y }).click().perform()
      await driver.sleep(300)
    }

    // Move cursor to show dashed preview
    await actions.move({ origin: canvas, x: 40, y: -60 }).perform()
    await driver.sleep(1500)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/visual-preview-polyline.png', screenshot, 'base64')
    console.log('✅ Captured: visual-preview-polyline.png (numbered points, dashed preview)\n')

    // Press Enter to finish
    await driver.actions().sendKeys('\n').perform()
    await driver.sleep(300)

    // Test 6: Spline preview
    console.log('📝 Test 6: Spline preview')
    const splineButton = await driver.findElement(By.xpath("//button[contains(., 'Spline')]"))
    await splineButton.click()
    await driver.sleep(300)

    const splinePoints = [
      { x: 40, y: 80 },
      { x: 80, y: 120 },
      { x: 140, y: 100 },
      { x: 160, y: 40 },
    ]

    for (const pt of splinePoints) {
      await actions.move({ origin: canvas, x: pt.x, y: pt.y }).click().perform()
      await driver.sleep(300)
    }

    await actions.move({ origin: canvas, x: 140, y: -20 }).perform()
    await driver.sleep(1500)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/visual-preview-spline.png', screenshot, 'base64')
    console.log('✅ Captured: visual-preview-spline.png (control points numbered)\n')

    await driver.actions().sendKeys('\n').perform()
    await driver.sleep(500)

    // Final screenshot with all drawn elements
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/visual-preview-all.png', screenshot, 'base64')
    console.log('✅ Captured: visual-preview-all.png (all elements)\n')

    console.log('\n🎉 Visual preview test completed!')
    console.log('\n📸 Generated screenshots:')
    console.log('  1. visual-preview-line.png      - Line with start/end points')
    console.log('  2. visual-preview-circle.png    - Circle with radius indicator')
    console.log('  3. visual-preview-rectangle.png - Rectangle with dimensions')
    console.log('  4. visual-preview-arc.png       - Arc with 3 numbered points')
    console.log('  5. visual-preview-polyline.png  - Polyline with numbered points')
    console.log('  6. visual-preview-spline.png    - Spline control points')
    console.log('  7. visual-preview-all.png       - All elements together')

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
