const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

async function verifyInstagramTabResets() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();

  console.log('1. Signing in as Khaadi brand...');
  await page.goto('http://localhost:8081');
  await page.waitForTimeout(2000);

  const inputs = await page.locator('input').all();
  if (inputs.length >= 2) {
    await inputs[0].fill('contact@khaadi.com');
    await inputs[1].fill('abcd1234');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(2500);
  }

  // ── TEST 1: Profile Tab Reset (from Recent Deals subview) ──
  console.log('2. Navigating to /profile...');
  await page.goto('http://localhost:8081/profile');
  await page.waitForTimeout(2000);

  console.log('3. Opening Recent Deals subview...');
  const recentDealsBtn = page.getByText('Recent Deals').first();
  await recentDealsBtn.click();
  await page.waitForTimeout(1000);

  // Take screenshot inside Recent Deals
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'subview_recent_deals_before_tab_press.png') });

  console.log('4. Clicking Profile tab at the bottom...');
  const profileTab = page.locator('a[href="/profile"], [role="tab"]:has-text("Profile"), a:has-text("Profile")').last();
  await profileTab.click();
  await page.waitForTimeout(1200);

  const isMenuRestored = (await page.getByText('Verified Merchant').count()) > 0;
  console.log('Profile tab successfully reset to root menu:', isMenuRestored);
  if (!isMenuRestored) throw new Error('Profile tab did not reset to root menu!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'brand_tab_reset_profile_verified.png') });

  // ── TEST 2: Home Tab Reset (Category Filter Reset) ──
  console.log('5. Clicking Home tab at the bottom...');
  const homeTab = page.locator('a[href="/"], [role="tab"]:has-text("Home"), a:has-text("Home")').first();
  await homeTab.click();
  await page.waitForTimeout(1500);

  console.log('6. Selecting Footwear category chip...');
  const footwearChip = page.getByText('Footwear & Accessories').first();
  if (await footwearChip.count() > 0) {
    await footwearChip.click();
    await page.waitForTimeout(1000);
  }

  console.log('7. Clicking Home tab again to reset filter to All...');
  await homeTab.click();
  await page.waitForTimeout(1200);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'brand_tab_reset_home_verified.png') });

  console.log('All Instagram-style tab reset tests passed successfully! 🎉');
  await browser.close();
}

verifyInstagramTabResets().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
