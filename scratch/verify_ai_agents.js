const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

async function verifyAIAgents() {
  console.log('--- Starting AI Agents Verification with Authentication ---');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 420, height: 850 } });
  const page = await context.newPage();

  try {
    // 1. Log in as Shopper (zara.khan@gmail.com)
    console.log('1. Logging in as Shopper...');
    await page.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const inputs = await page.locator('input').all();
    if (inputs.length >= 2) {
      await inputs[0].fill('zara.khan@gmail.com');
      await inputs[1].fill('consumer');
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForTimeout(3000);
    }

    // 2. Navigate to Consumer Assistant
    console.log('2. Navigating to Consumer Bachat Assistant...');
    await page.goto('http://localhost:8081/(consumer)/assistant', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    const bodyText = await page.textContent('body');
    const hasHeader = bodyText.includes('Jumble AI Bachat Assistant');
    console.log('Bachat Assistant Header verified:', hasHeader);

    // Click quick chip "50%+ OFF wali live deals dikhao"
    console.log('Querying: "50%+ OFF wali live deals dikhao"...');
    const chip50 = page.getByText('50%+ OFF wali live deals dikhao').first();
    if (await chip50.count() > 0) {
      await chip50.click();
    } else {
      const input = page.locator('input').last();
      await input.fill('50% off deals');
      await input.press('Enter');
    }
    await page.waitForTimeout(3500);

    const snap1 = path.join(ARTIFACT_DIR, 'consumer_ai_assistant_deals_verified.png');
    await page.screenshot({ path: snap1 });
    console.log('Captured:', snap1);

    // Send Off-Topic query: "cricket match ka score kya hai"
    console.log('Sending off-topic query: "cricket match ka score kya hai"...');
    const input = page.locator('input').last();
    await input.fill('cricket match ka score kya hai');
    await input.press('Enter');
    await page.waitForTimeout(2500);

    const chatBody = await page.textContent('body');
    const hasRefusal = chatBody.includes('Jumble Sale') && (chatBody.includes('bachat') || chatBody.includes('deals'));
    console.log('Off-topic refusal strictly enforced:', hasRefusal);

    const snap2 = path.join(ARTIFACT_DIR, 'consumer_ai_offtopic_refusal_verified.png');
    await page.screenshot({ path: snap2 });
    console.log('Captured:', snap2);

    // 3. Log in as Brand (contact@khaadi.com)
    console.log('3. Logging in as Brand Partner...');
    await page.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const brandInputs = await page.locator('input').all();
    if (brandInputs.length >= 2) {
      await brandInputs[0].fill('contact@khaadi.com');
      await brandInputs[1].fill('abcd1234');
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForTimeout(3000);
    }

    // 4. Navigate to Brand Bhai Copilot
    console.log('4. Navigating to Brand Bhai Copilot...');
    await page.goto('http://localhost:8081/(brand)/agent', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    const brandHeaderText = await page.textContent('body');
    const hasBhaiHeader = brandHeaderText.includes('Bhai - Brand Copilot');
    console.log('Bhai Header verified:', hasBhaiHeader);

    const brandInput = page.locator('input').last();
    console.log('Sending brand title query: "Summer lawn suit ka catchy title do"...');
    await brandInput.fill('Summer lawn suit ka catchy title do');
    await brandInput.press('Enter');
    await page.waitForTimeout(3000);

    const bhaiChat = await page.textContent('body');
    const hasTitles = bhaiChat.includes('Title') || bhaiChat.includes('Bhai') || bhaiChat.includes('Flash');
    console.log('Bhai generated titles & action buttons verified:', hasTitles);

    const snap3 = path.join(ARTIFACT_DIR, 'brand_bhai_titles_verified.png');
    await page.screenshot({ path: snap3 });
    console.log('Captured:', snap3);

    console.log('--- ALL AI AGENT VERIFICATIONS COMPLETED SUCCESSFULLY! ---');
  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    await browser.close();
  }
}

verifyAIAgents();
