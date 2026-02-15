/**
 * Debug test to see what's on the page
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'

const APP_URL = 'http://localhost:5176'

async function debug() {
  const options = new chrome.Options()
  options.addArguments('--headless')
  options.addArguments('--no-sandbox')
  options.addArguments('--disable-dev-shm-usage')
  options.addArguments('--window-size=1920,1080')

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  try {
    await driver.get(APP_URL)
    await driver.sleep(5000)

    // Get page source
    const html = await driver.getPageSource()
    console.log('=== PAGE HTML ===')
    console.log(html.substring(0, 1000))
    console.log('...')

    // Get all elements
    const body = await driver.findElement(By.css('body'))
    const bodyHTML = await body.getAttribute('innerHTML')
    console.log('\n=== BODY CONTENT ===')
    console.log(bodyHTML.substring(0, 500))

    // Check console errors
    const logs = await driver.manage().logs().get('browser')
    console.log('\n=== BROWSER CONSOLE ===')
    logs.forEach(log => console.log(`[${log.level}] ${log.message}`))
  } finally {
    await driver.quit()
  }
}

debug().catch(console.error)
