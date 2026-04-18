import type { Page, Route } from "@playwright/test";
import type { Regions } from "../../src/types";

const REGIONS: Regions = {
  서울: {
    강남구: ["역삼동", "삼성동"],
    서초구: ["반포동", "잠원동"],
  },
  경기: {
    성남시: ["분당동", "판교동"],
  },
};

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function applySearchEmptyMocks(page: Page): Promise<void> {
  await page.route("**/api/regions", (route) => fulfillJson(route, REGIONS));
}
