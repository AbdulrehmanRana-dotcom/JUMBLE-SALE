const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('--- STARTING ALL 5 SCREENSHOT CASES VERIFICATION ---');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 450, height: 900 } });
  const page = await context.newPage();

  // 1. Login as Shopper
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

  // 2. Navigate to Assistant
  console.log('2. Navigating to Consumer Assistant...');
  await page.goto('http://localhost:8081/(consumer)/assistant', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const input = page.locator('input[placeholder*="English or Roman Urdu"], input[type="text"]').last();
  await input.waitFor({ timeout: 10000 });

  async function sendAndInspect(query) {
    console.log(`\nTesting Query: "${query}"`);
    await input.fill(query);
    await input.press('Enter');
    await page.waitForTimeout(3500);
    const body = await page.innerText('body');
    const claimBtns = await page.locator('text=Claim Deal').count();
    return { body, claimBtns };
  }

  // Verify header has NO "database"
  const headerText = await page.innerText('body');
  const headerClean = !headerText.includes('Live Database Connected') && headerText.includes('Verified Brand Partners');
  console.log('HEADER JARGON PURGE:', headerClean ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 1: "tumharay brand mai kis trah ki products han?"
  const res1 = await sendAndInspect('tumharay brand mai kis trah ki products han?');
  const catExplained = res1.body.includes('Fashion & Kapray') && res1.body.includes('Footwear & Jootay');
  const noDbInRes1 = !res1.body.includes('database');
  console.log('TEST 1 (Explains categories & brands):', catExplained ? 'PASSED ✅' : 'FAILED ❌');
  console.log('TEST 1 (Zero database jargon):', noDbInRes1 ? 'PASSED ✅' : 'FAILED ❌');
  console.log('TEST 1 (No blind deal cards dumped):', res1.claimBtns === 0 ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 2: "football dekhtay ho?"
  const res2 = await sendAndInspect('football dekhtay ho?');
  const offTopicRefused = res2.body.includes("Sorry, I can't answer that.");
  console.log('TEST 2 (Off-topic refusal polite & clean):', offTopicRefused ? 'PASSED ✅' : 'FAILED ❌');
  console.log('TEST 2 (No deal cards dumped on off-topic):', res2.claimBtns === 0 ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 3: "dinners ki deal available ha?"
  const res3 = await sendAndInspect('dinners ki deal available ha?');
  const clarifiesDiners = res3.body.includes('Diners') || res3.body.includes('Cheezious');
  console.log('TEST 3 (Diners brand vs dinner clarification):', clarifiesDiners ? 'PASSED ✅' : 'FAILED ❌');
  console.log('TEST 3 (No deal cards dumped on brand inquiry):', res3.claimBtns === 0 ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 4: "madad kro meri shopping krnay mai"
  const res4 = await sendAndInspect('madad kro meri shopping krnay mai');
  const askedDiscovery = res4.body.includes('dilchaspi rakhte hain');
  console.log('TEST 4 (Consultative discovery without card dump):', askedDiscovery && res4.claimBtns === 0 ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 5: Explicit Request "khaadi deals dikhao" (Show on demand)
  const res5 = await sendAndInspect('khaadi deals dikhao');
  const dealsShown = res5.claimBtns > 0 && res5.body.includes('Khaadi');
  console.log('TEST 5 (Deals displayed when requested with "dikhao"):', dealsShown ? 'PASSED ✅' : 'FAILED ❌');

  // Capture final screenshot
  const snapPath = path.join(ARTIFACT_DIR, 'customer_centric_salesman_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('\nScreenshot saved to:', snapPath);

  await browser.close();
  console.log('--- ALL 5 TESTS COMPLETED ---');
})();
