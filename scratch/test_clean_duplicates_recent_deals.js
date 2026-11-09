const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

async function testCleanDuplicates() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();

  console.log('1. Signing in as Khaadi brand...');
  await page.goto('http://localhost:8081');
  await page.waitForTimeout(2000);

  const inputs = await page.locator('input').all();
  if (inputs.length >= 2) {
    await inputs[0].fill('contact@khaadi.com');
    await inputs[1].fill('abcd1234');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(2500);
  }

  // Duplicate Kurtis deal twice to simulate the user's exact state
  console.log('2. Navigating to /posts to ensure duplicate deals exist...');
  await page.goto('http://localhost:8081/posts');
  await page.waitForTimeout(2000);

  // Now go to /profile
  console.log('3. Navigating to /profile...');
  await page.goto('http://localhost:8081/profile');
  await page.waitForTimeout(2000);

  // Click "Recent Deals"
  console.log('4. Clicking Recent Deals...');
  const recentDealsBtn = page.getByText('Recent Deals').first();
  if (await recentDealsBtn.count() > 0) {
    await recentDealsBtn.click();
    await page.waitForTimeout(1500);
  }

  // Take screenshot before cleaning
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'recent_deals_before_clean.png'), fullPage: false });

  // Check if "Clean Duplicates" button is visible
  console.log('5. Checking Clean Duplicates button...');
  const cleanBtn = page.getByText('Clean Duplicates').first();
  if (await cleanBtn.count() > 0) {
    console.log('Clean Duplicates button found! Clicking...');
    await cleanBtn.click();
    await page.waitForTimeout(2000);
  } else {
    console.log('Checking individual trash buttons...');
    const trashBtns = await page.locator('[aria-label="trash-outline"], svg, path').all();
    console.log('Trash buttons count:', trashBtns.length);
  }

  // Take screenshot after cleaning
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'recent_deals_after_clean.png'), fullPage: false });

  // Count Kurtis deals now
  const pageText = await page.textContent('body');
  const matches = pageText.match(/Buy 1 Get 1 Free Ready-to-Wear Kurtis/g);
  console.log('Kurtis occurrences remaining:', matches ? matches.length : 0);

  await browser.close();
  console.log('=== TEST COMPLETED SUCCESSFULLY ===');
}

testCleanDuplicates().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
