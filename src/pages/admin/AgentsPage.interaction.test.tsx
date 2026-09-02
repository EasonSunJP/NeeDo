// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentsPage } from "./AgentsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  permissions: new Set<string>(),
  listShopReferrals: vi.fn(),
  getCommissionRules: vi.fn(),
  listSettlements: vi.fn(),
  linkShop: vi.fn(),
  publishCommissionRule: vi.fn(),
  previewSettlement: vi.fn(),
  confirmSettlement: vi.fn(),
  markSettlementPaid: vi.fn(),
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    hasPermission: (permission: string) => testState.permissions.has(permission),
  }),
}));

vi.mock("../../api/platformPartners", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/platformPartners")>()),
  platformPartnersApi: {
    listShopReferrals: testState.listShopReferrals,
    getCommissionRules: testState.getCommissionRules,
    listSettlements: testState.listSettlements,
    linkShop: testState.linkShop,
    publishCommissionRule: testState.publishCommissionRule,
    previewSettlement: testState.previewSettlement,
    confirmSettlement: testState.confirmSettlement,
    markSettlementPaid: testState.markSettlementPaid,
  },
}));

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../../components/admin/ModuleShell", () => ({
  ModuleShell: ({
    actions,
    children,
    description,
    title,
  }: {
    actions: ReactNode;
    children: ReactNode;
    description: string;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
      {children}
    </main>
  ),
}));

const rule = (version: number, overrides: Record<string, unknown> = {}) => ({
  publicId: `rule-${version}`,
  version,
  fixedSuccessRewardJpy: version * 10_000,
  profitShareRateBps: version * 500,
  paymentMethod: "bank_transfer" as const,
  paymentDetails: null,
  effectiveFrom: `2026-0${version}-01T00:00:00.000Z`,
  effectiveTo:
    version === 2 ? null : "2026-02-01T00:00:00.000Z",
  publishedAt: `2026-0${version}-01T00:00:00.000Z`,
  publishedById: 1,
  reason: version === 2 ? "当前合同" : "初始合同",
  createdAt: `2026-0${version}-01T00:00:00.000Z`,
  ...overrides,
});

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }
  throw lastError;
}

