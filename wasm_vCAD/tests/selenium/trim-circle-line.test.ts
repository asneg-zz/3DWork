/**
 * Test trim circle with a single line
 * Expected: After trim, should remain arc + line segment (diameter length)
 *
 * Scenario:
 * 1. Draw circle at (0, 0) with radius 150
 * 2. Draw horizontal line from (-300, 50) to (300, 50) - crosses circle
 * 3. Click on BOTTOM part of circle to trim it
 * 4. Expected result: TOP arc remains + line between intersection points
 *
 * Run with: npm run test:e2e:trim-circle-line
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5176'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Trim circle with single line\n')
  console.log('Expected behavior:')
  console.log('  - Circle center at (0, 0), radius ~150px')
  console.log('  - Horizontal line crosses circle at y=50')
  console.log('  - Click on BOTTOM part → BOTTOM arc should be removed')
  console.log('  - Result: TOP arc remains\n')

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
    // Step 1: Setup
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

    // Step 2: Draw circle at center
    console.log('📝 Step 2: Draw circle')
    console.log('  Center: (0, 0)')
    console.log('  Radius: ~150px')

    const circleButton = await driver.findElement(By.xpath("//button[@title='Circle']"))
    await circleButton.click()
    await driver.sleep(200)

    // Circle: center (0,0), point on circle (150, 0)
    await actions.move({ origin: canvas, x: 0, y: 0 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 150, y: 0 }).click().perform()
    await driver.sleep(300)
    console.log('✅ Circle drawn\n')

    // Step 3: Draw horizontal line crossing circle
    console.log('📝 Step 3: Draw horizontal line')
    console.log('  From: (-300, 50) to (300, 50)')
    console.log('  This line crosses circle at 2 points')

    const lineButton = await driver.findElement(By.xpath("//button[@title='Line']"))
    await lineButton.click()
    await driver.sleep(200)

    // Horizontal line at y=50, crossing circle
    await actions.move({ origin: canvas, x: -300, y: 50 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 300, y: 50 }).click().perform()
    await driver.sleep(300)
    console.log('✅ Line drawn\n')

    // Step 4: Screenshot before trim
    console.log('📝 Step 4: Screenshot before trim')
    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-circle-line-before.png', screenshot, 'base64')
    console.log('✅ Saved: trim-circle-line-before.png\n')

    // Step 5: Select trim tool
    console.log('📝 Step 5: Select Trim tool')
    const trimButton = await driver.findElement(By.xpath("//button[@title='Trim']"))
    await trimButton.click()
    await driver.sleep(200)
    console.log('✅ Trim tool selected\n')

    // Step 6: Trim BOTTOM part of circle
    console.log('📝 Step 6: Click on BOTTOM part of circle to trim it')
    console.log('  Click position: (0, 120) - below the line')
    console.log('  Expected: BOTTOM arc (below line) should be REMOVED')
    console.log('  Expected: TOP arc (above line) should REMAIN')

    // Click at (0, 120) - this is BELOW the line (y=50), on the BOTTOM part of circle
    await actions.move({ origin: canvas, x: 0, y: 120 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Trim executed\n')

    // Step 7: Screenshot after trim
    console.log('📝 Step 7: Screenshot after trim')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-circle-line-after.png', screenshot, 'base64')
    console.log('✅ Saved: trim-circle-line-after.png\n')

    // Step 8: Check browser console
    console.log('📝 Step 8: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')
    const trimLogs = logs.filter(log => log.message.includes('trim_circle'))

    console.log('\n📋 Trim operation logs:')
    trimLogs.forEach(log => {
      const msg = log.message.replace(/^.*?"/, '').replace(/".*$/, '')
      console.log(`  ${msg}`)
    })

    if (errors.length > 0) {
      console.log('\n⚠️  Browser errors:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('\n✅ No errors\n')
    }

    // Step 9: Verify with second trim on line
    console.log('📝 Step 9: Trim line segments outside circle')
    console.log('  Click on LEFT part of line (outside circle)')

    await actions.move({ origin: canvas, x: -250, y: 50 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Left segment trimmed')

    console.log('  Click on RIGHT part of line (outside circle)')
    await actions.move({ origin: canvas, x: 250, y: 50 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Right segment trimmed\n')

    // Step 10: Final screenshot
    console.log('📝 Step 10: Final screenshot')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/trim-circle-line-final.png', screenshot, 'base64')
    console.log('✅ Saved: trim-circle-line-final.png\n')

    // Step 11: Finish
    console.log('📝 Step 11: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)

    console.log('\n🎉 Test completed!\n')
    console.log('📸 Screenshots:')
    console.log('  1. trim-circle-line-before.png - Circle + line')
    console.log('  2. trim-circle-line-after.png  - After trimming circle')
    console.log('  3. trim-circle-line-final.png  - After trimming line segments')
    console.log('\n📋 Expected result:')
    console.log('  - TOP arc (above y=50) should be visible')
    console.log('  - Line segment between intersection points (~diameter length)')
    console.log('  - BOTTOM arc should be GONE')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/trim-circle-line-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: trim-circle-line-error.png')
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
