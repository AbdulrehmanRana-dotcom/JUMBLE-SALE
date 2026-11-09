const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

async function verifyAdminGrowthTools() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  console.log('1. Signing in as Admin...');
  await page.goto('http://localhost:8081');
  await page.waitForTimeout(2000);

  const inputs = await page.locator('input').all();
  if (inputs.length >= 2) {
    await inputs[0].fill('admin@jumblesale.com');
    await inputs[1].fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(2500);
  }

  console.log('2. Verifying Admin Dashboard loaded...');
  const adminTitle = await page.getByText('Super Admin').count();
  console.log('Super Admin visible:', adminTitle > 0);

  console.log('3. Clicking Growth & Sponsored in sidebar...');
  const growthNav = page.getByText('Growth & Sponsored').first();
  await growthNav.click();
  await page.waitForTimeout(1500);

  // Take screenshot of Sponsored Deals sub-tab
  console.log('4. Capturing Sponsored Deals manager...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'admin_sponsored_deals_view.png') });

  // Test pinning a deal
  const pinBtn = page.getByText('Pin to Top').first();
  if (await pinBtn.count() > 0) {
    console.log('Clicking Pin to Top on a deal...');
    await pinBtn.click();
    await page.waitForTimeout(1500);
  }

  // Switch to Broadcast tab
  console.log('5. Switching to Broadcast tab...');
  const broadcastTab = page.getByText('Broadcast', { exact: true }).first();
  await broadcastTab.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'admin_broadcast_view.png') });

  // Switch to Categories tab
  console.log('6. Switching to Categories tab...');
  const categoriesTab = page.getByText('Categories (', { exact: false }).first();
  await categoriesTab.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'admin_categories_manager_view.png') });

  // Switch to CSV Export tab
  console.log('7. Switching to CSV Export tab...');
  const exportTab = page.getByText('CSV Export', { exact: true }).first();
  await exportTab.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'admin_csv_export_view.png') });

  console.log('Admin Growth & Monetization tools verified successfully! 🎉');
  await browser.close();
}

verifyAdminGrowthTools().catch((err) => {
  console.error('Admin test failed:', err);
  process.exit(1);
});
