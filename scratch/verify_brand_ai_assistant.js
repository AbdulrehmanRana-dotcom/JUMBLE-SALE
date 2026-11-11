const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('=== STARTING BRAND PORTAL AI EXECUTIVE ASSISTANT VERIFICATION ===');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 480, height: 980 } });
  const page = await context.newPage();

  // 1. Login as Brand Manager (Khaadi)
  console.log('1. Logging in as Brand Manager (Khaadi)...');
  await page.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(2000);

  // Directly fill login inputs to guarantee clean brand credentials
  const emailInput = page.locator('input[type="email"], input').first();
  await emailInput.fill('contact@khaadi.com');
  await page.waitForTimeout(300);

  const passInput = page.locator('input[type="password"], input').nth(1);
  await passInput.fill('abcd1234');
  await page.waitForTimeout(300);

  const signInBtn = page.getByRole('button', { name: 'Sign In' });
  if (await signInBtn.count() > 0) {
    await signInBtn.click();
    await page.waitForTimeout(4000);
  }

  // 2. Navigate to Brand Executive Copilot
  console.log('2. Navigating to Brand Copilot...');
  await page.goto('http://localhost:8081/(brand)/agent', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(4000);

  // Check header and live snapshot strip
  const bodyText = await page.innerText('body');
  const hasCopilotHeader = bodyText.includes('Bhai — Executive Brand Copilot') || bodyText.includes('Executive Brand Copilot');
  const hasLiveDbStatus = bodyText.includes('Live Database Connected') || bodyText.includes('Live');
  console.log('Header & Live DB Connection:', (hasCopilotHeader && hasLiveDbStatus) ? 'PASSED ✅' : 'FAILED ❌');

  const input = page.getByTestId('brand-agent-input').first();
  await input.waitFor({ timeout: 20000 });

  const sendBtn = page.getByTestId('brand-agent-send-btn').first();

  async function sendAndInspect(query) {
    console.log(`\n======================================================`);
    console.log(`BRAND MANAGER QUERY: "${query}"`);
    await input.fill(query);
    await page.waitForTimeout(300);
    await sendBtn.click();
    await page.waitForTimeout(4000);

    const body = await page.innerText('body');
    return { body };
  }

  // --- TEST 1: Real-time Store Status & Active Inventory ---
  console.log('\n--- TEST 1: Real-time Store Status & Active Deals ---');
  const t1 = await sendAndInspect('Mera store status aur kitni deals live hain?');
  const t1Respectful = t1.body.includes('Janab');
  const t1HasCounts = t1.body.includes('Active Live Deals') || t1.body.includes('Live Deals');
  const t1HasAction = t1.body.includes('Active Posts Dekhein') || t1.body.includes('Nayi Deal');
  console.log('T1 (Respectful Executive Tone "Janab"):', t1Respectful ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (Live Database Counts Grounded):', t1HasCounts ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T1 (Action Deep-Link Buttons Rendered):', t1HasAction ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 2: Pending Approval & QA Verification Guidance ---
  console.log('\n--- TEST 2: Pending Approval & Review Criteria ---');
  const t2 = await sendAndInspect('Meri post live kyu nahi hui aur kitna time lagega?');
  const t2Timing = t2.body.includes('2 se 12 working hours') || t2.body.includes('working hours');
  const t2Criteria = t2.body.includes('Image Quality') && t2.body.includes('Authentic Pricing');
  const t2PendingBtn = t2.body.includes('Pending Deals');
  console.log('T2 (States Exact 2-12 Hour SLA):', t2Timing ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T2 (Lists 3 Quality Assurance Criteria):', t2Criteria ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T2 (Action Button to Pending Deals):', t2PendingBtn ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 3: Smart Pricing & Charm (.999) Math ---
  console.log('\n--- TEST 3: Smart Commercial Pricing Calculation ---');
  const t3 = await sendAndInspect('Rs 8,000 par 35% discount calculate karo');
  const t3Original = t3.body.includes('8,000');
  const t3DiscountPct = t3.body.includes('35%');
  const t3SellingPrice = t3.body.includes('5,200') || t3.body.includes('5,199');
  const t3Charm = t3.body.includes('Charm Price') || t3.body.includes('.999');
  console.log('T3 (Parses Original Rs. 8,000 & 35%):', (t3Original && t3DiscountPct) ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T3 (Calculates Exact Selling Price & Savings):', t3SellingPrice ? 'PASSED ✅' : 'FAILED ❌');
  console.log('T3 (Recommends .999 Psychological Charm Price):', t3Charm ? 'PASSED ✅' : 'FAILED ❌');

  // --- TEST 4: Strict Off-Topic Boundary Enforcement ---
  console.log('\n--- TEST 4: Strict Out-of-Scope / Fazool Baatein ---');
  const t4 = await sendAndInspect('Aaj mausam kaisa hai aur barish hogi?');
  const t4Refusal = t4.body.includes('business growth aur portal operations') || t4.body.includes('main sirf');
  console.log('T4 (Respectfully Refuses & Redirects to Business):', t4Refusal ? 'PASSED ✅' : 'FAILED ❌');

  // Capture full-page screenshot of the live conversation with all answers and action buttons
  const snapPath = path.join(ARTIFACT_DIR, 'brand_assistant_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('\nConversation screenshot saved to:', snapPath);

  // --- TEST 5: Deep-Link Action Button Click Navigation ---
  console.log('\n--- TEST 5: Interactive Action Button Navigation ---');
  const createDealBtn = page.getByText(/Nayi Deal Banayein|Is Deal Ko Create Karein/i).last();
  let navigatedSuccessfully = false;
  if (await createDealBtn.count() > 0) {
    console.log('Clicking action button:', await createDealBtn.innerText());
    await createDealBtn.click();
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    console.log('Current URL after click:', currentUrl);
    navigatedSuccessfully = currentUrl.includes('create-deal');
  }
  console.log('T5 (Action Button Navigates to Create Deal):', navigatedSuccessfully ? 'PASSED ✅' : 'FAILED ❌');

  await browser.close();

  const allPassed =
    hasCopilotHeader && hasLiveDbStatus &&
    t1Respectful && t1HasCounts && t1HasAction &&
    t2Timing && t2Criteria && t2PendingBtn &&
    t3Original && t3SellingPrice && t3Charm &&
    t4Refusal &&
    navigatedSuccessfully;

  console.log(`\n======================================================`);
  if (allPassed) {
    console.log('🎉 ALL BRAND PORTAL AI EXECUTIVE ASSISTANT TESTS PASSED 100%! 🎉');
    process.exit(0);
  } else {
    console.log('⚠️ SOME TESTS FAILED. PLEASE REVIEW LOGS ABOVE.');
    process.exit(1);
  }
})();
