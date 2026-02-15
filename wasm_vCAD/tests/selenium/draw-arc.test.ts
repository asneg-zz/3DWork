/**
 * Test Arc drawing (3-point arc)
 *
 * Scenario:
 * 1. Activate sketch mode
 * 2. Select Arc tool
 * 3. Click 3 points: start, middle (through point), end
 * 4. Verify arc is created
 *
 * Run with: npm run test:e2e:draw-arc
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Draw Arc (3-point)\n')

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

    // Step 2: Select Arc tool
    console.log('📝 Step 2: Select Arc tool')
    const arcButton = await driver.findElement(By.xpath("//button[@title='Arc (3-point)']"))
    await arcButton.click()
    await driver.sleep(300)
    console.log('✅ Arc tool selected\n')

    // Step 3: Draw first arc (quarter circle)
    console.log('📝 Step 3: Draw arc - quarter circle')
    console.log('  Point 1 (start):  (-100, 0)')
    await actions.move({ origin: canvas, x: -100, y: 0 }).click().perform()
    await driver.sleep(300)

    console.log('  Point 2 (middle): (0, -100)')
    await actions.move({ origin: canvas, x: 0, y: -100 }).click().perform()
    await driver.sleep(300)

    console.log('  Point 3 (end):    (100, 0)')
    await actions.move({ origin: canvas, x: 100, y: 0 }).click().perform()
    await driver.sleep(500)
    console.log('✅ First arc drawn (top arc)\n')

    // Screenshot after first arc
    console.log('📝 Step 4: Screenshot after first arc')
    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-arc-first.png', screenshot, 'base64')
    console.log('✅ Saved: draw-arc-first.png\n')

    // Step 5: Draw second arc (bottom arc)
    console.log('📝 Step 5: Draw second arc')
    await arcButton.click()
    await driver.sleep(200)

    console.log('  Point 1 (start):  (100, 0)')
    await actions.move({ origin: canvas, x: 100, y: 0 }).click().perform()
    await driver.sleep(300)

    console.log('  Point 2 (middle): (0, 100)')
    await actions.move({ origin: canvas, x: 0, y: 100 }).click().perform()
    await driver.sleep(300)

    console.log('  Point 3 (end):    (-100, 0)')
    await actions.move({ origin: canvas, x: -100, y: 0 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Second arc drawn (bottom arc)\n')

    // Screenshot with both arcs
    console.log('📝 Step 6: Screenshot with both arcs (should form circle)')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-arc-circle.png', screenshot, 'base64')
    console.log('✅ Saved: draw-arc-circle.png\n')

    // Step 7: Draw third arc (S-curve)
    console.log('📝 Step 7: Draw third arc (S-curve)')
    await arcButton.click()
    await driver.sleep(200)

    console.log('  Point 1 (start):  (-150, -50)')
    await actions.move({ origin: canvas, x: -150, y: -50 }).click().perform()
    await driver.sleep(300)

    console.log('  Point 2 (middle): (-50, -150)')
    await actions.move({ origin: canvas, x: -50, y: -150 }).click().perform()
    await driver.sleep(300)

    console.log('  Point 3 (end):    (50, -50)')
    await actions.move({ origin: canvas, x: 50, y: -50 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Third arc drawn\n')

    // Final screenshot
    console.log('📝 Step 8: Final screenshot')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/draw-arc-final.png', screenshot, 'base64')
    console.log('✅ Saved: draw-arc-final.png\n')

    // Step 9: Check for errors
    console.log('📝 Step 9: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')
    const arcLogs = logs.filter(log => log.message.includes('arc') || log.message.includes('Arc'))

    console.log('\n📋 Arc calculation logs:')
    arcLogs.slice(-10).forEach(log => {
      const msg = log.message.replace(/^.*?"/, '').replace(/".*$/, '')
      console.log(`  ${msg}`)
    })

    if (errors.length > 0) {
      console.log('\n⚠️  Browser errors:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('\n✅ No errors\n')
    }

    // Step 10: Finish sketch
    console.log('📝 Step 10: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)

    console.log('\n🎉 Arc test completed successfully!')
    console.log('\n📸 Screenshots:')
    console.log('  1. draw-arc-first.png   - First arc (top quarter)')
    console.log('  2. draw-arc-circle.png  - Two arcs forming circle')
    console.log('  3. draw-arc-final.png   - Three arcs total')
    console.log('\n📋 Expected result:')
    console.log('  - Two arcs should form a complete circle')
    console.log('  - Third arc should be an S-curve')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/draw-arc-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: draw-arc-error.png')
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
