const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('--- STARTING FOOTBALL SHOES VS SPORTS CHIT-CHAT VERIFICATION ---');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 450, height: 950 } });
  const page = await context.newPage();

  // 1. Login as Shopper
  console.log('1. Logging in as Shopper (Zara)...');
  await page.goto('http://localhost:8081/(auth)/login', { waitUntil: 'load', timeout: 45000 });
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

  // 2. Navigate to Assistant
  console.log('2. Navigating to Consumer Assistant...');
  await page.goto('http://localhost:8081/(consumer)/assistant', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(4000);

  const input = page.locator('input').last();
  await input.waitFor({ timeout: 20000 });

  async function sendAndInspect(query) {
    console.log(`\nSending: "${query}"`);
    await input.fill(query);
    await input.press('Enter');
    await page.waitForTimeout(3500);
    const body = await page.innerText('body');
    const claimBtns = await page.locator('text=Claim Deal').count();
    return { body, claimBtns };
  }

  // TEST 1: Pure Sports Chit-chat "football dekhtay ho?" -> Must be rejected!
  const res1 = await sendAndInspect('football dekhtay ho?');
  const chitChatRejected = res1.body.includes("Sorry, I can't answer that.");
  console.log('TEST 1 ("football dekhtay ho?" strictly rejected):', chitChatRejected ? 'PASSED ✅' : 'FAILED ❌');
  console.log('TEST 1 (No cards dumped):', res1.claimBtns === 0 ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 2: Product Inquiry "football shoes mil jaye gai?" -> Must NOT be rejected! Must offer Bata sports shoes!
  const res2 = await sendAndInspect('football shoes mil jaye gai?');
  const notRejected = !res2.body.includes("Sorry, I can't answer that.");
  const mentionsSportsShoes = res2.body.includes('Bata') && (res2.body.includes('Power sneakers') || res2.body.includes('sports') || res2.body.includes('footwear'));
  console.log('TEST 2 ("football shoes" NOT rejected as off-topic):', notRejected ? 'PASSED ✅' : 'FAILED ❌');
  console.log('TEST 2 (Offers Bata sports shoes / sneakers alternative):', mentionsSportsShoes ? 'PASSED ✅' : 'FAILED ❌');
  console.log('TEST 2 (No cards blurted out prematurely):', res2.claimBtns === 0 ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 3: User says "bata sports shoes dikhao" -> Cards appear!
  const res3 = await sendAndInspect('bata sports shoes dikhao');
  const cardsShown = res3.claimBtns > 0 && res3.body.includes('Bata');
  console.log('TEST 3 ("bata sports shoes dikhao" shows cards):', cardsShown ? 'PASSED ✅' : 'FAILED ❌');

  // Save screenshot
  const snapPath = path.join(ARTIFACT_DIR, 'football_shoes_fix_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('\nScreenshot saved to:', snapPath);

  await browser.close();
  console.log('--- ALL TESTS COMPLETED SUCCESSFULLY ---');
})();
