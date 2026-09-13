// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformUserManagementApi } from "../../features/platform-user-management/api";
import { ReviewsPage } from "./ReviewsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

vi.mock("../../components/admin/ModuleShell", () => ({
  ModuleShell: ({ children, title }: { children: ReactNode; title: string }) => <section><h1>{title}</h1>{children}</section>
}));

const review = {
  reviewId: 77,
  status: "amended" as const,
  targetType: "technician" as const,
  rating: 4,
  comment: "QA-20260910-RQ-001 技術者サービス評価",
  tags: ["professional"],
  createdAt: "2026-09-10T03:00:00.000Z",
  amendmentVersion: 1,
  amendmentHistory: [{ version: 1, rating: 4, comment: "Corrected", tags: ["professional"], reason: "证据复核", revisedAt: "2026-09-11T03:00:00.000Z", revisedBy: "Operator" }],
  order: { id: 88, orderNo: "B-88", serviceName: "ボディケア 60分", startsAt: "2026-09-10T02:00:00.000Z", shopName: "LifeDance", durationMinutes: 60, note: null, paymentMethod: "ndp" as const, paymentStatus: "confirmed" as const, paymentCurrency: "NDP", otherPaymentMethod: null, addOnCount: 0, addOnMinutes: 0 },
  reviewer: { needoId: "u0000000001", displayName: "Eason", avatarUrl: null },
  customer: { needoId: "u0000000001", displayName: "Eason" },
  shop: { id: 79, publicId: "b000000079", name: "LifeDance" },
  technician: { id: 186, publicId: "s0000000002", displayName: "LifeDance 管理员 2" }
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function changeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  act(() => {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
  });
}

let container: HTMLDivElement;
let root: Root;

describe("ReviewsPage formal review management", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(platformUserManagementApi, "listOperationsReviews").mockResolvedValue({ list: [review], total: 41, page: 1, page_size: 20 });
    vi.spyOn(platformUserManagementApi, "getOperationsReview").mockResolvedValue(review);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("submits rating, status, target and Tokyo date filters to server pagination", async () => {
    await act(async () => root.render(<ReviewsPage />));
    await flush();

    const search = container.querySelector<HTMLInputElement>('[aria-label="搜索评价"]')!;
    changeValue(search, "QA-20260910-RQ-001");
    await act(async () => search.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));
    changeValue(container.querySelector<HTMLSelectElement>('[aria-label="评分"]')!, "4");
    changeValue(container.querySelector<HTMLSelectElement>('[aria-label="状态"]')!, "amended");
    changeValue(container.querySelector<HTMLSelectElement>('[aria-label="评价对象"]')!, "technician");
    changeValue(container.querySelector<HTMLInputElement>('[aria-label="开始日期"]')!, "2026-09-10");
    changeValue(container.querySelector<HTMLInputElement>('[aria-label="结束日期"]')!, "2026-09-10");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="应用评价日期"]')!.click());
    await flush();

    expect(platformUserManagementApi.listOperationsReviews).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 20,
      keyword: "QA-20260910-RQ-001",
      rating: 4,
      status: "amended",
      targetType: "technician",
      from: "2026-09-10",
      to: "2026-09-10"
    });
    expect(container.textContent).toContain("服务器共 41 条，第 1 / 3 页");
  });

  it("opens formal details with related entities and immutable amendments", async () => {
    await act(async () => root.render(<ReviewsPage />));
    await flush();

    const details = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("详情"));
    await act(async () => details?.click());
    await flush();

    expect(platformUserManagementApi.getOperationsReview).toHaveBeenCalledWith(77);
    expect(container.textContent).toContain("QA-20260910-RQ-001 技術者サービス評価");
    expect(container.textContent).toContain("ボディケア 60分");
    expect(container.textContent).toContain("Eason");
    expect(container.textContent).toContain("LifeDance 管理员 2");
    expect(container.textContent).toContain("证据复核");
    expect(container.textContent).not.toContain("正式评价功能尚未启用");
  });
});
