
import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  // Assuming admin login or bypass
  // Since there is no explicit admin login in the code (it seems to be IP based or just open for now/dev),
  // we will assume we can access /admin
  
  test('should access admin dashboard', async ({ page }) => {
    // Login as admin
    await page.goto('/admin/login');
    // 로컬 .env의 ADMIN_PASSWORD와 동일해야 함 (admin/login이 더 이상 기본값으로 폴백하지 않음)
    await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD ?? '');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/admin');
    // Check for specific admin sections
    await expect(page.locator('text=공지사항 관리')).toBeVisible();
  });

  test('should see stats', async ({ page }) => {
    // Login as admin
    await page.goto('/admin/login');
    // 로컬 .env의 ADMIN_PASSWORD와 동일해야 함 (admin/login이 더 이상 기본값으로 폴백하지 않음)
    await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD ?? '');
    await page.click('button[type="submit"]');
    
    await page.goto('/admin/stats');
    // Check for stats headers
    await expect(page.locator('h1:has-text("통계")')).toBeVisible();
  });
});
