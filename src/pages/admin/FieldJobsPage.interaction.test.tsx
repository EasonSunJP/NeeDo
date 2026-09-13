// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fieldJobApi,
  type FieldJobDetail,
  type FieldJobSummary,
} from "../../api/fieldJobs";
import { FieldJobsPage } from "./FieldJobsPage";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("../../components/admin/ModuleShell", () => ({
  ModuleShell: ({
    actions,
    children,
    title,
  }: {
    actions?: ReactNode;
    children: ReactNode;
    title: string;
  }) => (
    <section>
      <h1>{title}</h1>
      {actions}
      {children}
    </section>
  ),
}));
vi.mock("../../components/ui/Drawer", () => ({
  Drawer: ({
    children,
    open,
    title,
  }: {
    children: ReactNode;
    open: boolean;
    title: string;
  }) =>
    open ? (
      <aside>
        <h2>{title}</h2>
        {children}
      </aside>
    ) : null,
}));

const summary: FieldJobSummary = {
  id: 71,
  orderNo: "LDF26-0007100",
  status: "confirmed",
  serviceName: "訪問リラクゼーション 90分",
  shop: { id: 16, name: "LifeDance 新宿" },
  technician: {
    assignment: "assigned",
    profileId: 22,
    needoId: "s0000000022",
    name: "担当技師",
  },
  startsAt: "2026-09-15T07:00:00.000Z",
  endsAt: "2026-09-15T08:30:00.000Z",
  location: {
    disclosure: "region_only",
    regionLabel: "東京都 新宿区",
    lines: null,
  },
  credential: { state: "issued", verifiedAt: null },
  evidence: {
    startedAt: null,
    expectedEndsAt: null,
    endedAt: null,
    receiptConfirmedAt: null,
    paymentStatus: "pending",
  },
  exceptions: {
    activeSosCount: null,
    activeRefundCaseCount: 0,
    openDisputeCount: 0,
    overdueResolution: null,
    hasPerformanceIssue: false,
  },
  createdAt: "2026-09-13T01:00:00.000Z",
  updatedAt: "2026-09-13T02:00:00.000Z",
};
const detail: FieldJobDetail = {
  ...summary,
  location: {
    disclosure: "full",
    regionLabel: "東京都 新宿区",
    lines: ["〒160-0022 東京都新宿区西新宿1-2-3"],
  },
  customerPublicId: "u0000000206",
  timeline: [
    {
      id: 901,
      fromStatus: "pending",
      toStatus: "confirmed",
      reason: "店铺确认",
      createdAt: "2026-09-13T02:00:00.000Z",
    },
  ],
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement;
let root: Root;

describe("FieldJobsPage formal data interactions", () => {
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

  it("loads the authoritative page, uses server pagination, and opens redaction-aware detail", async () => {
    vi.spyOn(fieldJobApi, "list").mockResolvedValue({
      list: [summary],
      total: 21,
      page: 1,
      page_size: 20,
    });
    vi.spyOn(fieldJobApi, "get").mockResolvedValue(detail);

    await act(async () =>
      root.render(
        <MemoryRouter>
          <FieldJobsPage />
        </MemoryRouter>,
      ),
    );
    await flush();
    expect(fieldJobApi.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(container.textContent).toContain("訪問リラクゼーション 90分");
    expect(container.textContent).toContain("服务器共 21 条，第 1 / 2 页");

    const view = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "查看",
    );
    await act(async () => view?.click());
    await flush();
    expect(fieldJobApi.get).toHaveBeenCalledWith(71);
    expect(container.textContent).toContain(
      "〒160-0022 東京都新宿区西新宿1-2-3",
    );
    expect(container.textContent).toContain("待确认 → 已确认");
    expect(container.textContent).toContain("前往正式订单中心");
    expect(container.textContent).not.toContain("派工");
  });
});