function fill(labelText: string, value: string) {
  const label = [...document.querySelectorAll("label")].find((item) =>
    item.textContent?.includes(labelText),
  );
  const input = label?.querySelector("input, textarea, select") as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | null;
  if (!input) throw new Error(`missing input: ${labelText}`);
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(buttonText: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.includes(buttonText),
  );
  if (!button) throw new Error(`missing button: ${buttonText}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

function hasButton(buttonText: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].some(
    (item) => item.textContent?.includes(buttonText),
  );
}

function referral() {
  return {
    publicId: "referral-1",
    agentPublicId: "agent-1",
    status: "active" as const,
    source: "manual",
    confirmedAt: "2026-09-01T00:00:00.000Z",
    successQualifiedAt: null,
    reason: "signed agreement",
    createdAt: "2026-09-01T00:00:00.000Z",
    shop: {
      publicId: "shop0000000001",
      name: "银座护理店",
      city: "东京",
    },
  };
}

function settlementPreview() {
  const totals = {
    orderPlatformFeesJpy: 100_000,
    saasFeesJpy: 20_000,
    userRebatesJpy: 10_000,
    refundsAndReversalsJpy: 5_000,
    channelFeesJpy: 3_000,
    consumptionTaxJpy: 8_000,
    allocatedOperatingCostsJpy: 14_000,
    pureProfitJpy: 80_000,
    fixedSuccessRewardJpy: 50_000,
    profitShareRateBps: 1_500,
    profitShareAmountJpy: 12_000,
    totalAmountJpy: 62_000,
  };
  return {
    agentPublicId: "agent-1",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    currency: "JPY" as const,
    rule: {
      publicId: "rule-2",
      version: 2,
      fixedSuccessRewardJpy: 50_000,
      profitShareRateBps: 1_500,
      paymentMethod: "bank_transfer" as const,
    },
    totals,
    shops: [
      {
        ...totals,
        referralPublicId: "referral-1",
        shopPublicId: "shop0000000001",
        shopName: "银座护理店",
        successRewardEligible: true,
        externalEvidenceReference: "EXT-1",
        externalEvidenceReason: "monthly invoice",
      },
    ],
    generatedAt: "2026-09-30T12:00:00.000Z",
  };
}

function renderDetail(root: Root) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/agents/:agentPublicId",
        element: <AgentsPage />,
      },
    ],
    { initialEntries: ["/admin/agents/agent-1"] },
  );
  act(() => root.render(<RouterProvider router={router} />));
}

describe("AgentsPage formal interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    testState.permissions.clear();
    testState.listShopReferrals.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 100,
    });
    testState.getCommissionRules.mockResolvedValue({
      current: rule(2),
      latestVersion: 2,
      evaluatedAt: "2026-09-03T00:00:00.000Z",
      history: {
        list: [rule(2), rule(1)],
        total: 2,
        page: 1,
        page_size: 20,
      },
    });
    testState.listSettlements.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 50,
    });
    testState.linkShop.mockResolvedValue(referral());
    testState.publishCommissionRule.mockResolvedValue(rule(3));
    testState.previewSettlement.mockResolvedValue(settlementPreview());
    testState.confirmSettlement.mockResolvedValue({ publicId: "settlement-1" });
    testState.markSettlementPaid.mockResolvedValue({ publicId: "settlement-1" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders immutable commission-rule history returned by the formal API", async () => {
    renderDetail(root);
    await waitFor(() =>
      expect(container.textContent).toContain("佣金规则版本历史"),
    );

    expect(container.textContent).toContain("v2");
    expect(container.textContent).toContain("当前合同");
    expect(container.textContent).toContain("v1");
    expect(container.textContent).toContain("初始合同");
  });

  it("keeps formal detail readable while hiding every mutation without permission", async () => {
    renderDetail(root);
    await waitFor(() => expect(container.textContent).toContain("当前合同"));

    expect(container.textContent).toContain("当前账号只有读取权限");
    expect(hasButton("关联店铺")).toBe(false);
    expect(hasButton("发布新版本")).toBe(false);
    expect(hasButton("计算预览")).toBe(false);
    expect(testState.linkShop).not.toHaveBeenCalled();
    expect(testState.confirmSettlement).not.toHaveBeenCalled();
  });

  it("links a shop through the formal API and refreshes the detail", async () => {
    testState.permissions.add("backoffice:agent:write");
    renderDetail(root);
    await waitFor(() => expect(container.textContent).toContain("尚未关联店铺"));

    fill("店铺公开 ID", " shop0000000001 ");
    fill("设置理由", " 纸质合同已核对 ");
    await click("关联店铺");

    await waitFor(() =>
      expect(testState.linkShop).toHaveBeenCalledWith(
        "agent-1",
        expect.objectContaining({
          shopPublicId: "shop0000000001",
          source: "运营人工确认",
          confirmedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          reason: "纸质合同已核对",
        }),
      ),
    );
    expect(testState.listShopReferrals).toHaveBeenCalledTimes(2);
  });

  it("previews every settlement line before confirming an immutable settlement", async () => {
    testState.permissions.add("backoffice:agent-settlement:write");
    testState.listShopReferrals.mockResolvedValue({
      list: [referral()],
      total: 1,
      page: 1,
      page_size: 100,
    });
    renderDetail(root);
    await waitFor(() => expect(container.textContent).toContain("银座护理店"));

    fill("外部凭证编号", " EXT-1 ");
    fill("凭证说明", " monthly invoice ");
    await click("计算预览");

    await waitFor(() =>
      expect(testState.previewSettlement).toHaveBeenCalledWith(
        "agent-1",
        expect.objectContaining({
          externalDeductions: [
            expect.objectContaining({
              shopPublicId: "shop0000000001",
              evidenceReference: " EXT-1 ",
              reason: " monthly invoice ",
            }),
          ],
        }),
      ),
    );
    await waitFor(() => expect(container.textContent).toContain("¥80,000"));
    expect(container.textContent).toContain("¥62,000");

    await click("确认并生成结算凭证");
    await waitFor(() =>
      expect(testState.confirmSettlement).toHaveBeenCalledWith(
        "agent-1",
        expect.objectContaining({
          idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        }),
      ),
    );
  });
});
