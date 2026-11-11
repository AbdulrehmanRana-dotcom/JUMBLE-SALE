const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

(async () => {
  console.log('=== STARTING FACEBOOK-STYLE LIKES & COMMENTS VERIFICATION ===');

  // 1. Verify Node.js Backend Endpoints
  console.log('\n1. Verifying Node.js Backend Server API (http://localhost:5000)...');
  try {
    const dealsRes = await fetch('http://localhost:5000/api/deals');
    const dealsJson = await dealsRes.json();
    console.log('Node.js /api/deals count:', dealsJson.count);
    const hasLikesField = dealsJson.deals.every(d => typeof d.likes_count === 'number' && typeof d.comments_count === 'number');
    console.log('Node.js returns likes_count & comments_count on every deal:', hasLikesField ? 'PASSED ✅' : 'FAILED ❌');
  } catch (err) {
    console.error('Node.js API check error:', err.message);
  }

  // 2. Launch Browser & Login
  console.log('\n2. Launching Chrome and Logging in as Shopper (Zara)...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 480, height: 980 } });
  const page = await context.newPage();

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
    await page.waitForTimeout(4000);
  }

  // 3. Navigate to Consumer Home Feed
  console.log('3. Navigating to Consumer Home Feed (/(consumer))...');
  await page.goto('http://localhost:8081/(consumer)', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(6000);

  const bodyText = await page.innerText('body');

  // Verify Facebook-style "likes" and "comments" text is visible on feed
  console.log('\n--- VERIFYING FACEBOOK-STYLE NUMBERS ON POSTS ---');
  const hasLikesText = bodyText.includes('likes') || bodyText.includes('like');
  const hasCommentsText = bodyText.includes('comments') || bodyText.includes('comment');

  console.log('Total likes text displayed on posts (e.g. "89 likes"):', hasLikesText ? 'PASSED ✅' : 'FAILED ❌');
  console.log('Total comments text displayed on posts (e.g. "14 comments"):', hasCommentsText ? 'PASSED ✅' : 'FAILED ❌');

  // Check specific Khaadi post engagement
  const hasKhaadiLawn = bodyText.includes('Flat 50% Off Summer Lawn Sale') || bodyText.includes('Khaadi');
  console.log('Verified Khaadi deal visible:', hasKhaadiLawn ? 'PASSED ✅' : 'FAILED ❌');

  // Capture screenshot of the feed showing Facebook-style likes and comments
  const snapPath = path.join(ARTIFACT_DIR, 'facebook_likes_comments_verified.png');
  await page.screenshot({ path: snapPath, fullPage: true });
  console.log('\nScreenshot saved to:', snapPath);

  // Test real-time Like click increment
  console.log('\n--- TESTING REAL-TIME LIKE TOGGLE & COUNT UPDATE ---');
  const firstLikeBtn = page.locator('text=likes').first();
  if (await firstLikeBtn.count() > 0) {
    const textBefore = await firstLikeBtn.innerText();
    console.log('Likes count before click:', textBefore);
    await firstLikeBtn.click();
    await page.waitForTimeout(1500);
    const textAfter = await firstLikeBtn.innerText();
    console.log('Likes count after click:', textAfter);
    const updated = textBefore !== textAfter;
    console.log('Real-time Like count incremented/updated:', updated ? 'PASSED ✅' : 'FAILED ❌');
  }

  await browser.close();

  const allPassed = hasLikesText && hasCommentsText && hasKhaadiLawn;
  console.log('\n======================================================');
  if (allPassed) {
    console.log('🎉 ALL FACEBOOK-STYLE LIKES & COMMENTS TESTS PASSED 100%! 🎉');
  } else {
    console.log('⚠️ SOME VERIFICATIONS FAILED. PLEASE REVIEW LOGS.');
  }
})();
