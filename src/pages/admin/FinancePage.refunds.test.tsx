// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinancePage } from "./FinancePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  canResolve: false,
  request: vi.fn()
}));

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: testState.request }
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      permission === "backoffice:order-refund-dispute:resolve" && testState.canResolve
  })
}));

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

vi.mock("../../components/admin/ModuleShell", () => ({
  ModuleShell: ({ actions, children, description, title }: {
    actions?: ReactNode;
    children: ReactNode;
    description: string;
    title: string;
  }) => <section><h1>{title}</h1><p>{description}</p>{actions}{children}</section>
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

const openDispute = {
  publicId: "01a-refund-case",
  orderNo: "ND202609130000000001",
  shop: { shopNo: "S000001", name: "银座正式店" },
  customer: { needoId: "u0000000041", displayName: "美咲" },
  status: "disputed" as const,
  responsibility: "shop" as const,
  refundAmountJpy: 8800,
  currency: "JPY",
  version: 5,
  requestReason: "服务与约定不符",
  merchantDecisionNote: "商户拒绝退款",
  refundReference: null,
  requestedAt: "2026-09-12T01:00:00.000Z",
  merchantDecisionAt: "2026-09-12T02:00:00.000Z",
  refundSubmittedAt: null,
  customerConfirmedAt: null,
  dispute: {
    publicId: "01a-refund-dispute",
    status: "open" as const,
    resolution: null,
    version: 2,
    reason: "双方无法达成一致",
    openedAt: "2026-09-12T03:00:00.000Z",
    resolvedAt: null,
    publicResolutionReason: null
  },
  affiliateReward: { status: "settled" as const, rewardNdp: 500 },
  createdAt: "2026-09-12T01:00:00.000Z",
  updatedAt: "2026-09-12T03:00:00.000Z"
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function button(label: string) {
  const match = Array.from(document.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!match) throw new Error(`missing button: ${label}`);
  return match;
}

function fill(label: string, value: string) {
  const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  if (!control) throw new Error(`missing field: ${label}`);
  const prototype = control instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

let container: HTMLDivElement;
let root: Root;

describe("FinancePage refund module routing", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    testState.canResolve = false;
    testState.request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/backoffice/refund-disputes" && options?.method !== "POST") {
        return { list: [openDispute], total: 1, page: 1, page_size: 20 };
      }
      if (path === `/backoffice/refund-disputes/${openDispute.dispute.publicId}/resolve`) {
        return {
          ...openDispute,
          status: "refund_pending",
          version: 6,
          dispute: {
            ...openDispute.dispute,
            status: "resolved",
            resolution: "refund",
            version: 3,
            resolvedAt: "2026-09-13T01:00:00.000Z",
            publicResolutionReason: "证据支持退款"
          }
        };
      }
      throw new Error(`unexpected request: ${path}`);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it.each(["refunds", "refund-review"])(
    "renders the formal refund dispute workspace for module=%s instead of settlement overview",
    async (module) => {
      await act(async () => root.render(
        <MemoryRouter initialEntries={[`/admin/finance?module=${module}`]}>
          <FinancePage />
        </MemoryRouter>
      ));
      await flush();

      expect(container.textContent).toContain("退款争议审核");
      expect(container.textContent).toContain("ND202609130000000001");
      expect(container.textContent).not.toContain("财务结算中心");
      expect(testState.request).toHaveBeenCalledWith("/backoffice/refund-disputes", {
        query: { page: 1, page_size: 20, search: undefined, status: "open" }
      });
      expect(testState.request.mock.calls.some(([path]) => String(path).includes("/backoffice/finance"))).toBe(false);

      await act(async () => button("审核").click());
      expect(container.textContent).toContain("当前账号仅可读取争议，不能提交裁定。");
      expect(container.textContent).not.toContain("裁定退款");
    }
  );

  it("gates dispute resolution by RBAC and submits the server-owned version contract", async () => {
    testState.canResolve = true;
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/admin/finance?module=refund-review"]}>
        <FinancePage />
      </MemoryRouter>
    ));
    await flush();

    await act(async () => button("审核").click());
    fill("公开裁定理由", "证据支持退款");
    fill("内部备注", "已复核双方材料");
    await act(async () => button("裁定退款").click());
    await act(async () => button("再次点击确认裁定退款").click());
    await flush();

    expect(testState.request).toHaveBeenCalledWith(
      `/backoffice/refund-disputes/${openDispute.dispute.publicId}/resolve`,
      {
        body: {
          expectedVersion: 2,
          idempotencyKey: expect.any(String),
          internalNote: "已复核双方材料",
          publicReason: "证据支持退款",
          resolution: "refund"
        },
        method: "POST"
      }
    );
  });
});
