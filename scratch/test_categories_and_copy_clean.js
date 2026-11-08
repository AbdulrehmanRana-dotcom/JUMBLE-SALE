const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

async function testAll() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();

  console.log('1. Navigating to root / login...');
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Click "Continue as Guest"
  console.log('2. Clicking Continue as Guest...');
  const guestBtn = page.locator('text=Continue as Guest').first();
  if (await guestBtn.count() > 0) {
    await guestBtn.click();
    await page.waitForTimeout(2500);
  } else {
    // Fill consumer email and sign in
    const inputs = await page.locator('input').all();
    if (inputs.length >= 2) {
      await inputs[0].fill('ali@consumer.com');
      await inputs[1].fill('abcd1234');
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForTimeout(2500);
    }
  }

  console.log('3. Now on Home Screen. Taking screenshot of initial categories & feed...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'home_categories_clean_loaded.png'), fullPage: false });

  // Check Category Chips presence
  const categoryChips = await page.$$eval('[role="button"]', (btns) =>
    btns.map((b) => b.innerText?.trim()).filter((t) => t && t.length > 0)
  );
  console.log('Category buttons found:', categoryChips);

  // Click Footwear & Accessories
  console.log('4. Clicking Footwear & Accessories chip...');
  const footwearChip = page.locator('text=Footwear & Accessories').first();
  if (await footwearChip.count() > 0) {
    await footwearChip.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'category_footwear_filtered.png'), fullPage: false });
    
    // Check text content on page
    const pageContent = await page.textContent('body');
    const hasBata = pageContent.includes('Bata') || pageContent.includes('Sneakers');
    const hasLawnInFootwear = pageContent.includes('Summer Lawn Sale');
    console.log('Footwear filter check:', { hasBata, hasLawnInFootwear });
  } else {
    console.log('Footwear chip not found');
  }

  // Click Electronics & Mobiles
  console.log('5. Clicking Electronics & Mobiles chip...');
  const elecChip = page.locator('text=Electronics & Mobiles').first();
  if (await elecChip.count() > 0) {
    await elecChip.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'category_electronics_filtered.png'), fullPage: false });
    
    const pageContent = await page.textContent('body');
    const hasPriceOye = pageContent.includes('PriceOye') || pageContent.includes('Redmi');
    const hasKurtisInElectronics = pageContent.includes('Ready-to-Wear Kurtis');
    console.log('Electronics filter check:', { hasPriceOye, hasKurtisInElectronics });
  }

  // Click All
  console.log('6. Clicking All chip...');
  const allChip = page.locator('text=All').first();
  if (await allChip.count() > 0) {
    await allChip.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'category_all_reset.png'), fullPage: false });
  }

  // Check (Copy)
  console.log('7. Verifying body has no "(Copy)" text...');
  const fullBody = await page.textContent('body');
  const copyMatches = fullBody.match(/\(Copy\)/gi);
  console.log('(Copy) matches found:', copyMatches ? copyMatches.length : 0);

  await browser.close();
  console.log('=== TEST COMPLETED SUCCESSFULLY ===');
}

testAll().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
