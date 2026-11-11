const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('=== STARTING BUDGET AVAILABILITY HONESTY VERIFICATION ===');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 480, height: 980 } });
  const page = await context.newPage();

  // 1. Login as Shopper (Zara)
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

  // 2. Navigate to Consumer Assistant
  console.log('2. Navigating to Consumer Assistant...');
  await page.goto('http://localhost:8081/(consumer)/assistant', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(5000);

  const input = page.locator('input').last();
  await input.waitFor({ timeout: 20000 });

  async function sendAndInspect(query) {
    console.log(`\n======================================================`);
    console.log(`CUSTOMER QUERY: "${query}"`);
    const countBefore = await page.locator('text=Claim Deal').count();
    await input.fill(query);
    await input.press('Enter');
    await page.waitForTimeout(3500);

    const body = await page.innerText('body');
    const countAfter = await page.locator('text=Claim Deal').count();
    const newCards = countAfter - countBefore;

    return { body, newCards, totalCards: countAfter };
  }

  // --- TEST 1: User's Exact First Query ("Rs 1000 se neechay kiya mil raha ha?") ---
  console.log('\n--- TEST 1: "Rs 1000 se neechay kiya mil raha ha?" ---');
  const t1 = await sendAndInspect('Rs 1000 se neechay kiya mil raha ha?');
  const t1NotOffTopic = !t1.body.includes("Sorry, I can't answer that");
  const t1HonestUnavail = t1.body.includes('Rs. 1,000 se neechay koi product ya verified deal available nahi');
  const t1RecommendsLowest = t1.body.includes('Saeed Ghani') && t1.body.includes('1,250');
  const t1NoCards = t1.newCards === 0;

  console.log('T1 (Deduces product/shopping intent, NOT off-topic):', t1NotOffTopic ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (Honestly states unavailable under Rs. 1,000):', t1HonestUnavail ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (Recommends lowest live deal Saeed Ghani Rs. 1,250):', t1RecommendsLowest ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (0 Cards Dumped - Show On Demand):', t1NoCards ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 2: User's Exact Second Query ("Rs 1000 se neechay konsi product mil rahi ha?") ---
  console.log('\n--- TEST 2: "Rs 1000 se neechay konsi product mil rahi ha?" ---');
  const t2 = await sendAndInspect('Rs 1000 se neechay konsi product mil rahi ha?');
  const t2NotVague = !t2.body.includes('Is category mein hamare verified');
  const t2HonestState = t2.body.includes('available nahi') && t2.body.includes('Saeed Ghani');
  const t2NoCards = t2.newCards === 0;

  console.log('T2 (NOT vague generic category blurb):', t2NotVague ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T2 (Clearly states availability status under 1000):', t2HonestState ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T2 (0 Cards Dumped):', t2NoCards ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 3: Available Budget Query ("Rs 3000 ke andar kya mil raha hai?") ---
  console.log('\n--- TEST 3: "Rs 3000 ke andar kya mil raha hai?" (Deals ARE Available) ---');
  const t3 = await sendAndInspect('Rs 3000 ke andar kya mil raha hai?');
  const t3Available = t3.body.includes('available hain') || t3.body.includes('3,000');
  const t3PitchesBest = t3.body.includes('Outfitters') || t3.body.includes('Saeed Ghani') || t3.body.includes('Cheezious');

  console.log('T3 (States deals ARE available in budget):', t3Available ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T3 (Pitches in-budget recommendations):', t3PitchesBest ? 'PASSED ✅' : 'FAILED ❌');

  // Capture final full-page screenshot
  const snapPath = path.join(ARTIFACT_DIR, 'budget_honesty_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('\nFinal screenshot saved to:', snapPath);

  await browser.close();

  const allPassed =
    t1NotOffTopic && t1HonestUnavail && t1RecommendsLowest && t1NoCards &&
    t2NotVague && t2HonestState && t2NoCards &&
    t3Available && t3PitchesBest;

  console.log(`\n======================================================`);
  if (allPassed) {
    console.log('🎉 ALL BUDGET AVAILABILITY HONESTY TESTS PASSED 100%! 🎉');
  } else {
    console.log('⚠️ SOME TESTS FAILED. PLEASE REVIEW LOGS ABOVE.');
  }
})();
