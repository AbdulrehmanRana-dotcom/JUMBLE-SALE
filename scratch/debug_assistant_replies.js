const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 480, height: 980 } });
  const page = await context.newPage();

  await page.goto('http://localhost:8081/(consumer)/assistant', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(4000);

  const input = page.locator('input').last();
  await input.waitFor({ timeout: 20000 });

  const queries = [
    'madad kro meri shopping krnay mai',
    'tumharay brand mai kis trah ki products han?',
    'football shoes mil jaye gai?',
    'football match kaun jeeta?',
    'khaadi lawn sale dikhao'
  ];

  for (const q of queries) {
    console.log(`\n\n=== SENDING: "${q}" ===`);
    await input.fill(q);
    await input.press('Enter');
    await page.waitForTimeout(4000);

    const msgs = await page.locator('[role="text"], div[dir="auto"]').allInnerTexts();
    // Print the last few messages
    const recent = msgs.slice(-10).filter(m => m.trim().length > 0);
    console.log('Recent messages:', JSON.stringify(recent, null, 2));
    const claimBtns = await page.locator('text=Claim Deal').count();
    console.log('Claim Deal buttons count:', claimBtns);
  }

  await browser.close();
})();
