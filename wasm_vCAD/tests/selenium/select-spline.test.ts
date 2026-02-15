/**
 * Test selecting spline with select tool
 *
 * This test verifies that splines can be selected
 * with the select tool.
 *
 * Run with: npm run test:e2e:select-spline
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Select Spline\n')

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

    // Draw first spline
    console.log('📝 Step 2: Draw first spline')
    const splineButton = await driver.findElement(By.xpath("//button[contains(., 'Spline')]"))
    await splineButton.click()
    await driver.sleep(300)

    const spline1Points = [
      { x: -150, y: -100 },
      { x: -100, y: -150 },
      { x: -50, y: -120 },
      { x: 0, y: -150 },
    ]

    for (const pt of spline1Points) {
      await actions.move({ origin: canvas, x: pt.x, y: pt.y }).click().perform()
      await driver.sleep(200)
    }
    await driver.actions().sendKeys('\n').perform()
    await driver.sleep(500)
    console.log('✅ First spline drawn\n')

    // Draw second spline
    console.log('📝 Step 3: Draw second spline')
    await splineButton.click()
    await driver.sleep(300)

    const spline2Points = [
      { x: -100, y: 50 },
      { x: -50, y: 100 },
      { x: 50, y: 100 },
      { x: 100, y: 50 },
    ]

    for (const pt of spline2Points) {
      await actions.move({ origin: canvas, x: pt.x, y: pt.y }).click().perform()
      await driver.sleep(200)
    }
    await driver.actions().sendKeys('\n').perform()
    await driver.sleep(500)
    console.log('✅ Second spline drawn\n')

    // Draw a line for comparison
    console.log('📝 Step 4: Draw a line (for comparison)')
    const lineButton = await driver.findElement(By.xpath("//button[@title='Line']"))
    await lineButton.click()
    await driver.sleep(300)

    await actions.move({ origin: canvas, x: 50, y: -50 }).press().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 150, y: -100 }).release().perform()
    await driver.sleep(500)
    console.log('✅ Line drawn\n')

    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/select-spline-elements.png', screenshot, 'base64')
    console.log('📸 Saved: select-spline-elements.png\n')

    // Switch to select tool
    console.log('📝 Step 5: Switch to Select tool')
    const selectButton = await driver.findElement(By.xpath("//button[contains(., 'Select')]"))
    await selectButton.click()
    await driver.sleep(300)
    console.log('✅ Select tool activated\n')

    // Try to select first spline
    console.log('📝 Step 6: Select first spline (click on it)')
    await actions.move({ origin: canvas, x: -75, y: -135 }).click().perform()
    await driver.sleep(500)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/select-spline-first.png', screenshot, 'base64')
    console.log('📸 Saved: select-spline-first.png')
    console.log('   ✅ First spline should be highlighted/selected\n')

    // Select second spline
    console.log('📝 Step 7: Select second spline')
    await actions.move({ origin: canvas, x: 0, y: 80 }).click().perform()
    await driver.sleep(500)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/select-spline-second.png', screenshot, 'base64')
    console.log('📸 Saved: select-spline-second.png')
    console.log('   ✅ Second spline should be highlighted/selected\n')

    // Select line (to verify other elements work too)
    console.log('📝 Step 8: Select line')
    await actions.move({ origin: canvas, x: 100, y: -75 }).click().perform()
    await driver.sleep(500)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/select-spline-line.png', screenshot, 'base64')
    console.log('📸 Saved: select-spline-line.png')
    console.log('   ✅ Line should be highlighted/selected\n')

    // Multi-select: Ctrl+click to add first spline to selection
    console.log('📝 Step 9: Multi-select (Ctrl+click on first spline)')
    await actions.move({ origin: canvas, x: -75, y: -135 }).keyDown('\uE009').click().keyUp('\uE009').perform()
    await driver.sleep(500)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/select-spline-multi.png', screenshot, 'base64')
    console.log('📸 Saved: select-spline-multi.png')
    console.log('   ✅ Both line and first spline should be selected\n')

    // Check for errors
    console.log('📝 Step 10: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')

    if (errors.length > 0) {
      console.log('\n⚠️  Browser errors:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('✅ No errors\n')
    }

    // Finish sketch
    console.log('📝 Step 11: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)

    console.log('\n🎉 Spline selection test completed successfully!')
    console.log('\n📸 Screenshots:')
    console.log('  1. select-spline-elements.png - All drawn elements')
    console.log('  2. select-spline-first.png    - First spline selected')
    console.log('  3. select-spline-second.png   - Second spline selected')
    console.log('  4. select-spline-line.png     - Line selected')
    console.log('  5. select-spline-multi.png    - Multi-selection (line + spline)')
    console.log('\n📋 Expected result:')
    console.log('  - Splines should be selectable with select tool')
    console.log('  - Selected elements should be visually highlighted')
    console.log('  - Multi-selection should work with Ctrl+click')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/select-spline-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: select-spline-error.png')
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
