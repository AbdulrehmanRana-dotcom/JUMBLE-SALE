const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

async function testTabNavigation() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));

  console.log('1. Going to /profile');
  await page.goto('http://localhost:8081/profile');
  await page.waitForTimeout(2000);

  const inputs = await page.locator('input').all();
  if (inputs.length >= 2) {
    await inputs[0].fill('contact@khaadi.com');
    await inputs[1].fill('abcd1234');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(2500);
    await page.goto('http://localhost:8081/profile');
    await page.waitForTimeout(2000);
  }

  console.log('2. Clicking Recent Deals...');
  const recentDealsBtn = page.getByText('Recent Deals').first();
  if (await recentDealsBtn.count() > 0) {
    await recentDealsBtn.click();
    await page.waitForTimeout(1000);
  }
  console.log('Recent Deals visible:', (await page.getByText('Recent Deals').count()) > 0);

  console.log('3. Clicking Home bottom tab...');
  const homeTab = page.locator('a[href="/"], [role="tab"]:has-text("Home"), a:has-text("Home")').first();
  await homeTab.click();
  await page.waitForTimeout(1500);
  console.log('On Home page now? Search visible:', (await page.locator('input[placeholder*="Search"]').count()) > 0);

  console.log('4. Clicking Profile bottom tab again...');
  const profileTab = page.locator('a[href="/profile"], [role="tab"]:has-text("Profile"), a:has-text("Profile")').last();
  await profileTab.click();
  await page.waitForTimeout(1500);

  const verifiedMerchantCount = await page.getByText('Verified Merchant').count();
  const recentDealsCount = await page.getByText('Recent Deals').count();
  console.log('Verified Merchant count (main menu):', verifiedMerchantCount);
  console.log('Recent Deals count:', recentDealsCount);

  await browser.close();
}

testTabNavigation().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
