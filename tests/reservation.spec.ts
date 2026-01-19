
import { test, expect } from '@playwright/test';

test.describe('Reservations', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
  });

  test('should allow user to make a reservation', async ({ page }) => {
    await page.goto('/');
    
    // Find a game to reserve (assuming there's a game list)
    // This depends on the UI. Let's assume there's a button "예약하기" or similar.
    // Or maybe we need to go to a specific game page.
    
    // Check if scheduled game section is visible
    await expect(page.locator('h2:has-text("시작 예정 게임")')).toBeVisible();
    
    // Find the test game
    const gameCard = page.locator('.table-card', { hasText: 'Test Game' });
    await expect(gameCard).toBeVisible();
    
    // Click join button
    await gameCard.locator('.btn-join').click();
    
    // Expect success message or button change
    // Since we are not mocking the form submission response easily in E2E without intercepting,
    // we can check if the button text changes to "참여 취소" or similar, OR if we get an alert.
    // However, the current implementation uses `enhance` and might reload or just update UI.
    // Let's assume it reloads or updates.
    
    // Wait for update
    // await expect(gameCard.locator('button:has-text("참여 취소")')).toBeVisible();
    // Note: The UI for scheduled game join might be different. 
    // In `+page.svelte`: `{(game.participants || []).length >= game.max_players ? '대기열 합류' : '참여하기'}`
    // After joining, the user sees "참여 예정 게임" card in "나의 예약 현황".
    
    await expect(page.locator('.status-card.scheduled')).toBeVisible();
    await expect(page.locator('.status-card.scheduled .value')).toHaveText('Test Game');
  });
});
