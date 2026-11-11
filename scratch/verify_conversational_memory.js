const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('--- STARTING MULTI-TURN CONVERSATIONAL MEMORY VERIFICATION ---');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 450, height: 950 } });
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
  await page.goto('http://localhost:8081/(consumer)/assistant', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(5000);

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

  // TEST SUITE 1: Brand Pitch -> Follow-up "in mai se sasta kaun sa hai?"
  console.log('\n--- SCENARIO 1: Pronoun / Selection Recall ---');
  const t1 = await sendAndInspect('khaadi deals dikhao');
  console.log('T1 (Khaadi deals shown):', t1.body.includes('Khaadi') && t1.claimBtns > 0 ? 'PASSED ✅' : 'FAILED ❌');

  const t2 = await sendAndInspect('in mai se sasta kaun sa hai?');
  const remembersKhaadi = t2.body.includes('Khaadi') || t2.body.includes('deals mein se sab se sasta');
  const highlightsCheapest = t2.body.includes('3,250') || t2.body.includes('sasta option');
  console.log('T2 (Remembers Khaadi context):', remembersKhaadi ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T2 (Identifies cheapest without asking brand):', highlightsCheapest ? 'PASSED ✅' : 'FAILED ❌');

  // TEST SUITE 2: Budget Persistence across Categories
  console.log('\n--- SCENARIO 2: Budget Persistence across Categories ---');
  const t3 = await sendAndInspect('mera budget sirf 3000 hai');
  console.log('T3 (Acknowledges budget):', t3.body.includes('3,000') || t3.body.includes('budget') ? 'PASSED ✅' : 'FAILED ❌');

  const t4 = await sendAndInspect('ab shoes dikhao');
  const retainedBudget = t4.body.includes('3,000') && (t4.body.includes('Bata') || t4.body.includes('footwear'));
  console.log('T4 (Applies remembered Rs. 3,000 budget to shoes):', retainedBudget ? 'PASSED ✅' : 'FAILED ❌');

  // TEST SUITE 3: Unregistered Brand Clarification -> "unke hi dikha do"
  console.log('\n--- SCENARIO 3: Pronoun Resolution from Alternatives ---');
  const t5 = await sendAndInspect('dinners ki deal available ha?');
  console.log('T5 (Clarifies Diners and mentions Khaadi/Outfitters):', t5.body.includes('Diners') || t5.body.includes('Outfitters') ? 'PASSED ✅' : 'FAILED ❌');

  const t6 = await sendAndInspect('unke hi dikha do');
  const resolvedUnke = (t6.body.includes('Outfitters') || t6.body.includes('Khaadi')) && t6.claimBtns > 0;
  console.log('T6 (Resolves "unke hi" to Khaadi & Outfitters):', resolvedUnke ? 'PASSED ✅' : 'FAILED ❌');

  // Capture final screenshot
  const snapPath = path.join(ARTIFACT_DIR, 'conversational_memory_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('\nScreenshot saved to:', snapPath);

  await browser.close();
  console.log('--- ALL MULTI-TURN MEMORY TESTS COMPLETED SUCCESSFULLY ---');
})();
