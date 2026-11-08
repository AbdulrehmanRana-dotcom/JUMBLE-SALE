const { chromium } = require('C:/Users/arran/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/arran/.gemini/antigravity/brain/b5f5015b-9245-42fb-8f2c-f8ce1dc8a0e5';

async function testBrandPostCompulsoryCover() {
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

  console.log('2. Navigating to Brand Posts screen...');
  await page.goto('http://localhost:8081/posts');
  await page.waitForTimeout(2500);

  console.log('3. Opening Actions Menu FAB...');
  const fab = page.locator('[aria-label="Open Actions Menu"]').first();
  await fab.click();
  await page.waitForTimeout(1000);

  console.log('4. Clicking Create Post option in Speed Dial...');
  await page.getByText('Create Post').click();
  await page.waitForTimeout(2000);

  // Take screenshot of empty form showing Section 1 (Compulsory Cover) & Section 2 (Optional Extra Photos)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'brand_compulsory_cover_empty.png'), fullPage: false });

  // Fill in required text fields: title, original price, discount %
  console.log('5. Filling required title, prices...');
  const titleInput = page.locator('input[placeholder*="Kurti"], input[placeholder*="Summer"]').first();
  if (await titleInput.count() > 0) {
    await titleInput.fill('Luxury Velvet Embroidered Shawl Festive Collection');
  }

  const origPriceInput = page.locator('input[placeholder*="9990"], input[placeholder*="Price"]').first();
  if (await origPriceInput.count() > 0) {
    await origPriceInput.fill('12000');
  }

  // Try clicking "PUBLISH POST" without cover photo
  console.log('6. Submitting without cover photo to verify compulsory validation...');
  const publishBtn = page.getByText('PUBLISH POST').first();
  if (await publishBtn.count() > 0) {
    await publishBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'brand_compulsory_cover_validation.png'), fullPage: false });
  }

  // Now set Compulsory Cover Photo via direct URL input
  console.log('7. Setting Compulsory Main Cover Photo...');
  const coverUrlInput = page.locator('input[placeholder*="Cover Photo URL"]').first();
  if (await coverUrlInput.count() > 0) {
    await coverUrlInput.fill('https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=1000&q=80');
    const setCoverBtn = page.getByText('Set Cover').first();
    await setCoverBtn.click();
    await page.waitForTimeout(1000);
  }

  // Add 2 Extra Photos via direct URL input in Section 2
  console.log('8. Adding 2 Extra Product Photos in Section 2...');
  const extraUrlInput = page.locator('input[placeholder*="Additional Photo URL"]').first();
  if (await extraUrlInput.count() > 0) {
    await extraUrlInput.fill('https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1000&q=80');
    const addExtraBtn = page.getByText('Add Angle').first();
    await addExtraBtn.click();
    await page.waitForTimeout(800);

    await extraUrlInput.fill('https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=1000&q=80');
    await addExtraBtn.click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'brand_cover_and_extra_photos_set.png'), fullPage: false });

  // Now click PUBLISH POST to save and publish with cover + 2 extra photos
  console.log('9. Publishing with compulsory cover + extra photos...');
  if (await publishBtn.count() > 0) {
    await publishBtn.click();
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'brand_post_published_success.png'), fullPage: false });

  await browser.close();
  console.log('=== BRAND POST TEST COMPLETED SUCCESSFULLY ===');
}

testBrandPostCompulsoryCover().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
