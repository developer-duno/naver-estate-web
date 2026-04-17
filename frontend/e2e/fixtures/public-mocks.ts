import type { Page } from "@playwright/test";
import type { DbStats } from "../../src/types/analytics";

export const mockStats: DbStats = {
  complex_count: 1234,
  article_count: 90_000,
};

export async function applyPublicMocks(page: Page): Promise<void> {
  await page.route("**/api/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStats),
    });
  });
}
