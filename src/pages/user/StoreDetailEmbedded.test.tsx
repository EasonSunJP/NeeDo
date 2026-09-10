// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UnifiedFormalStoreDetail } from "./StoreDetailPage";
import { coreReadApi, type CoreShopDetail } from "../../features/core-read/api";
import { persistentResourceCache } from "../../lib/persistentResourceCache";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: null }) }));
const locale = vi.hoisted(() => ({ language: "zh" }));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => locale, useOptionalI18n: () => locale }));
vi.mock("../../state/entityStore", () => ({ useEntityStore: () => ({ customers: [], technicians: [] }) }));
vi.mock("../../features/social/context", () => ({ useSocial: () => ({ getActorForScope: () => null, getProfilePosts: () => [] }) }));
vi.mock("../../features/pricing-mode/api", () => ({ pricingModeApi: { getBookingNavigation: () => Promise.resolve(null) } }));

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  await persistentResourceCache.clearScope("public");
  locale.language = "zh";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function render() {
  await act(async () => root.render(<MemoryRouter><UnifiedFormalStoreDetail shopId={21} scope="user" embedded /></MemoryRouter>));
}
async function waitForText(text: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
  }
  expect(container.textContent).toContain(text);
}
it("keeps unavailable shop loading and retry inside the drawer", async () => {
  const request = vi.spyOn(coreReadApi, "getShopDetail").mockRejectedValue(new Error("shop unavailable"));
  await render();
  expect(container.textContent).toContain("shop unavailable");
  expect(container.querySelector("nav")).toBeNull();
  const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "重新加载");
  expect(retry).toBeDefined();
  await act(async () => retry!.click());
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenLastCalledWith(21, { locale: "zh-CN" });
});
it("renders and switches all six public presentation tabs without a page shell", async () => {
  const shop = {
    id: 21, publicId: "S0000000021", name: "正式店铺资料", city: "東京都", address: "渋谷区",
    coverUrl: null, description: "店铺介绍", phone: null, latitude: null, longitude: null,
    reviewSummary: { ratingAverage: "0", reviewCount: 0, latestReviewAt: null, highlights: [] },
    completedOrderCount: 0, favoriteCount: 0, shareCount: 0, serviceCategories: [], businessKeywords: [], mediaAssets: [], services: [], technicians: [],
    createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z"
  } satisfies CoreShopDetail;
  vi.spyOn(coreReadApi, "getShopDetail").mockResolvedValue(shop);
  await render();
  await waitForText("正式店铺资料");
  expect(container.textContent).toContain("正式店铺资料");
  for (const label of ["首页", "环境", "菜单", "动态", "情报", "地图"]) {
    let button: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      button = Array.from(container.querySelectorAll("button")).find((node) => node.textContent === label);
      expect(button, label).toBeDefined();
    });
    await act(async () => button!.click());
  }
  expect(container.querySelector("nav")).toBeNull();
});

it("localizes the embedded loading state", async () => {
  locale.language = "ja";
  vi.spyOn(coreReadApi, "getShopDetail").mockReturnValue(new Promise(() => {}));
  await render();
  expect(container.querySelector('[role="status"]')?.textContent).toBe("実店舗情報を読み込み中");
  expect(container.querySelector("nav")).toBeNull();
});
