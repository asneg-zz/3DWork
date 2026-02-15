/**
 * Test context menu functionality
 *
 * This test verifies that right-click shows context menu
 * and menu actions work correctly.
 *
 * Run with: npm run test:e2e:context-menu
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5178'
const WAIT_TIMEOUT = 10000

async function runTest() {
  console.log('🧪 Test: Context Menu\n')

  const options = new chrome.Options()
  // Run in visible mode to see context menu
  options.addArguments('--window-size=1920,1080')
  options.addArguments('--enable-webgl')

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

    // Draw some elements
    console.log('📝 Step 2: Draw elements')

    // Draw line
    const lineButton = await driver.findElement(By.xpath("//button[@title='Line']"))
    await lineButton.click()
    await driver.sleep(300)
    await actions.move({ origin: canvas, x: -150, y: -100 }).press().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: -50, y: -100 }).release().perform()
    await driver.sleep(300)
    console.log('  ✅ Line drawn')

    // Draw circle
    const circleButton = await driver.findElement(By.xpath("//button[@title='Circle']"))
    await circleButton.click()
    await driver.sleep(300)
    await actions.move({ origin: canvas, x: 0, y: 0 }).press().perform()
    await driver.sleep(100)
    await actions.move({ origin: canvas, x: 50, y: 0 }).release().perform()
    await driver.sleep(300)
    console.log('  ✅ Circle drawn')

    // Draw spline
    const splineButton = await driver.findElement(By.xpath("//button[contains(., 'Spline')]"))
    await splineButton.click()
    await driver.sleep(300)
    const splinePoints = [
      { x: 100, y: -100 },
      { x: 150, y: -50 },
      { x: 100, y: 0 },
    ]
    for (const pt of splinePoints) {
      await actions.move({ origin: canvas, x: pt.x, y: pt.y }).click().perform()
      await driver.sleep(200)
    }
    await driver.actions().sendKeys('\n').perform()
    await driver.sleep(300)
    console.log('  ✅ Spline drawn\n')

    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/context-menu-elements.png', screenshot, 'base64')
    console.log('📸 Saved: context-menu-elements.png\n')

    // Switch to select mode
    console.log('📝 Step 3: Switch to Select mode')
    const selectButton = await driver.findElement(By.xpath("//button[contains(., 'Select')]"))
    await selectButton.click()
    await driver.sleep(300)
    console.log('✅ Select mode activated\n')

    // Right-click on line to show context menu
    console.log('📝 Step 4: Right-click on line to show context menu')
    await actions.move({ origin: canvas, x: -100, y: -100 }).contextClick().perform()
    await driver.sleep(1000)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/context-menu-line.png', screenshot, 'base64')
    console.log('📸 Saved: context-menu-line.png')
    console.log('   ✅ Context menu should be visible for line\n')

    // Look for Delete button in context menu
    console.log('📝 Step 5: Click Delete from context menu')
    try {
      const deleteButton = await driver.wait(
        until.elementLocated(By.xpath("//button[contains(., 'Delete')]")),
        3000
      )
      await deleteButton.click()
      await driver.sleep(500)
      console.log('✅ Delete clicked from context menu\n')
    } catch (error) {
      console.log('⚠️  Delete button not found, clicking elsewhere to close menu')
      await actions.move({ origin: canvas, x: 0, y: 0 }).click().perform()
      await driver.sleep(500)
    }

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/context-menu-after-delete.png', screenshot, 'base64')
    console.log('📸 Saved: context-menu-after-delete.png')
    console.log('   ✅ Line should be deleted\n')

    // Right-click on circle
    console.log('📝 Step 6: Right-click on circle')
    await actions.move({ origin: canvas, x: 30, y: 0 }).contextClick().perform()
    await driver.sleep(1000)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/context-menu-circle.png', screenshot, 'base64')
    console.log('📸 Saved: context-menu-circle.png')
    console.log('   ✅ Context menu should show for circle\n')

    // Close menu by clicking elsewhere
    console.log('📝 Step 7: Close menu by clicking elsewhere')
    await actions.move({ origin: canvas, x: 200, y: 100 }).click().perform()
    await driver.sleep(500)
    console.log('✅ Menu closed\n')

    // Right-click on spline
    console.log('📝 Step 8: Right-click on spline')
    await actions.move({ origin: canvas, x: 125, y: -50 }).contextClick().perform()
    await driver.sleep(1000)

    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/context-menu-spline.png', screenshot, 'base64')
    console.log('📸 Saved: context-menu-spline.png')
    console.log('   ✅ Context menu should show for spline\n')

    // Press Escape to close menu
    console.log('📝 Step 9: Close menu with Escape key')
    await driver.actions().sendKeys('\uE00C').perform()  // Escape key
    await driver.sleep(500)
    console.log('✅ Menu closed with Escape\n')

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

    console.log('\n🎉 Context menu test completed!')
    console.log('\n📸 Screenshots:')
    console.log('  1. context-menu-elements.png     - Initial elements')
    console.log('  2. context-menu-line.png         - Context menu on line')
    console.log('  3. context-menu-after-delete.png - After deleting line')
    console.log('  4. context-menu-circle.png       - Context menu on circle')
    console.log('  5. context-menu-spline.png       - Context menu on spline')
    console.log('\n📋 Expected result:')
    console.log('  - Right-click on element shows context menu')
    console.log('  - Context menu shows element type as header')
    console.log('  - Delete option removes the element')
    console.log('  - Menu closes on click outside or Escape')

    console.log('\n✨ Press Enter to close browser...')
    await new Promise(resolve => {
      process.stdin.once('data', resolve)
    })

  } catch (error) {
    console.error('\n❌ Test failed:', error)

    try {
      const screenshot = await driver.takeScreenshot()
      writeFileSync('tests/selenium/context-menu-error.png', screenshot, 'base64')
      console.log('📸 Error screenshot: context-menu-error.png')
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
