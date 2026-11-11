const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('--- STARTING SALESMAN TRAINING VERIFICATION SUITE ---');
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

  async function sendAndGetBody(query) {
    console.log(`\nTesting Query: "${query}"`);
    await input.fill(query);
    await input.press('Enter');
    await page.waitForTimeout(3500);
    return await page.innerText('body');
  }

  // TEST 1: "hey"
  let body = await sendAndGetBody('hey');
  const passHey = body.includes('Hello Janab! Main aap ki kya madad kar sakta hoon?') || body.includes('Main aap ki kya madad kar sakta hoon');
  console.log('TEST 1 ("hey"):', passHey ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 2: "aslamu a alaikum"
  body = await sendAndGetBody('aslamu a alaikum');
  const passSalam = body.includes('Walaikum Assalam Janab! Main aap ki kya madad kar sakta hoon?');
  console.log('TEST 2 ("aslamu a alaikum"):', passSalam ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 3: "who won the cricket match?" (Strict Out of Syllabus)
  body = await sendAndGetBody('who won the cricket match?');
  const passOutOfSyllabus = body.includes("Sorry, I can't answer that.");
  console.log('TEST 3 ("cricket match" refusal):', passOutOfSyllabus ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 4: "orr dinners ki ha?" (The exact screenshot issue)
  body = await sendAndGetBody('orr dinners ki ha?');
  const hasCheezious = body.includes('Cheezious') || body.includes('Crown Crust Pizza') || body.includes('Bhook lagi hai Janab');
  console.log('TEST 4 ("orr dinners ki ha?"):', hasCheezious ? 'PASSED ✅' : 'FAILED ❌');

  // TEST 5: "khaadi ki deals btana"
  body = await sendAndGetBody('khaadi ki deals btana');
  const hasKhaadi = body.includes('Khaadi') && (body.includes('Summer Lawn Sale') || body.includes('Ready-to-Wear Kurtis'));
  console.log('TEST 5 ("khaadi ki deals btana"):', hasKhaadi ? 'PASSED ✅' : 'FAILED ❌');

  // Capture comprehensive screenshot
  const finalScreenshot = path.join(ARTIFACT_DIR, 'salesman_trained_full_suite_verified.png');
  await page.screenshot({ path: finalScreenshot, fullPage: true });
  console.log('\nFinal Screenshot saved to:', finalScreenshot);

  await browser.close();
  console.log('--- ALL TESTS COMPLETED ---');
})();
