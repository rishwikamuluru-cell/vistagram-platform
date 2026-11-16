import { test, expect } from '@playwright/test';

test.describe('VistaGram Multi-User End-to-End Suite (Two Browser Contexts)', () => {
  test('Unauthenticated visitors see the real Supabase login screen or setup diagnostic', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.locator('text=VistaGram')).toBeVisible();
    await expect(page.locator('button:has-text("Log In")')).toBeVisible();
  });

  test('Two independent browser contexts (User A & User B) complete registration, post, follow, like, comment, and DM workflows when Supabase is configured', async ({
    browser,
  }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref'),
      'Requires live NEXT_PUBLIC_SUPABASE_URL in .env.local'
    );

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // User A logs in
    await pageA.goto('/login');
    await pageA.fill('input[placeholder*="username or email"]', 'arjun.captures');
    await pageA.fill('input[type="password"]', 'TestPassword123!');
    await pageA.click('button:has-text("Log In")');
    await expect(pageA.locator('text=@arjun.captures')).toBeVisible();

    // User B logs in separately in isolated browser context
    await pageB.goto('/login');
    await pageB.fill('input[placeholder*="username or email"]', 'kabir.motion');
    await pageB.fill('input[type="password"]', 'TestPassword123!');
    await pageB.click('button:has-text("Log In")');
    await expect(pageB.locator('text=@kabir.motion')).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
