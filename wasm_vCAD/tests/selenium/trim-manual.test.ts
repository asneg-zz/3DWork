/**
 * Manual trim test - requires manual drawing
 *
 * Instructions:
 * 1. Run: npm run test:e2e:trim-manual
 * 2. Browser will open (NOT headless)
 * 3. Manually draw:
 *    - Circle in center
 *    - Horizontal line crossing circle
 * 4. Test will automatically trim and take screenshots
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { writeFileSync } from 'fs'

const APP_URL = process.env.APP_URL || 'http://localhost:5176'

async function runManualTest() {
  console.log('\n🧪 Manual Trim Test\n')
  console.log('INSTRUCTIONS:')
  console.log('1. Browser window will open')
  console.log('2. Click "Sketch" button')
  console.log('3. Draw a CIRCLE in the center')
  console.log('4. Draw a HORIZONTAL LINE crossing the circle')
  console.log('5. Press ENTER in terminal when done\n')

  const options = new chrome.Options()
  // NO headless - show browser
  options.addArguments('--window-size=1920,1080')
  options.addArguments('--enable-webgl')

  const driver: WebDriver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  try {
    await driver.get(APP_URL)
    await driver.sleep(2000)

    console.log('✅ Browser opened')
    console.log('👉 Draw circle + line, then press ENTER here...\n')

    // Wait for user input
    await new Promise(resolve => {
      process.stdin.once('data', resolve)
    })

    console.log('\n📝 Starting automated trim...')

    // Take screenshot before trim
    let screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/manual-before.png', screenshot, 'base64')
    console.log('✅ Screenshot: manual-before.png')

    // Select Trim tool
    const trimButton = await driver.findElement(By.xpath("//button[@title='Trim']"))
    await trimButton.click()
    await driver.sleep(500)
    console.log('✅ Trim tool selected')

    console.log('\n👉 Click on the part of CIRCLE you want to REMOVE')
    console.log('   (Test will wait 10 seconds for you to click)')
    await driver.sleep(10000)

    // Screenshot after circle trim
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/manual-circle-trimmed.png', screenshot, 'base64')
    console.log('✅ Screenshot: manual-circle-trimmed.png')

    console.log('\n👉 Click on the parts of LINE outside circle (2 times)')
    console.log('   (Test will wait 10 seconds)')
    await driver.sleep(10000)

    // Final screenshot
    screenshot = await driver.takeScreenshot()
    writeFileSync('tests/selenium/manual-final.png', screenshot, 'base64')
    console.log('✅ Screenshot: manual-final.png')

    // Check elements
    const logs = await driver.manage().logs().get('browser')
    const trimLogs = logs.filter(log => log.message.includes('trim_circle') || log.message.includes('Trim'))

    console.log('\n📋 Trim logs:')
    trimLogs.slice(-10).forEach(log => {
      const msg = log.message.replace(/^.*?"/, '').replace(/".*$/, '')
      console.log(`  ${msg}`)
    })

    console.log('\n🎉 Test completed!')
    console.log('\n📸 Check screenshots:')
    console.log('  - manual-before.png')
    console.log('  - manual-circle-trimmed.png')
    console.log('  - manual-final.png')

    console.log('\n✨ Press ENTER to close browser...')
    await new Promise(resolve => {
      process.stdin.once('data', resolve)
    })

  } finally {
    await driver.quit()
  }
}

runManualTest().catch(console.error)
