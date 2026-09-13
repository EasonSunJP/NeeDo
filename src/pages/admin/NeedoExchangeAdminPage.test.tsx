// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeOperationsApi } from "../../api/exchangeOperations";
import { NeedoDemandAdminPage } from "./NeedoExchangeAdminPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/admin/AdminLayout", () => ({ AdminLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("../../components/admin/ModuleShell", () => ({ ModuleShell: ({ actions, children, title }: { actions?: ReactNode; children: ReactNode; title: string }) => <section><h1>{title}</h1>{actions}{children}</section> }));
vi.mock("../../components/ui/DataTable", () => ({ DataTable: ({ rows, onView }: { rows: Array<{ title: string }>; onView: (row: { title: string }) => void }) => <div>{rows.map((row) => <button key={row.title} onClick={() => onView(row)}>{row.title}</button>)}</div> }));
vi.mock("../../components/ui/Drawer", () => ({ Drawer: ({ children, open, title }: { children: ReactNode; open: boolean; title: string }) => open ? <aside><h2>{title}</h2>{children}</aside> : null }));
vi.mock("../../components/admin/DetailGrid", () => ({ DetailGrid: () => null }));
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));

const row = {
  id: 6, type: "demand" as const, status: "published" as const, title: "正式需求",
  publisher: { publicIdMasked: "u0000••••01", displayNameMasked: "E•••n", identityType: "customer" },
  serviceMode: "store" as const, areaLabel: "東京都千代田区",
  serviceStartAt: "2026-09-14T01:00:00.000Z", serviceEndAt: "2026-09-14T02:00:00.000Z",
  expiresAt: "2026-09-14T03:00:00.000Z", publishedAt: "2026-09-13T01:00:00.000Z",
  budgetMinJpy: null, budgetMaxJpy: 8000, matchMode: "quick" as const,
  claimCount: 1, activeClaimCount: 1, matchedCount: 0, financial: null
};

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

let container: HTMLDivElement;
let root: Root;

describe("NeedoExchangeAdminPage", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("loads formal server data, paginates, and opens the read-only detail", async () => {
    vi.spyOn(exchangeOperationsApi, "list").mockResolvedValue({ list: [row], total: 21, page: 1, page_size: 20 });
    vi.spyOn(exchangeOperationsApi, "detail").mockResolvedValue({
      ...row, detail: "正式数据", contentLocale: "ja-JP",
      demand: { targetProviderCount: 1, targetProviderLimitSnapshot: 1, publisherCapacitySource: "customer_membership", membershipLevelSnapshot: "standard", matchMode: "quick", budgetMode: "total", budgetMinJpy: null, budgetMaxJpy: 8000, serviceMode: "store", addressLine1: "東京都千代田区" },
      intelligence: null, claims: [], matching: null, timeline: []
    });

    await act(async () => root.render(<MemoryRouter><NeedoDemandAdminPage /></MemoryRouter>));
    await flush();
    expect(exchangeOperationsApi.list).toHaveBeenCalledWith(expect.objectContaining({ type: "demand", page: 1, pageSize: 20 }), expect.any(AbortSignal));
    expect(container.textContent).toContain("正式需求");
    expect(container.textContent).toContain("服务器共 21 条，第 1 / 2 页");
    expect(container.textContent).toContain("只读");
    expect(container.textContent).not.toContain("审核通过");
    expect(container.textContent).not.toContain("强制撤回");

    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "正式需求")?.click());
    await flush();
    expect(exchangeOperationsApi.detail).toHaveBeenCalledWith(6, expect.any(AbortSignal));
    expect(container.textContent).toContain("正式数据");
  });
});
