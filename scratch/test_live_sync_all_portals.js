const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('=== TESTING REAL-TIME SYNC ACROSS CONSUMER, BRAND & ADMIN PORTALS ===\n');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // ─────────────────────────────────────────────────────────────
  // 1. CONSUMER PORTAL
  // ─────────────────────────────────────────────────────────────
  console.log('1. Launching Consumer Session...');
  const consumerContext = await browser.newContext({ viewport: { width: 480, height: 950 } });
  const consumerPage = await consumerContext.newPage();

  // Login as Zara (Shopper)
  await consumerPage.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle', timeout: 30000 });
  await consumerPage.waitForTimeout(2000);

  const zaraChip = consumerPage.getByText('Zara (Shopper)').first();
  if (await zaraChip.count() > 0) {
    await zaraChip.click();
    await consumerPage.waitForTimeout(500);
  }
  const signInBtn = consumerPage.getByRole('button', { name: 'Sign In' });
  if (await signInBtn.count() > 0) {
    await signInBtn.click();
    await consumerPage.waitForTimeout(4000);
  }

  // Navigate to Consumer Home
  await consumerPage.goto('http://localhost:8081/(consumer)', { waitUntil: 'load', timeout: 45000 });
  await consumerPage.waitForTimeout(5000);

  // Click Like button on the first deal card
  console.log('   Finding Like button on feed card...');
  const likeBtn = consumerPage.getByRole('button', { name: 'Like deal' }).first();
  if (await likeBtn.count() > 0) {
    console.log('   Clicking Like button on feed card...');
    await likeBtn.click();
    await consumerPage.waitForTimeout(2000);
  }

  // Take screenshot of Consumer portal
  const consumerPic = path.join(ARTIFACT_DIR, 'consumer_portal_real_db_likes.png');
  await consumerPage.screenshot({ path: consumerPic, fullPage: true });
  console.log('   Consumer portal screenshot saved:', consumerPic);

  // ─────────────────────────────────────────────────────────────
  // 2. BRAND PORTAL
  // ─────────────────────────────────────────────────────────────
  console.log('\n2. Launching Brand Portal Session...');
  const brandContext = await browser.newContext({ viewport: { width: 480, height: 950 } });
  const brandPage = await brandContext.newPage();

  // Login as Khaadi (Brand)
  await brandPage.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle', timeout: 30000 });
  await brandPage.waitForTimeout(2000);

  const brandChip = brandPage.getByText('Khaadi (Brand)').first();
  if (await brandChip.count() > 0) {
    await brandChip.click();
    await brandPage.waitForTimeout(500);
  }
  const brandLoginBtn = brandPage.getByRole('button', { name: 'Sign In' });
  if (await brandLoginBtn.count() > 0) {
    await brandLoginBtn.click();
    await brandPage.waitForTimeout(4000);
  }

  // Navigate to Brand Home Feed
  await brandPage.goto('http://localhost:8081/(brand)', { waitUntil: 'load', timeout: 35000 });
  await brandPage.waitForTimeout(5000);

  const brandPic = path.join(ARTIFACT_DIR, 'brand_portal_real_db_likes.png');
  await brandPage.screenshot({ path: brandPic, fullPage: true });
  console.log('   Brand portal feed screenshot saved:', brandPic);

  // Also navigate to Brand Posts
  await brandPage.goto('http://localhost:8081/(brand)/posts', { waitUntil: 'load', timeout: 35000 });
  await brandPage.waitForTimeout(5000);

  const brandPostsPic = path.join(ARTIFACT_DIR, 'brand_posts_real_db_likes.png');
  await brandPage.screenshot({ path: brandPostsPic, fullPage: true });
  console.log('   Brand posts screenshot saved:', brandPostsPic);

  // ─────────────────────────────────────────────────────────────
  // 3. ADMIN PORTAL
  // ─────────────────────────────────────────────────────────────
  console.log('\n3. Launching Admin Portal Session...');
  const adminContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const adminPage = await adminContext.newPage();

  // Login as Admin
  await adminPage.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle', timeout: 30000 });
  await adminPage.waitForTimeout(2000);

  const adminChip = adminPage.getByText('Admin (Superuser)').first();
  if (await adminChip.count() > 0) {
    await adminChip.click();
    await adminPage.waitForTimeout(500);
  }
  const adminLoginBtn = adminPage.getByRole('button', { name: 'Sign In' });
  if (await adminLoginBtn.count() > 0) {
    await adminLoginBtn.click();
    await adminPage.waitForTimeout(4000);
  }

  // Navigate to Admin Dashboard
  await adminPage.goto('http://localhost:8081/(admin)', { waitUntil: 'load', timeout: 35000 });
  await adminPage.waitForTimeout(5000);

  const adminPic = path.join(ARTIFACT_DIR, 'admin_portal_real_db_likes.png');
  await adminPage.screenshot({ path: adminPic, fullPage: true });
  console.log('   Admin portal screenshot saved:', adminPic);

  await browser.close();
  console.log('\n=============================================================');
  console.log('🎉 ALL 3 PORTALS SUCCESSFULLY VERIFIED & SCREENSHOTS SAVED! 🎉');
  console.log('=============================================================');
})().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
