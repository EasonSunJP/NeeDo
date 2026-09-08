// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MerchantGroupCard, ShopCard } from "../../features/merchant-saas-billing/model";
import { MerchantAccountCollection } from "./MerchantAccountCollection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));

const shop = (id: number, name: string): ShopCard => ({
  id,
  type: "shop",
  name,
  city: "东京都港区",
  address: "麻布十番",
  phone: "090-0000-0000",
  status: "published",
  ownerEmail: `owner-${id}@needo.test`,
  coverUrl: null,
  ratingAverage: 4.8,
  reviewCount: 18,
  technicianCount: 3,
  suspension: null,
  createdAt: "2026-09-08T01:02:03.000Z",
  billing: {
    subjectType: "shop",
    subjectId: id,
    cadence: "monthly",
    monthlyFeeJpy: 9800,
    annualFeeJpy: 98000,
    cadenceLocked: false,
    amountLocked: false,
    state: "paid",
    trialStatus: "completed",
    trialStartedAt: null,
    trialEndsAt: null,
    paidThrough: null,
    paymentProvider: "manual",
    freeDuration: null,
    extensionCount: 0,
    version: 1,
  },
});

const firstShop = shop(21, "麻布十番超级按摩");
const secondShop = shop(22, "六本木舒缓中心");
const standaloneShop = { ...shop(23, "涩谷健康馆"), type: "single_shop" as const };
const group: MerchantGroupCard = {
  id: 900,
  type: "merchant_group",
  code: "needo-group",
  name: "NeeDo Group",
  status: "active",
  paymentResponsibility: "group_consolidated",
  billing: firstShop.billing,
  suspension: null,
  consolidatedMonthlyTotalJpy: 19600,
  shops: [firstShop, secondShop],
  createdAt: firstShop.createdAt,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("keeps information cards as the default and switches to a shop-scoped list", async () => {
  await act(async () => root.render(
    <MerchantAccountCollection
      accounts={[group, standaloneShop]}
      onEditBilling={() => undefined}
      onOpenBusinessSettings={() => undefined}
      onOpenMerchantAdminPreview={() => undefined}
      onViewDetails={() => undefined}
    />,
  ));

  expect(container.querySelector('[aria-label="信息卡显示"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector('[data-merchant-type="merchant_group"]')).not.toBeNull();
  expect(container.querySelector("table")).toBeNull();

  await act(async () => (container.querySelector('[aria-label="列表显示"]') as HTMLButtonElement).click());

  expect(container.querySelector('[aria-label="列表显示"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  expect(container.textContent).toContain("店名");
  expect(container.textContent).toContain("创建者");
  expect(container.textContent).toContain("地区");
  expect(container.textContent).toContain("平台抽成");
  expect(container.textContent).toContain("0%");
  expect(container.textContent).toContain("月费");
  expect(container.textContent).toContain("添加时间");
  expect(container.textContent).not.toContain("手机号");
  expect(container.textContent).not.toContain("区域分成");
  expect(container.textContent).not.toContain("级别");
});

it("opens the selected shop in the existing detail flow from the frozen detail action", async () => {
  const onViewDetails = vi.fn();
  await act(async () => root.render(
    <MerchantAccountCollection
      accounts={[group]}
      onEditBilling={() => undefined}
      onOpenBusinessSettings={() => undefined}
      onOpenMerchantAdminPreview={() => undefined}
      onViewDetails={onViewDetails}
    />,
  ));
  await act(async () => (container.querySelector('[aria-label="列表显示"]') as HTMLButtonElement).click());
  const rows = Array.from(container.querySelectorAll("tbody tr"));
  const target = rows.find((row) => row.textContent?.includes("六本木舒缓中心"));
  expect(target).toBeDefined();
  const detailButton = Array.from(target!.querySelectorAll("button")).find((button) => button.textContent === "详情");
  expect(detailButton).toBeDefined();
  await act(async () => detailButton!.click());
  expect(onViewDetails).toHaveBeenCalledWith(secondShop);
});
