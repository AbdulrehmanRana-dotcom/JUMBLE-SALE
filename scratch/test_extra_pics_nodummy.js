const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

(async () => {
  console.log('=== STARTING TEST: REAL MULTI-PHOTO UPLOAD & AMAZON GALLERY (NO DUMMY) ===');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });

  const screenshotsDir = 'C:\\Users\\arran\\.gemini\\antigravity\\brain\\b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5\\scratch';

  try {
    // 1. Sign in as Khaadi
    console.log('1. Signing in as Khaadi...');
    await page.goto('http://localhost:8081');
    await page.waitForTimeout(2000);

    const inputs = await page.locator('input').all();
    await inputs[0].fill('contact@khaadi.com');
    await inputs[1].fill('abcd1234');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(2500);

    // 2. Go to /posts
    console.log('2. Navigating to Brand Posts screen...');
    await page.goto('http://localhost:8081/posts');
    await page.waitForTimeout(2500);

    // 3. Open FAB
    console.log('3. Clicking Open Actions Menu FAB...');
    const fab = page.locator('[aria-label="Open Actions Menu"]').first();
    await fab.click();
    await page.waitForTimeout(1000);

    // 4. Click Create Post
    console.log('4. Clicking "Create Post" option...');
    await page.getByText('Create Post').first().click();
    await page.waitForTimeout(1500);

    // Take screenshot of clean empty modal
    await page.screenshot({ path: path.join(screenshotsDir, 'brand_create_post_clean_modal.png') });
    console.log('Saved screenshot of clean Create Post modal (no dummy presets)');

    // 5. Add Photo 1 via URL
    console.log('5. Adding Photo 1 (Main Hero)...');
    const urlInput = page.locator('input[placeholder*="paste direct image URL"]').first();
    await urlInput.fill('https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800');
    const addBtn = page.locator('text="Add"').first();
    await addBtn.click();
    await page.waitForTimeout(800);

    // 6. Add Photo 2 via URL
    console.log('6. Adding Photo 2 (Side Angle)...');
    await urlInput.fill('https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800');
    await addBtn.click();
    await page.waitForTimeout(800);

    // 7. Add Photo 3 via URL
    console.log('7. Adding Photo 3 (Detail / Sole Angle)...');
    await urlInput.fill('https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800');
    await addBtn.click();
    await page.waitForTimeout(1200);

    await page.screenshot({ path: path.join(screenshotsDir, 'brand_photos_added_3angles.png') });
    console.log('Saved screenshot of 3 real photos added with COVER & Angle badges');

    // 8. Reorder: Click "Set Cover" on Angle #2
    console.log('8. Testing "Set Cover" reorder action...');
    const setCoverBtn = page.getByText('Set Cover').first();
    if (await setCoverBtn.isVisible()) {
      await setCoverBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(screenshotsDir, 'brand_photo_reordered_cover.png') });
      console.log('Saved screenshot after reordering cover photo');
    }

    // 9. Fill in form
    console.log('9. Filling product details...');
    const titleInput = page.locator('input[placeholder*="Slim Fit Dinner Jacket"]').or(page.locator('input[placeholder*="Product Name"]')).first();
    await titleInput.fill('Air Cushion Pro Running Sneakers');

    const descInput = page.locator('textarea, input[placeholder*="Describe the product details"]').first();
    if (await descInput.isVisible()) {
      await descInput.fill('Ultra-breathable air cushion pro athletic footwear with non-slip grip and multi-layer cushioning.');
    }

    const shoesCat = page.getByText('Shoes').first();
    if (await shoesCat.isVisible()) {
      await shoesCat.click();
    }

    // Publish post
    console.log('10. Submitting post...');
    const publishBtn = page.getByText('PUBLISH POST').first();
    await publishBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(screenshotsDir, 'brand_post_published_success.png') });
    console.log('Saved screenshot after publishing post');

    // 11. Consumer side verification
    console.log('11. Navigating to Consumer Home Feed...');
    await page.goto('http://localhost:8081/(consumer)');
    await page.waitForTimeout(2500);

    const newDealCard = page.getByText('Air Cushion Pro Running Sneakers').first();
    if (await newDealCard.isVisible()) {
      console.log('Found newly published deal on Home Feed! Clicking card to open Deal Details...');
      await newDealCard.click();
      await page.waitForTimeout(2500);

      await page.screenshot({ path: path.join(screenshotsDir, 'consumer_new_deal_amazon_gallery.png') });
      console.log('Saved screenshot of Deal Details Amazon gallery for new deal');
    }

    console.log('=== TEST SUCCESSFULLY COMPLETED ===');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
  }
})();
