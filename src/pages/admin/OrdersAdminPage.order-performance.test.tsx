// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backofficeRealDataApi,
  type BackofficeOrderDetailPayload,
  type BackofficeOrderPayload
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { OrdersAdminPage } from "./OrdersAdminPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

vi.mock("../../components/admin/ModuleShell", () => ({
  ModuleShell: ({ actions, children, title }: { actions?: ReactNode; children: ReactNode; title: string }) => (
    <section><h1>{title}</h1>{actions}{children}</section>
  )
}));

vi.mock("../../components/admin/DetailGrid", () => ({
  DetailGrid: ({ items }: { items: Array<{ label: string; value: ReactNode }> }) => (
    <dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
  )
}));

vi.mock("../../components/ui/Badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>
}));

vi.mock("../../components/ui/Button", () => ({
  Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) => (
    <button disabled={disabled} onClick={onClick} type="button">{children}</button>
  )
}));

vi.mock("../../components/ui/Drawer", () => ({
  Drawer: ({ children, open, title }: { children: ReactNode; open: boolean; title: string }) =>
    open ? <aside><h2>{title}</h2>{children}</aside> : null
}));

vi.mock("../../components/ui/DataTable", () => ({
  DataTable: ({ columns, rows }: {
    columns: Array<{ key: string; render: (row: BackofficeOrderPayload) => ReactNode }>;
    rows: BackofficeOrderPayload[];
  }) => <div>{rows.map((row) => <div key={row.id}>{columns.map((column) => <span key={column.key}>{column.render(row)}</span>)}</div>)}</div>
}));

const listOrder: BackofficeOrderPayload = {
  id: 31,
  orderNo: "ND202605250001",
  status: "cancelled",
  paymentStatus: "pending",
  customerUserId: 101,
  customerProfileId: 201,
  customerName: "Aya Customer",
  serviceId: 1,
  serviceName: "Shiatsu Recovery",
  shopId: 11,
  shopName: "Aoyama Care Studio",
  technicianProfileId: 301,
  technicianNeedoId: "s0000000301",
  technicianName: "Mika Tanaka",
  fulfillmentMode: "store",
  priceAmount: 8800,
  currency: "JPY",
  startsAt: "2026-05-25T01:00:00.000Z",
  endsAt: "2026-05-25T02:00:00.000Z",
  note: null,
  cancelReason: "技师临时无法到达",
  createdAt: "2026-05-24T23:00:00.000Z",
  updatedAt: "2026-05-25T04:00:00.000Z"
};

const detailOrder: BackofficeOrderDetailPayload = {
  ...listOrder,
  performanceAssessment: {
    id: 81,
    bookingOrderId: 31,
    technicianProfileId: 301,
    outcome: "technician_cancelled",
    treatment: "counted",
    version: 3,
    currentRevisionId: 93,
    createdAt: "2026-05-25T02:00:00.000Z",
    updatedAt: "2026-05-25T04:00:00.000Z"
  },
  timelineEvents: [
    {
      id: "performance:91",
      type: "TECHNICIAN_CANCEL_CLASSIFIED",
      createdAt: "2026-05-25T02:00:00.000Z",
      actorUserId: 301,
      publicReason: "技师临时无法到达",
      internalNote: null
    },
    {
      id: "performance:92",
      type: "SPECIAL_CANCELLATION_APPLIED",
      createdAt: "2026-05-25T03:00:00.000Z",
      actorUserId: 1,
      publicReason: "已核实不可抗力",
      internalNote: "后台核验材料 A"
    },
    {
      id: "performance:93",
      type: "SPECIAL_CANCELLATION_REVOKED",
      createdAt: "2026-05-25T04:00:00.000Z",
      actorUserId: 1,
      publicReason: "用户投诉后复核恢复计入",
      internalNote: "投诉工单 C-123"
    }
  ]
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
    item.textContent?.includes(label)
  );
}

