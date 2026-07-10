import { test, expect } from "@playwright/test";

test.describe("Duelo Authentication Flow (Walking Skeleton)", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to landing page before each test
    await page.goto("/");
  });

  test("landing page renders branded logo and links", async ({ page }) => {
    // Assert branded logo is present
    const logo = page.locator("h1", { hasText: "DUELO" });
    await expect(logo).toBeVisible();

    // Assert main CTAs are visible
    const registerCta = page.locator("#cta-register");
    const loginCta = page.locator("#cta-login");
    await expect(registerCta).toHaveText("Criar conta");
    await expect(loginCta).toHaveText("Entrar");
  });

  test("register page disables submit button unless 18+ is confirmed", async ({ page }) => {
    await page.goto("/register");

    const submitBtn = page.locator("#register-submit");
    const checkbox = page.locator("#age-confirmed-checkbox");

    // Submit button should be disabled by default (client-side enforcement)
    await expect(submitBtn).toBeDisabled();

    // Checking the checkbox enables the button
    await checkbox.click();
    await expect(submitBtn).toBeEnabled();

    // Unchecking it disables it again
    await checkbox.click();
    await expect(submitBtn).toBeDisabled();
  });

  test("login page renders all fields and reset link", async ({ page }) => {
    await page.goto("/login");

    const phoneInput = page.locator("#phone");
    const passwordInput = page.locator("#password");
    const submitBtn = page.locator("#login-submit");
    const resetLink = page.locator("a", { hasText: "Esqueci a password" });

    await expect(phoneInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toHaveText("Entrar");
    await expect(resetLink).toBeVisible();
  });
});
