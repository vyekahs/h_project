
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should allow user to login', async ({ page }) => {
    await page.goto('/login');
    
    // Fill login form
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="password"]', 'password');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Expect redirect to home
    await expect(page).toHaveURL('/');
    
    // Expect user name to be visible
    await expect(page.locator('.welcome-msg')).toContainText('Test User');
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[name="name"]', 'Unknown User');
    await page.fill('input[name="password"]', 'wrong');
    
    await page.click('button[type="submit"]');
    
    // Expect error message
    await expect(page.locator('text=존재하지 않는 사용자입니다')).toBeVisible();
  });
});
