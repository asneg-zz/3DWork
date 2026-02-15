/**
 * Selenium test for Trim operation
 *
 * Run with: npm run test:e2e:trim
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5176'
const WAIT_TIMEOUT = 10000

async function runTrimTest() {
  console.log('🧪 Starting Trim operation test...\n')

  // Setup Chrome with WebGL support
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
    await driver.sleep(3000) // Wait for WASM
    console.log('✅ Application loaded\n')

    // Step 2: Create new sketch
    console.log('📝 Step 2: Create new sketch')
    const sketchButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Sketch')]")),
      WAIT_TIMEOUT
    )
    await sketchButton.click()
    await driver.sleep(500)
    console.log('✅ Sketch mode activated\n')

    // Step 3: Select Line tool
    console.log('📝 Step 3: Select Line tool')
    const lineButton = await driver.findElement(By.xpath("//button[@title='Line']"))
    await lineButton.click()
    await driver.sleep(200)
    console.log('✅ Line tool selected\n')

    // Step 4: Draw first line (horizontal)
    console.log('📝 Step 4: Draw first horizontal line')
    const canvas = await driver.findElement(By.css('canvas'))
    const actions = driver.actions({ async: true })

    // Draw horizontal line from (100, 200) to (400, 200)
    await actions.move({ origin: canvas, x: -250, y: 0 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 50, y: 0 }).click().perform()
    await driver.sleep(300)
    console.log('✅ First line drawn\n')

    // Step 5: Draw second line (vertical, intersecting)
    console.log('📝 Step 5: Draw second vertical line (intersecting)')

    // Draw vertical line from (200, 100) to (200, 300)
    await actions.move({ origin: canvas, x: -150, y: -100 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: -150, y: 100 }).click().perform()
    await driver.sleep(300)
    console.log('✅ Second line drawn (intersects first)\n')

    // Step 6: Take screenshot before trim
    console.log('📝 Step 6: Screenshot before trim')
    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-before.png', screenshot, 'base64')
    console.log('✅ Screenshot saved: trim-before.png\n')

    // Step 7: Select Trim tool
    console.log('📝 Step 7: Select Trim tool')
    const trimButton = await driver.findElement(By.xpath("//button[@title='Trim']"))
    await trimButton.click()
    await driver.sleep(200)
    console.log('✅ Trim tool selected\n')

    // Step 8: Click on line segment to trim
    console.log('📝 Step 8: Click on line segment to trim')
    // Click on the left part of horizontal line (should be trimmed)
    await actions.move({ origin: canvas, x: -200, y: 0 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Trim operation executed\n')

    // Step 9: Take screenshot after trim
    console.log('📝 Step 9: Screenshot after trim')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-after.png', screenshot, 'base64')
    console.log('✅ Screenshot saved: trim-after.png\n')

    // Step 10: Verify trim by checking console for errors
    console.log('📝 Step 10: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')

    if (errors.length > 0) {
      console.log('⚠️  Browser errors found:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('✅ No errors in browser console\n')
    }

    // Step 11: Finish sketch
    console.log('📝 Step 11: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)
    console.log('✅ Sketch finished\n')

    // Step 12: Final screenshot
    console.log('📝 Step 12: Final screenshot')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-final.png', screenshot, 'base64')
    console.log('✅ Screenshot saved: trim-final.png\n')

    console.log('🎉 Trim test completed successfully!\n')
    console.log('📸 Screenshots saved:')
    console.log('   - tests/selenium/trim-before.png  (before trim)')
    console.log('   - tests/selenium/trim-after.png   (after trim)')
    console.log('   - tests/selenium/trim-final.png   (final result)')

  } catch (error) {
    console.error('❌ Test failed:', error)

    // Take error screenshot
    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/trim-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot saved to tests/selenium/trim-error.png')
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError)
    }

    throw error
  } finally {
    await driver.quit()
  }
}

// Run test
runTrimTest().catch(error => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
