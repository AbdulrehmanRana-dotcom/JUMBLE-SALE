const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('=== STARTING TROUSERS & APPAREL AVAILABILITY VERIFICATION ===');
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
    await page.waitForTimeout(4000);

    const body = await page.innerText('body');
    const countAfter = await page.locator('text=Claim Deal').count();
    const newCards = countAfter - countBefore;

    return { body, newCards, totalCards: countAfter };
  }

  // --- TEST 1: User's Exact First Query ("trouser ha apke paas") ---
  console.log('\n--- TEST 1: "trouser ha apke paas" ---');
  const t1 = await sendAndInspect('trouser ha apke paas');
  const t1NotOffTopic = !t1.body.includes("Sorry, I can't answer that");
  const t1StatesAvailable = t1.body.includes('available hain') || t1.body.includes('Outfitters');
  const t1MentionsBrands = t1.body.includes('Outfitters') && t1.body.includes('Khaadi');
  const t1ZeroCards = t1.newCards === 0;

  console.log('T1 (Deduces product availability, NOT off-topic):', t1NotOffTopic ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (States available clearly):', t1StatesAvailable ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (Mentions registered brands Outfitters & Khaadi):', t1MentionsBrands ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (0 Cards Dumped - Show On Demand):', t1ZeroCards ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 2: User's Exact Second Query ("trousers available ha aapki app mai?") ---
  console.log('\n--- TEST 2: "trousers available ha aapki app mai?" ---');
  const t2 = await sendAndInspect('trousers available ha aapki app mai?');
  const t2NotVague = !t2.body.includes('Is category mein hamare verified');
  const t2NamesTrouserBrands = t2.body.includes('Outfitters') && (t2.body.includes('trousers') || t2.body.includes('bottoms'));
  const t2ZeroCards = t2.newCards === 0;

  console.log('T2 (NO vague "Is category mein" placeholder):', t2NotVague ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T2 (Names registered brands & trousers specifically):', t2NamesTrouserBrands ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T2 (0 Cards Dumped):', t2ZeroCards ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 3: User Commands to Show ("Outfitters ke trousers dikhao") ---
  console.log('\n--- TEST 3: "Outfitters ke trousers dikhao" (Explicit Show) ---');
  const t3 = await sendAndInspect('Outfitters ke trousers dikhao');
  const t3ShowsCards = t3.newCards > 0;
  console.log('T3 (Shows deal cards on explicit command):', t3ShowsCards ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 4: Sub-item Outerwear ("hoodies mil jaye gi?") ---
  console.log('\n--- TEST 4: "hoodies mil jaye gi?" ---');
  const t4 = await sendAndInspect('hoodies mil jaye gi?');
  const t4MentionsHoodies = t4.body.includes('hoodies') && t4.body.includes('Outfitters');
  const t4ZeroCards = t4.newCards === 0;
  console.log('T4 (Recognizes hoodies sub-entity & Outfitters brand):', t4MentionsHoodies ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T4 (0 Cards Dumped before command):', t4ZeroCards ? 'PASSED ✅' : 'FAILED ❌');

  // Capture final full-page screenshot
  const snapPath = path.join(ARTIFACT_DIR, 'trousers_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('\nFinal screenshot saved to:', snapPath);

  await browser.close();

  const allPassed =
    t1NotOffTopic && t1StatesAvailable && t1MentionsBrands && t1ZeroCards &&
    t2NotVague && t2NamesTrouserBrands && t2ZeroCards &&
    t3ShowsCards &&
    t4MentionsHoodies && t4ZeroCards;

  console.log(`\n======================================================`);
  if (allPassed) {
    console.log('🎉 ALL TROUSERS & APPAREL TESTS PASSED 100%! 🎉');
    process.exit(0);
  } else {
    console.log('⚠️ SOME TESTS FAILED. PLEASE REVIEW LOGS ABOVE.');
    process.exit(1);
  }
})();
