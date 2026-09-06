// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantApplicationsReviewPage } from "./ReviewPages";
import { identityApplicationsApi, type MerchantReview } from "./api";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

vi.mock("../../components/client-ui/SettingsDirectory", () => ({
  SettingsDetailPage: ({ children, title }: { children: ReactNode; title: string }) => (
    <main><h1>{title}</h1>{children}</main>
  )
}));

const review: MerchantReview = {
  applicationId: 31,
  applicantUserId: 5,
  status: "submitted",
  version: 1,
  submittedAt: "2026-09-06T01:00:00.000Z",
  createdAt: "2026-09-05T01:00:00.000Z",
  applicantKind: "individual",
  corporateLegalName: null,
  corporateLegalNameKana: null,
  representativeName: "申请人",
  representativeNameKana: "シンセイニン",
  shopName: "新宿店",
  businessAddress: "Tokyo",
  contactPhone: "+819000000000",
  responsiblePersonName: "申请人",
  showcaseDraft: null,
  serviceCategories: [],
  businessKeywords: [],
  bankAccount: null,
  eKycVerified: true,
  contractAcceptance: null,
  media: []
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement;
let root: Root;

describe("MerchantApplicationsReviewPage pending deep links", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(identityApplicationsApi, "listMerchantReviews").mockImplementation(({ status } = {}) =>
      Promise.resolve({
        list: status === "submitted" ? [review] : [],
        total: status === "submitted" ? 3 : 2,
        page: 1,
        page_size: 20
      })
    );
    vi.spyOn(identityApplicationsApi, "getMerchantReview").mockResolvedValue(review);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("loads both reviewable statuses and opens the requested application", async () => {
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/admin/merchant-applications?status=pending&applicationId=31"]}>
        <MerchantApplicationsReviewPage />
        <LocationProbe />
      </MemoryRouter>
    ));
    await flush();

    expect(identityApplicationsApi.listMerchantReviews).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "submitted"
    });
    expect(identityApplicationsApi.listMerchantReviews).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "under_review"
    });
    expect(identityApplicationsApi.getMerchantReview).toHaveBeenCalledWith(31);
    expect(container.textContent).toContain("新宿店");

    const back = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("返回申请列表")
    )!;
    await act(async () => back.click());
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/admin/merchant-applications?status=pending"
    );
    expect(container.textContent).toContain("待审核共 5 条");
  });
});
