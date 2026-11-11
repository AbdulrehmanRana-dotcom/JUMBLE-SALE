const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('=== STARTING OMNI-DOMAIN DEEP COMPREHENSION & 7-CONDITION VERIFICATION ===');
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

  // --- TEST 1: SCREENSHOT 1 DEFECT FIX ("madad kro meri shopping krnay mai") ---
  console.log('\n--- TEST 1: Shopping Guidance & Needs Discovery ---');
  const t1 = await sendAndInspect('madad kro meri shopping krnay mai');
  const t1NoDb = !t1.body.toLowerCase().includes('database');
  const t1NoCards = t1.newCards === 0;
  const t1HasDiscovery =
    t1.body.includes('kis tarah ke product') ||
    t1.body.includes('Fashion') ||
    t1.body.includes('target budget');
  console.log('T1 (Zero Database Jargon):', t1NoDb ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (0 Cards Dumped - Show On Demand):', t1NoCards ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (Consultative Needs Discovery Question):', t1HasDiscovery ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 2: SCREENSHOT 2 DEFECT FIX ("tumharay brand mai kis trah ki products han?") ---
  console.log('\n--- TEST 2: Platform & Brand Capabilities Overview ---');
  const t2 = await sendAndInspect('tumharay brand mai kis trah ki products han?');
  const t2NoDb = !t2.body.toLowerCase().includes('database');
  const t2NoCards = t2.newCards === 0;
  const t2ListsCategories =
    t2.body.includes('Fashion & Kapray') &&
    t2.body.includes('Footwear') &&
    t2.body.includes('Mobiles & Electronics') &&
    t2.body.includes('Food');
  console.log('T2 (Zero Database Jargon):', t2NoDb ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T2 (0 Cards Dumped - Show On Demand):', t2NoCards ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T2 (Comprehensive Platform Overview):', t2ListsCategories ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 3: SCREENSHOT 3 DEFECT FIX ("football shoes mil jaye gai?") ---
  console.log('\n--- TEST 3: Compound Sports Footwear Comprehension ---');
  const t3 = await sendAndInspect('football shoes mil jaye gai?');
  const t3NotOffTopic = !t3.body.includes("Sorry, I can't answer that");
  const t3MentionsBata = t3.body.includes('Bata') && t3.body.includes('sneakers');
  const t3NoCards = t3.newCards === 0;
  console.log('T3 (NOT rejected as off-topic sports):', t3NotOffTopic ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T3 (Offers Bata sports sneakers alternative):', t3MentionsBata ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T3 (0 Cards Dumped - Show On Demand):', t3NoCards ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 4: STRICT OFF-TOPIC TRIVIA ("football match kaun jeeta?") ---
  console.log('\n--- TEST 4: Pure Off-Topic Boundary Enforcement ---');
  const t4 = await sendAndInspect('football match kaun jeeta?');
  const t4Refusal = t4.body.includes("Sorry, I can't answer that") && t4.body.includes('Jumble Sale');
  const t4NoCards = t4.newCards === 0;
  console.log('T4 (Politely refused non-shopping trivia):', t4Refusal ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T4 (0 Cards Dumped):', t4NoCards ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 5: EXPLICIT SHOW COMMAND ("khaadi lawn sale dikhao") ---
  console.log('\n--- TEST 5: Explicit Show Command Execution ---');
  const t5 = await sendAndInspect('khaadi lawn sale dikhao');
  const t5CardsShown = t5.newCards > 0;
  const t5MentionsKhaadi = t5.body.includes('Khaadi');
  console.log('T5 (Deal Cards displayed on explicit command):', t5CardsShown ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T5 (Displays Khaadi lawn deals):', t5MentionsKhaadi ? 'PASSED ✅' : 'FAILED ❌');

  // Capture final full-page screenshot
  const snapPath = path.join(ARTIFACT_DIR, 'omni_domain_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('\nFinal screenshot saved to:', snapPath);

  await browser.close();

  const allPassed =
    t1NoDb && t1NoCards && t1HasDiscovery &&
    t2NoDb && t2NoCards && t2ListsCategories &&
    t3NotOffTopic && t3MentionsBata && t3NoCards &&
    t4Refusal && t4NoCards &&
    t5CardsShown && t5MentionsKhaadi;

  console.log(`\n======================================================`);
  if (allPassed) {
    console.log('🎉 ALL OMNI-DOMAIN COMPREHENSION & 7-CONDITION TESTS PASSED 100%! 🎉');
  } else {
    console.log('⚠️ SOME TESTS FAILED. PLEASE REVIEW LOGS ABOVE.');
  }
})();
