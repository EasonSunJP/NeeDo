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

function fillByPlaceholder(placeholder: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );
  if (!input) throw new Error(`missing input: ${placeholder}`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
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

function confirmedSettlement() {
  const preview = settlementPreview();
  return {
    ...preview.totals,
    publicId: "settlement-1",
    agentPublicId: "agent-1",
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-09-30T00:00:00.000Z",
    status: "confirmed" as const,
    currency: "JPY" as const,
    rule: preview.rule,
    idempotencyKey: "settlement-key-1",
    confirmedAt: "2026-09-30T12:00:00.000Z",
    confirmedById: 1,
    paidAt: null,
    paidById: null,
    paymentMethod: null,
    paymentReference: null,
    lines: [],
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
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
    vi.resetAllMocks();
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
    expect(container.textContent).toContain("银行转账");
    expect(container.textContent).not.toContain("bank_transfer");
  });

  it("loads every immutable commission-rule history page on demand", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) =>
      rule(21 - index, { reason: `page-one-${21 - index}` }),
    );
    testState.getCommissionRules.mockReset();
    testState.getCommissionRules
      .mockResolvedValueOnce({
        current: firstPage[0],
        latestVersion: 21,
        evaluatedAt: "2026-09-03T00:00:00.000Z",
        history: {
          list: firstPage,
          total: 21,
          page: 1,
          page_size: 20,
        },
      })
      .mockResolvedValueOnce({
        current: firstPage[0],
        latestVersion: 21,
        evaluatedAt: "2026-09-03T00:00:00.000Z",
        history: {
          list: [
            rule(2, { reason: "duplicate-page-two-2" }),
            rule(1, { reason: "page-two-1" }),
          ],
          total: 21,
          page: 2,
          page_size: 20,
        },
      });

    renderDetail(root);
    await waitFor(() => expect(container.textContent).toContain("v21"));
    expect(container.textContent).not.toContain("page-two-1");

    await click("加载更多规则版本");

    await waitFor(() => expect(container.textContent).toContain("page-two-1"));
    expect(container.textContent).not.toContain("duplicate-page-two-2");
    expect(hasButton("加载更多规则版本")).toBe(false);
    expect(testState.getCommissionRules).toHaveBeenLastCalledWith("agent-1", {
      page: 2,
      pageSize: 20,
    });
  });

  it("ignores a stale history response after a full rule refresh", async () => {
    let resolveStalePage: (value: unknown) => void = () => undefined;
    const stalePage = new Promise((resolve) => {
      resolveStalePage = resolve;
    });
    testState.getCommissionRules.mockReset();
    testState.getCommissionRules
      .mockResolvedValueOnce({
        current: rule(2),
        latestVersion: 2,
        evaluatedAt: "2026-09-03T00:00:00.000Z",
        history: {
          list: [rule(2)],
          total: 21,
          page: 1,
          page_size: 20,
        },
      })
      .mockReturnValueOnce(stalePage)
      .mockResolvedValueOnce({
        current: rule(3, { reason: "刷新后的当前规则" }),
        latestVersion: 3,
        evaluatedAt: "2026-09-04T00:00:00.000Z",
        history: {
          list: [rule(3, { reason: "刷新后的当前规则" }), rule(2)],
          total: 2,
          page: 1,
          page_size: 20,
        },
      });

    renderDetail(root);
    await waitFor(() => expect(container.textContent).toContain("当前合同"));
    await click("加载更多规则版本");
    await click("刷新");
    await waitFor(() =>
      expect(container.textContent).toContain("刷新后的当前规则"),
    );

    await act(async () => {
      resolveStalePage({
        current: rule(1, { reason: "过期当前规则" }),
        latestVersion: 1,
        evaluatedAt: "2026-09-02T00:00:00.000Z",
        history: {
          list: [rule(1, { reason: "过期历史页" })],
          total: 21,
          page: 2,
          page_size: 20,
        },
      });
      await Promise.resolve();
    });

    expect(container.textContent).toContain("刷新后的当前规则");
    expect(container.textContent).not.toContain("过期当前规则");
    expect(container.textContent).not.toContain("过期历史页");
  });

  it("restarts history pagination when a newer rule appears between pages", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) =>
      rule(21 - index, { reason: `snapshot-v21-${21 - index}` }),
    );
    const refreshedPage = Array.from({ length: 20 }, (_, index) =>
      rule(22 - index, {
        reason: index === 0 ? "并发新增当前规则" : `snapshot-v22-${22 - index}`,
      }),
    );
    testState.getCommissionRules.mockReset();
    testState.getCommissionRules
      .mockResolvedValueOnce({
        current: firstPage[0],
        latestVersion: 21,
        evaluatedAt: "2026-09-03T00:00:00.000Z",
        history: {
          list: firstPage,
          total: 21,
          page: 1,
          page_size: 20,
        },
      })
      .mockResolvedValueOnce({
        current: refreshedPage[0],
        latestVersion: 22,
        evaluatedAt: "2026-09-04T00:00:00.000Z",
        history: {
          list: [
            rule(2, { reason: "drifted-duplicate-v2" }),
            rule(1, { reason: "drifted-v1" }),
          ],
          total: 22,
          page: 2,
          page_size: 20,
        },
      })
      .mockResolvedValueOnce({
        current: refreshedPage[0],
        latestVersion: 22,
        evaluatedAt: "2026-09-04T00:00:00.000Z",
        history: {
          list: refreshedPage,
          total: 22,
          page: 1,
          page_size: 20,
        },
      })
      .mockResolvedValueOnce({
        current: refreshedPage[0],
        latestVersion: 22,
        evaluatedAt: "2026-09-04T00:00:00.000Z",
        history: {
          list: [rule(2), rule(1)],
          total: 22,
          page: 2,
          page_size: 20,
        },
      });

    renderDetail(root);
    await waitFor(() => expect(container.textContent).toContain("snapshot-v21-21"));
    await click("加载更多规则版本");

    await waitFor(() =>
      expect(container.textContent).toContain("并发新增当前规则"),
    );
    expect(container.textContent).not.toContain("drifted-v1");
    expect(hasButton("加载更多规则版本")).toBe(true);

    await click("加载更多规则版本");
    await waitFor(() => expect(container.textContent).toContain("初始合同"));
    expect(testState.getCommissionRules).toHaveBeenCalledTimes(4);
    expect(hasButton("加载更多规则版本")).toBe(false);
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

    fill("外部凭证编号", " EXT-CHANGED-AFTER-PREVIEW ");
    fill("凭证说明", " changed after preview ");

    await click("确认并生成结算凭证");
    await waitFor(() =>
      expect(testState.confirmSettlement).toHaveBeenCalledWith(
        "agent-1",
        expect.objectContaining({
          externalDeductions: [
            expect.objectContaining({
              evidenceReference: " EXT-1 ",
              reason: " monthly invoice ",
            }),
          ],
          idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        }),
      ),
    );
  });

  it("keeps a reviewed settlement preview retryable after confirmation fails", async () => {
    testState.permissions.add("backoffice:agent-settlement:write");
    testState.listShopReferrals.mockResolvedValue({
      list: [referral()],
      total: 1,
      page: 1,
      page_size: 100,
    });
    testState.confirmSettlement
      .mockRejectedValueOnce(new Error("结算版本冲突"))
      .mockResolvedValueOnce({ publicId: "settlement-1" });
    renderDetail(root);
    await waitFor(() => expect(container.textContent).toContain("银座护理店"));

    fill("外部凭证编号", "EXT-RETRY");
    fill("凭证说明", "retry evidence");
    await click("计算预览");
    await waitFor(() => expect(container.textContent).toContain("¥62,000"));

    await click("确认并生成结算凭证");
    await waitFor(() => expect(container.textContent).toContain("结算版本冲突"));
    expect(container.textContent).toContain("¥62,000");
    expect(hasButton("确认并生成结算凭证")).toBe(true);

    await click("确认并生成结算凭证");
    await waitFor(() =>
      expect(testState.confirmSettlement).toHaveBeenCalledTimes(2),
    );
  });

  it("keeps payment evidence retryable after marking a settlement paid fails", async () => {
    testState.permissions.add("backoffice:agent-settlement:pay");
    testState.listSettlements.mockResolvedValue({
      list: [confirmedSettlement()],
      total: 1,
      page: 1,
      page_size: 50,
    });
    testState.markSettlementPaid
      .mockRejectedValueOnce(new Error("支付凭证版本冲突"))
      .mockResolvedValueOnce({ publicId: "settlement-1" });
    renderDetail(root);
    await waitFor(() => expect(container.textContent).toContain("¥62,000"));

    await click("登记支付凭证");
    fillByPlaceholder("支付凭证编号", "BANK-202609-1");
    fillByPlaceholder("确认理由", "财务复核完成");
    await click("确认已支付");
    await waitFor(() =>
      expect(container.textContent).toContain("支付凭证版本冲突"),
    );
    expect(
      document.querySelector<HTMLInputElement>(
        'input[placeholder="支付凭证编号"]',
      )?.value,
    ).toBe("BANK-202609-1");
    expect(
      document.querySelector<HTMLInputElement>(
        'input[placeholder="确认理由"]',
      )?.value,
    ).toBe("财务复核完成");

    await click("确认已支付");
    await waitFor(() =>
      expect(testState.markSettlementPaid).toHaveBeenCalledTimes(2),
    );
  });
});
