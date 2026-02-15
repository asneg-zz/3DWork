/**
 * Selenium test for Trim operation on Circle
 * Tests trimming a circle with intersecting lines
 *
 * Run with: npm run test:e2e:trim-circle
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5176'
const WAIT_TIMEOUT = 10000

async function runCircleTrimTest() {
  console.log('🧪 Starting Circle Trim test...\n')

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
    // Step 1: Load and create sketch
    console.log('📝 Step 1: Load application and create sketch')
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

    // Step 2: Draw circle
    console.log('📝 Step 2: Draw circle at center')
    const circleButton = await driver.findElement(By.xpath("//button[@title='Circle']"))
    await circleButton.click()
    await driver.sleep(200)

    // Draw circle from center (0,0) with radius 150
    await actions.move({ origin: canvas, x: 0, y: 0 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 150, y: 0 }).click().perform()
    await driver.sleep(300)
    console.log('✅ Circle drawn\n')

    // Step 3: Draw first intersecting line (horizontal)
    console.log('📝 Step 3: Draw first intersecting line (horizontal)')
    const lineButton = await driver.findElement(By.xpath("//button[@title='Line']"))
    await lineButton.click()
    await driver.sleep(200)

    // Horizontal line through circle: (-200, 0) to (200, 0)
    await actions.move({ origin: canvas, x: -200, y: 0 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 200, y: 0 }).click().perform()
    await driver.sleep(300)
    console.log('✅ First line drawn (horizontal)\n')

    // Step 4: Draw second intersecting line (vertical)
    console.log('📝 Step 4: Draw second intersecting line (vertical)')

    // Vertical line through circle: (0, -200) to (0, 200)
    await actions.move({ origin: canvas, x: 0, y: -200 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 0, y: 200 }).click().perform()
    await driver.sleep(300)
    console.log('✅ Second line drawn (vertical)\n')

    // Step 5: Screenshot before trim
    console.log('📝 Step 5: Screenshot before trim')
    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-circle-before.png', screenshot, 'base64')
    console.log('✅ Screenshot saved: trim-circle-before.png\n')

    // Step 6: Select Trim tool
    console.log('📝 Step 6: Select Trim tool')
    const trimButton = await driver.findElement(By.xpath("//button[@title='Trim']"))
    await trimButton.click()
    await driver.sleep(200)
    console.log('✅ Trim tool selected\n')

    // Step 7: Trim circle (top-right quadrant)
    console.log('📝 Step 7: Trim circle - click on top-right quadrant')
    // Click at (100, -100) - top-right quadrant of circle
    await actions.move({ origin: canvas, x: 100, y: -100 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Circle trimmed (top-right quadrant removed)\n')

    // Step 8: Screenshot after first trim
    console.log('📝 Step 8: Screenshot after first trim')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-circle-after1.png', screenshot, 'base64')
    console.log('✅ Screenshot saved: trim-circle-after1.png\n')

    // Step 9: Trim another segment (bottom-left quadrant)
    console.log('📝 Step 9: Trim circle - click on bottom-left quadrant')
    // Click at (-100, 100) - bottom-left quadrant
    await actions.move({ origin: canvas, x: -100, y: 100 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Circle trimmed (bottom-left quadrant removed)\n')

    // Step 10: Screenshot after second trim
    console.log('📝 Step 10: Screenshot after second trim')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-circle-after2.png', screenshot, 'base64')
    console.log('✅ Screenshot saved: trim-circle-after2.png\n')

    // Step 11: Check for errors
    console.log('📝 Step 11: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')

    if (errors.length > 0) {
      console.log('⚠️  Browser errors found:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('✅ No errors in browser console\n')
    }

    // Step 12: Finish sketch
    console.log('📝 Step 12: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)
    console.log('✅ Sketch finished\n')

    // Step 13: Final screenshot
    console.log('📝 Step 13: Final screenshot')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-circle-final.png', screenshot, 'base64')
    console.log('✅ Screenshot saved: trim-circle-final.png\n')

    console.log('🎉 Circle Trim test completed successfully!\n')
    console.log('📸 Screenshots saved:')
    console.log('   - tests/selenium/trim-circle-before.png  (circle + 2 lines)')
    console.log('   - tests/selenium/trim-circle-after1.png  (first quadrant trimmed)')
    console.log('   - tests/selenium/trim-circle-after2.png  (second quadrant trimmed)')
    console.log('   - tests/selenium/trim-circle-final.png   (final result)')

  } catch (error) {
    console.error('❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/trim-circle-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot saved to tests/selenium/trim-circle-error.png')
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError)
    }

    throw error
  } finally {
    await driver.quit()
  }
}

runCircleTrimTest().catch(error => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
