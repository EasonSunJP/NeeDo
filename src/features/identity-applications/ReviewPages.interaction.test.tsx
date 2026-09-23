// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TechnicianApplicationsReviewPage } from "./ReviewPages";
import { identityApplicationsApi, type TechnicianReview } from "./api";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" }),
  useOptionalI18n: () => ({ language: "zh" })
}));

vi.mock("../../components/client-ui/SettingsDirectory", () => ({
  SettingsDetailPage: ({ children, title }: { children: ReactNode; title: string }) => (
    <main><h1>{title}</h1>{children}</main>
  )
}));

const review = (applicationId: number, status: TechnicianReview["status"]): TechnicianReview => ({
  applicationId,
  applicantUserId: applicationId + 100,
  targetShopId: 21,
  status,
  version: 2,
  applicantName: `申请人 ${applicationId}`,
  phone: "+819000000000",
  city: "东京",
  serviceAreas: ["银座"],
  skills: ["按摩"],
  yearsExperience: 4,
  bio: "四年经验",
  gender: "female",
  birthDate: "1992-03-04T00:00:00.000Z",
  submittedAt: "2026-09-09T12:00:00.000Z",
  media: []
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement;
let root: Root;

describe("TechnicianApplicationsReviewPage", () => {
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

  it("shows the exact empty state when the formal queue has no applications", async () => {
    vi.spyOn(identityApplicationsApi, "listTechnicianReviews").mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    });

    await act(async () => root.render(
      <MemoryRouter><TechnicianApplicationsReviewPage embedded /></MemoryRouter>
    ));
    await flush();

    expect(container.querySelector('[data-testid="technician-applications-empty"]')?.textContent).toBe("暂无申请");
  });

  it("shows result marks while keeping approved and rejected cards openable", async () => {
    const items = [
      review(11, "submitted"),
      review(12, "under_review"),
      review(13, "approved"),
      review(14, "rejected"),
      review(15, "draft"),
      review(16, "withdrawn")
    ];
    vi.spyOn(identityApplicationsApi, "listTechnicianReviews").mockResolvedValue({
      list: items,
      total: items.length,
      page: 1,
      page_size: 20
    });
    const getReview = vi.spyOn(identityApplicationsApi, "getTechnicianReview")
      .mockImplementation(async (id) => items.find((item) => item.applicationId === id)!);

    await act(async () => root.render(
      <MemoryRouter><TechnicianApplicationsReviewPage embedded /></MemoryRouter>
    ));
    await flush();

    expect(container.querySelectorAll('[aria-label="查看申请"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="unified-info-card"][data-card-kind="technician"]')).toHaveLength(4);
    const approvedMark = container.querySelector<HTMLElement>('[aria-label="审核已通过"]');
    expect(approvedMark?.className).toContain("h-12");
    expect(approvedMark?.className).toContain("bg-[color:var(--client-primary)]");
    expect(approvedMark?.className).toContain("text-[#06100b]");
    expect(approvedMark?.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('[aria-label="审核未通过"]')?.textContent).toBe("×");
    expect(container.querySelector('[data-application-status="approved"]')).not.toBeNull();
    expect(container.querySelector('[data-application-status="rejected"]')).not.toBeNull();
    expect(container.querySelector('[data-application-status="draft"]')).toBeNull();
    expect(container.querySelector('[data-application-status="withdrawn"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-application-status="approved"] button[aria-label^="查看技师"]')?.click();
    });
    await flush();
    expect(getReview).toHaveBeenCalledWith(13);
    expect(container.textContent).toContain("申请人 13");

    await act(async () => root.unmount());
    container.innerHTML = "";
    root = createRoot(container);
    await act(async () => root.render(
      <MemoryRouter><TechnicianApplicationsReviewPage embedded /></MemoryRouter>
    ));
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-application-status="rejected"] button[aria-label^="查看技师"]')?.click();
    });
    await flush();
    expect(getReview).toHaveBeenCalledWith(14);
    expect(container.textContent).toContain("申请人 14");
  });

  it("keeps the primary review actions in a safe-area bottom bar without a return-list button", async () => {
    const item = review(21, "submitted");
    vi.spyOn(identityApplicationsApi, "listTechnicianReviews").mockResolvedValue({
      list: [item],
      total: 1,
      page: 1,
      page_size: 20
    });
    vi.spyOn(identityApplicationsApi, "getTechnicianReview").mockResolvedValue(item);

    await act(async () => root.render(
      <MemoryRouter><TechnicianApplicationsReviewPage embedded /></MemoryRouter>
    ));
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-application-status="submitted"] button[aria-label^="查看技师"]')?.click();
    });
    await flush();

    const content = container.querySelector('[data-testid="technician-application-detail-content"]');
    const actions = container.querySelector('[data-testid="technician-application-floating-actions"]');
    const actionShell = actions?.closest(".fixed");

    expect(content?.className).toContain("safe-area-inset-bottom");
    expect(actionShell?.className).toContain("fixed");
    expect(actionShell?.className).toContain("bottom-0");
    expect(actionShell?.className).toContain("safe-area-inset-bottom");
    expect(actions?.textContent).toContain("下载 Excel 简历");
    expect(actions?.textContent).toContain("联系");
    expect(actions?.textContent).toContain("审核通过");
    expect(container.textContent).not.toContain("返回申请列表");
  });
});
