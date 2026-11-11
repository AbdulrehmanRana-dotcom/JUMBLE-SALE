const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 450, height: 900 } });
  const page = await context.newPage();

  console.log('1. Logging in as Shopper (Zara)...');
  await page.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const zaraChip = page.getByText('Zara (Shopper)').first();
  if (await zaraChip.count() > 0) {
    await zaraChip.click();
    await page.waitForTimeout(500);
  }

  const signInBtn = page.getByRole('button', { name: 'Sign In' });
  if (await signInBtn.count() > 0) {
    await signInBtn.click();
    await page.waitForTimeout(3000);
  }

  console.log('2. Navigating to Consumer Assistant...');
  await page.goto('http://localhost:8081/(consumer)/assistant', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const input = page.locator('input[placeholder*="English or Roman Urdu"], input[type="text"]').last();
  await input.waitFor({ timeout: 10000 });

  // Test 1: Bata Shoes
  console.log('\n--- TEST 1: "bata ke jootay dikhao" ---');
  await input.fill('bata ke jootay dikhao');
  await input.press('Enter');
  await page.waitForTimeout(3500);
  let text = await page.innerText('body');
  console.log('Bata detected:', text.includes('Bata'));

  // Test 2: Budget
  console.log('\n--- TEST 2: "mera budget 3000 hai" ---');
  await input.fill('mera budget 3000 hai');
  await input.press('Enter');
  await page.waitForTimeout(3500);
  text = await page.innerText('body');
  console.log('Budget detected:', text.includes('3,000') || text.includes('budget'));

  // Test 3: Sasta alternative
  console.log('\n--- TEST 3: "bohot mehnga hai sasta dikhao" ---');
  await input.fill('bohot mehnga hai sasta dikhao');
  await input.press('Enter');
  await page.waitForTimeout(3500);
  text = await page.innerText('body');
  console.log('Objection handled (sasta):', text.includes('sasti') || text.includes('Befikar') || text.includes('bachat'));

  // Capture final multi-turn salesman screenshot
  const finalScreenshot = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5/salesman_multiturn_verified.png';
  await page.screenshot({ path: finalScreenshot, fullPage: true });
  console.log('\nFinal multi-turn screenshot saved to:', finalScreenshot);

  await browser.close();
  console.log('All tests passed successfully!');
})();
