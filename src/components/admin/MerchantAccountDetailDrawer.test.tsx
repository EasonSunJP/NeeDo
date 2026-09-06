// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MerchantGroupCard, ShopCard } from "../../features/merchant-saas-billing/model";
import { MerchantAccountDetailDrawer } from "./MerchantAccountDetailDrawer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }), useOptionalI18n: () => ({ language: "zh" }) }));
vi.mock("../../pages/user/StoreDetailPage", () => ({
  UnifiedFormalStoreDetail: ({ shopId, embedded }: { shopId: number; embedded: boolean }) => <div data-shop-id={shopId} data-embedded={embedded}>展示 {shopId}</div>
}));
const shop: ShopCard = {
  id: 21, type: "single_shop", name: "测试店铺", city: "東京都", address: "渋谷", phone: null,
  status: "published", ownerEmail: null, coverUrl: null, ratingAverage: 0, reviewCount: 0,
  technicianCount: 1, suspension: null, createdAt: "2026-09-07T00:00:00Z",
  billing: { subjectType: "shop", subjectId: 21, cadence: "monthly", monthlyFeeJpy: 9800, annualFeeJpy: 98000,
    cadenceLocked: false, amountLocked: false, state: "paid", trialStatus: "completed", trialStartedAt: null,
    trialEndsAt: null, paidThrough: null, paymentProvider: "manual", freeDuration: null, extensionCount: 0, version: 1 }
};
const group: MerchantGroupCard = { id: 900, type: "merchant_group", code: "group", name: "集团", status: "active",
  paymentResponsibility: "group_consolidated", billing: shop.billing, suspension: null,
  consolidatedMonthlyTotalJpy: 9800, shops: [shop, { ...shop, id: 22, name: "第二家店" }], createdAt: shop.createdAt };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(card: ShopCard | MerchantGroupCard | null) {
  await act(async () => root.render(<MerchantAccountDetailDrawer card={card} onClose={() => undefined} />));
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((node) => node.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
it("preserves SaaS information and opens the selected shop presentation inside the drawer", async () => {
  await render(shop);
  expect(container.textContent).toContain("店铺 SaaS 情报");
  expect(container.textContent).toContain("9,800");
  expect(container.querySelector("[data-shop-id]")).toBeNull();
  await click("店铺展示");
  expect(container.querySelector("[data-shop-id]")?.getAttribute("data-shop-id")).toBe("21");
  expect(container.querySelector("[data-embedded]")?.getAttribute("data-embedded")).toBe("true");
  await click("店铺 SaaS 情报");
  expect(container.textContent).toContain("9,800");
});
it("selects a group's actual shops and resets when another account opens", async () => {
  await render(group); await click("店铺展示");
  expect(container.querySelector("[data-shop-id]")?.getAttribute("data-shop-id")).toBe("21");
  const select = container.querySelector("select")!;
  await act(async () => { select.value = "22"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector("[data-shop-id]")?.getAttribute("data-shop-id")).toBe("22");
  await render({ ...shop, id: 23 });
  expect(container.querySelector("[data-shop-id]")).toBeNull();
  await click("店铺展示");
  expect(container.querySelector("[data-shop-id]")?.getAttribute("data-shop-id")).toBe("23");
});
it("shows an empty group without requesting a group ID as a shop", async () => {
  await render({ ...group, shops: [] }); await click("店铺展示");
  expect(container.querySelector("[data-shop-id]")).toBeNull();
  expect(container.textContent).toContain("暂无旗下店铺");
});
