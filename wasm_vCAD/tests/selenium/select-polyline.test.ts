/**
 * Test selecting polyline with select tool
 *
 * This test verifies that polylines can be selected
 * with the select tool.
 *
 * Run with: npm run test:e2e:select-polyline
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Select Polyline\n')

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

    // Draw two polylines
    console.log('📝 Step 2: Draw first polyline')
    const polylineButton = await driver.findElement(By.xpath("//button[contains(., 'Polyline')]"))
    await polylineButton.click()
    await driver.sleep(300)

    const poly1Points = [
      { x: -150, y: -100 },
      { x: -50, y: -150 },
      { x: 50, y: -100 },
      { x: 100, y: -150 },
    ]

    for (const pt of poly1Points) {
      await actions.move({ origin: canvas, x: pt.x, y: pt.y }).click().perform()
      await driver.sleep(200)
    }
    await driver.actions().sendKeys('\n').perform()
    await driver.sleep(500)
    console.log('✅ First polyline drawn\n')

    console.log('📝 Step 3: Draw second polyline')
    await polylineButton.click()
    await driver.sleep(300)

    const poly2Points = [
      { x: -100, y: 50 },
      { x: 0, y: 100 },
      { x: 100, y: 50 },
    ]

    for (const pt of poly2Points) {
      await actions.move({ origin: canvas, x: pt.x, y: pt.y }).click().perform()
      await driver.sleep(200)
    }
    await driver.actions().sendKeys('\n').perform()
    await driver.sleep(500)
    console.log('✅ Second polyline drawn\n')

    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/select-polyline-elements.png', screenshot, 'base64')
    console.log('📸 Saved: select-polyline-elements.png\n')

    // Switch to select tool
    console.log('📝 Step 4: Switch to Select tool')
    const selectButton = await driver.findElement(By.xpath("//button[contains(., 'Select')]"))
    await selectButton.click()
    await driver.sleep(300)
    console.log('✅ Select tool activated\n')

    // Select first polyline
    console.log('📝 Step 5: Select first polyline')
    await actions.move({ origin: canvas, x: -100, y: -125 }).click().perform()
    await driver.sleep(500)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/select-polyline-first.png', screenshot, 'base64')
    console.log('📸 Saved: select-polyline-first.png')
    console.log('   ✅ First polyline should be highlighted\n')

    // Select second polyline
    console.log('📝 Step 6: Select second polyline')
    await actions.move({ origin: canvas, x: 0, y: 75 }).click().perform()
    await driver.sleep(500)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/select-polyline-second.png', screenshot, 'base64')
    console.log('📸 Saved: select-polyline-second.png')
    console.log('   ✅ Second polyline should be highlighted\n')

    // Check for errors
    console.log('📝 Step 7: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')

    if (errors.length > 0) {
      console.log('\n⚠️  Browser errors:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('✅ No errors\n')
    }

    // Finish sketch
    console.log('📝 Step 8: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)

    console.log('\n🎉 Polyline selection test completed successfully!')
    console.log('\n📸 Screenshots:')
    console.log('  1. select-polyline-elements.png - All drawn polylines')
    console.log('  2. select-polyline-first.png    - First polyline selected')
    console.log('  3. select-polyline-second.png   - Second polyline selected')
    console.log('\n📋 Expected result:')
    console.log('  - Polylines should be selectable with select tool')
    console.log('  - Selected polylines should be visually highlighted')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/select-polyline-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: select-polyline-error.png')
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
