/**
 * Test repeated trim operations
 * This verifies that the ID field fix allows trimming already-trimmed elements
 *
 * Scenario:
 * 1. Draw 3 intersecting lines forming a # pattern
 * 2. Trim line A with line B → creates 2 segments
 * 3. Trim one of the new segments with line C → should work!
 *
 * Run with: npm run test:e2e:repeated-trim
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Repeated Trim Operations\n')
  console.log('This test verifies the ID field fix for repeated trimming\n')

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

    // Select line tool
    const lineButton = await driver.findElement(By.xpath("//button[@title='Line']"))
    await lineButton.click()
    await driver.sleep(200)

    // Step 2: Draw 3 intersecting lines
    console.log('📝 Step 2: Draw 3 intersecting lines')
    console.log('  Line 1: Horizontal (-200, 0) to (200, 0)')
    await actions.move({ origin: canvas, x: -200, y: 0 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 200, y: 0 }).click().perform()
    await driver.sleep(300)

    console.log('  Line 2: Vertical at x=-100')
    await actions.move({ origin: canvas, x: -100, y: -150 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: -100, y: 150 }).click().perform()
    await driver.sleep(300)

    console.log('  Line 3: Vertical at x=100')
    await actions.move({ origin: canvas, x: 100, y: -150 }).click().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 100, y: 150 }).click().perform()
    await driver.sleep(300)
    console.log('✅ Three lines drawn\n')

    // Screenshot before trim
    console.log('📝 Step 3: Screenshot before any trim')
    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/repeated-trim-before.png', screenshot, 'base64')
    console.log('✅ Saved: repeated-trim-before.png\n')

    // Select trim tool
    console.log('📝 Step 4: Select Trim tool')
    const trimButton = await driver.findElement(By.xpath("//button[@title='Trim']"))
    await trimButton.click()
    await driver.sleep(200)
    console.log('✅ Trim tool selected\n')

    // First trim: trim horizontal line with left vertical
    console.log('📝 Step 5: FIRST TRIM - Trim left part of horizontal line')
    console.log('  Click at (-150, 0) - left segment of horizontal line')
    await actions.move({ origin: canvas, x: -150, y: 0 }).click().perform()
    await driver.sleep(500)
    console.log('✅ First trim executed\n')

    // Screenshot after first trim
    console.log('📝 Step 6: Screenshot after first trim')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/repeated-trim-first.png', screenshot, 'base64')
    console.log('✅ Saved: repeated-trim-first.png\n')

    // Second trim: trim the middle segment with right vertical
    console.log('📝 Step 7: SECOND TRIM - Trim middle segment (result of first trim)')
    console.log('  Click at (0, 0) - middle segment between the two verticals')
    console.log('  This is trimming an element created by the previous trim!')
    await actions.move({ origin: canvas, x: 0, y: 0 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Second trim executed\n')

    // Screenshot after second trim
    console.log('📝 Step 8: Screenshot after second trim')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/repeated-trim-second.png', screenshot, 'base64')
    console.log('✅ Saved: repeated-trim-second.png\n')

    // Third trim: trim right segment
    console.log('📝 Step 9: THIRD TRIM - Trim right segment')
    console.log('  Click at (150, 0) - right segment')
    await actions.move({ origin: canvas, x: 150, y: 0 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Third trim executed\n')

    // Final screenshot
    console.log('📝 Step 10: Final screenshot')
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/repeated-trim-final.png', screenshot, 'base64')
    console.log('✅ Saved: repeated-trim-final.png\n')

    // Check browser console
    console.log('📝 Step 11: Check for errors')
    const logs = await driver.manage().logs().get('browser')
    const errors = logs.filter(log => log.level.name === 'SEVERE')
    const trimLogs = logs.filter(log => log.message.includes('Trim') || log.message.includes('trim'))

    console.log('\n📋 Trim operation logs:')
    trimLogs.slice(-20).forEach(log => {
      const msg = log.message.replace(/^.*?"/, '').replace(/".*$/, '')
      console.log(`  ${msg}`)
    })

    if (errors.length > 0) {
      console.log('\n⚠️  Browser errors:')
      errors.forEach(err => console.log(`  - ${err.message}`))
    } else {
      console.log('\n✅ No errors\n')
    }

    // Finish sketch
    console.log('📝 Step 12: Finish sketch')
    const finishButton = await driver.findElement(By.xpath("//button[contains(., 'Finish Sketch')]"))
    await finishButton.click()
    await driver.sleep(500)

    console.log('\n🎉 Repeated trim test completed successfully!')
    console.log('\n📸 Screenshots:')
    console.log('  1. repeated-trim-before.png  - 3 lines before trim')
    console.log('  2. repeated-trim-first.png   - After 1st trim (left segment removed)')
    console.log('  3. repeated-trim-second.png  - After 2nd trim (middle segment removed)')
    console.log('  4. repeated-trim-final.png   - After 3rd trim (right segment removed)')
    console.log('\n📋 Expected result:')
    console.log('  - Only two vertical lines should remain')
    console.log('  - If repeated trim works, all 3 horizontal segments should be gone')

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/repeated-trim-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: repeated-trim-error.png')
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
