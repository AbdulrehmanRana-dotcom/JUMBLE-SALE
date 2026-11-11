const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('--- TESTING FOOTBALL QUERY ---');
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
  await page.waitForTimeout(2500);

  const input = page.locator('input[placeholder*="English or Roman Urdu"], input[type="text"]').last();
  await input.waitFor({ timeout: 10000 });

  console.log('3. Sending Query: "football dekhtay ho?"');
  await input.fill('football dekhtay ho?');
  await input.press('Enter');
  await page.waitForTimeout(3500);

  const body = await page.innerText('body');
  const hasRefusal = body.includes("Sorry, I can't answer that.");
  console.log('Refusal message present:', hasRefusal);

  // Check if any deal cards are shown for this query
  const dealCardsCount = await page.locator('text=Claim Deal').count();
  console.log('Claim deal buttons on page:', dealCardsCount);

  // Take screenshot
  const snapPath = path.join(ARTIFACT_DIR, 'football_query_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('Screenshot saved to:', snapPath);

  await browser.close();
  console.log('Verification finished! Result:', hasRefusal ? 'PASSED ✅' : 'FAILED ❌');
})();