async function setTextarea(label: string, value: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

let container: HTMLDivElement;
let root: Root;

describe("OrdersAdminPage order performance controls", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(backofficeRealDataApi, "orders").mockResolvedValue({
      list: [listOrder],
      total: 1,
      page: 1,
      page_size: 20
    });
    vi.spyOn(backofficeRealDataApi, "orderDetail").mockResolvedValue(detailOrder);
    vi.spyOn(backofficeRealDataApi, "applySpecialCancellation").mockResolvedValue({
      assessment: { ...detailOrder.performanceAssessment!, treatment: "special_excluded", version: 4 },
      replayed: false
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function openDetail() {
    await act(async () => root.render(<MemoryRouter><OrdersAdminPage /></MemoryRouter>));
    await flush();
    await act(async () => button("查看")?.click());
    await flush();
  }

  it("loads fresh detail and shows assessment plus all operations-only revisions before controls", async () => {
    await openDetail();

    expect(backofficeRealDataApi.orderDetail).toHaveBeenCalledWith(31);
    expect(container.textContent).toContain("技师原因取消");
    expect(container.textContent).toContain("正常计入");
    expect(container.textContent).toContain("后台核验材料 A");
    expect(container.textContent).toContain("投诉工单 C-123");
    expect(container.textContent?.indexOf("订单时间线与判定修订")).toBeLessThan(
      container.textContent?.indexOf("设为特殊取消并排除计算") ?? 0
    );
    expect(document.querySelector('input[aria-label*="百分比"]')).toBeNull();
  });

  it("requires a public reason and submits current revision without a percentage value", async () => {
    await openDetail();

    await act(async () => button("设为特殊取消并排除计算")?.click());
    expect(container.textContent).toContain("请填写公开原因后再提交");
    expect(backofficeRealDataApi.applySpecialCancellation).not.toHaveBeenCalled();

    await setTextarea("特殊取消公开原因", "已核实不可抗力");
    await setTextarea("特殊取消内部备注", "后台核验材料 B");
    await act(async () => button("设为特殊取消并排除计算")?.click());
    await flush();

    expect(backofficeRealDataApi.applySpecialCancellation).toHaveBeenCalledWith(
      31,
      expect.objectContaining({
        expectedRevision: 3,
        publicReason: "已核实不可抗力",
        internalNote: "后台核验材料 B",
        idempotencyKey: expect.any(String)
      })
    );
    expect(
      vi.mocked(backofficeRealDataApi.applySpecialCancellation).mock.calls[0]?.[1]
    ).not.toHaveProperty("acceptanceRate");
  });

  it("preserves one idempotency key across a network retry", async () => {
    vi.mocked(backofficeRealDataApi.applySpecialCancellation)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        assessment: { ...detailOrder.performanceAssessment!, treatment: "special_excluded", version: 4 },
        replayed: false
      });
    await openDetail();
    await setTextarea("特殊取消公开原因", "网络重试保持同一意图");

    await act(async () => button("设为特殊取消并排除计算")?.click());
    await flush();
    await act(async () => button("设为特殊取消并排除计算")?.click());
    await flush();

    const firstKey = vi.mocked(backofficeRealDataApi.applySpecialCancellation).mock.calls[0]?.[1]
      .idempotencyKey;
    const secondKey = vi.mocked(backofficeRealDataApi.applySpecialCancellation).mock.calls[1]?.[1]
      .idempotencyKey;
    expect(secondKey).toBe(firstKey);
  });

  it("keeps text on 409, reloads detail, and requires explicit review before resubmission", async () => {
    const latest = {
      ...detailOrder,
      performanceAssessment: { ...detailOrder.performanceAssessment!, version: 4 }
    };
    vi.mocked(backofficeRealDataApi.orderDetail)
      .mockResolvedValueOnce(detailOrder)
      .mockResolvedValueOnce(latest);
    vi.mocked(backofficeRealDataApi.applySpecialCancellation)
      .mockRejectedValueOnce(new ApiClientError("error.order_performance.version_conflict", 40972, 409))
      .mockResolvedValueOnce({
        assessment: { ...latest.performanceAssessment, treatment: "special_excluded", version: 5 },
        replayed: false
      });
    await openDetail();
    await setTextarea("特殊取消公开原因", "用户投诉后再次核验");

    await act(async () => button("设为特殊取消并排除计算")?.click());
    await flush();

    expect(container.textContent).toContain("已保留填写内容");
    expect(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="特殊取消公开原因"]')?.value)
      .toBe("用户投诉后再次核验");
    expect(backofficeRealDataApi.orderDetail).toHaveBeenCalledTimes(2);
    expect(button("设为特殊取消并排除计算")?.disabled).toBe(true);

    await act(async () => button("已查看最新版本，可以重新提交")?.click());
    await act(async () => button("设为特殊取消并排除计算")?.click());
    await flush();

    expect(backofficeRealDataApi.applySpecialCancellation).toHaveBeenLastCalledWith(
      31,
      expect.objectContaining({ expectedRevision: 4, publicReason: "用户投诉后再次核验" })
    );
    const firstKey = vi.mocked(backofficeRealDataApi.applySpecialCancellation).mock.calls[0]?.[1]
      .idempotencyKey;
    const secondKey = vi.mocked(backofficeRealDataApi.applySpecialCancellation).mock.calls[1]?.[1]
      .idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });
});
