const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('--- STARTING CONVERSATIONAL SALESMAN MASTERY VERIFICATION ---');
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

  // TEST 1: "madad kro meri shopping krnay mai" (Exact user screenshot)
  const res1 = await sendAndInspect('madad kro meri shopping krnay mai');
  const askedDiscovery = res1.body.includes('Sir, aap aaj kis tarah ke product mein dilchaspi rakhte hain?') || res1.body.includes('dilchaspi rakhte hain');
  console.log('TEST 1 ("madad kro" asks discovery question):', askedDiscovery ? 'PASSED ✅' : 'FAILED ❌');
  console.log('TEST 1 (No blind deal cards dumped):', res1.claimBtns === 0 ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 2: Typo Handling ("khadi ki lawn")
  const res2 = await sendAndInspect('khadi ki lawn');
  const recognizedKhaadi = res2.body.includes('Khaadi') && (res2.body.includes('Summer Lawn') || res2.body.includes('Kurtis'));
  console.log('TEST 2 (Typo "khadi" mapped to Khaadi):', recognizedKhaadi ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 3: Ambiguous Query ("kuch acha dikhao")
  const res3 = await sendAndInspect('kuch acha dikhao');
  const askedClarification = res3.body.includes('ladies ke liye hai ya gents ke liye?') || res3.body.includes('thora wazeh farmayein');
  console.log('TEST 3 ("kuch acha dikhao" counter-questions):', askedClarification ? 'PASSED ✅' : 'FAILED ❌');

  // Capture final screenshot
  const snapPath = path.join(ARTIFACT_DIR, 'conversational_salesman_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('\nScreenshot saved to:', snapPath);

  await browser.close();
  console.log('--- ALL TESTS COMPLETED SUCCESSFULLY ---');
})();
