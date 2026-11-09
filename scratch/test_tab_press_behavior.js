const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

async function testTabPress() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));

  console.log('1. Going to /profile');
  await page.goto('http://localhost:8081/profile');
  await page.waitForTimeout(2000);

  // If login page is shown, bypass/login
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

  const isRecentDealsVisible = await page.getByText('Recent Deals').count();
  console.log('Recent Deals visible:', isRecentDealsVisible > 0);

  console.log('3. Clicking Profile bottom tab button...');
  // Find the profile tab in the bottom bar
  const profileTab = page.locator('a[href="/profile"], [role="tab"]:has-text("Profile"), a:has-text("Profile")').last();
  console.log('Profile tab count:', await profileTab.count());
  await profileTab.click();
  await page.waitForTimeout(1500);

  // Check if main menu is back or if Recent Deals is still open
  const verifiedMerchantCount = await page.getByText('Verified Merchant').count();
  console.log('Verified Merchant count (main menu):', verifiedMerchantCount);

  await page.screenshot({ path: 'scratch/tab_test_result.png' });
  await browser.close();
}

testTabPress().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
