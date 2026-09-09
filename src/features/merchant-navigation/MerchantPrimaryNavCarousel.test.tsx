// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identityApplicationsApi } from "../identity-applications/api";
import { MerchantPrimaryNavCarousel } from "./MerchantPrimaryNavCarousel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    canAccessFeature: () => true,
    session: { portal: "merchant" }
  })
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement;
let root: Root;

describe("MerchantPrimaryNavCarousel", () => {
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

  it("shows an unclipped red dot above the staff module for submitted applications", async () => {
    const listReviews = vi.spyOn(identityApplicationsApi, "listTechnicianReviews").mockResolvedValue({
      list: [],
      total: 1,
      page: 1,
      page_size: 1
    });

    await act(async () => root.render(
      <MemoryRouter><MerchantPrimaryNavCarousel /></MemoryRouter>
    ));
    await flush();

    expect(listReviews).toHaveBeenCalledWith({ page: 1, pageSize: 1, status: "submitted" });
    const staffLink = container.querySelector<HTMLAnchorElement>('a[href="/merchant/staff"]');
    const unreadDot = staffLink?.querySelector<HTMLElement>('[aria-label="有新的员工审核申请"]');
    expect(unreadDot).not.toBeNull();
    expect(unreadDot?.className).toContain("bg-red-500");
    expect(unreadDot?.className).toContain("z-30");

    const viewport = container.querySelector<HTMLElement>('[data-testid="merchant-primary-module-viewport"]');
    expect(viewport?.className).toContain("pt-2");

    const testBadge = container.querySelector<HTMLElement>('[aria-label="Test 功能"]');
    expect(testBadge?.className).toContain("z-30");
  });

  it("does not show the staff dot when there are no submitted applications", async () => {
    vi.spyOn(identityApplicationsApi, "listTechnicianReviews").mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 1
    });

    await act(async () => root.render(
      <MemoryRouter><MerchantPrimaryNavCarousel /></MemoryRouter>
    ));
    await flush();

    expect(container.querySelector('[aria-label="有新的员工审核申请"]')).toBeNull();
  });

  it("keeps inactive page indicators visibly distinct instead of transparent", async () => {
    vi.spyOn(identityApplicationsApi, "listTechnicianReviews").mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 1
    });

    await act(async () => root.render(
      <MemoryRouter><MerchantPrimaryNavCarousel /></MemoryRouter>
    ));
    await flush();

    const indicators = container.querySelectorAll<HTMLButtonElement>('[data-navigation-page-indicator]');
    expect(indicators).toHaveLength(2);
    expect(indicators[0]?.getAttribute("aria-current")).toBe("page");
    expect(indicators[1]?.style.backgroundColor).not.toBe("");
    expect(indicators[1]?.getAttribute("data-navigation-page-state")).toBe("inactive");
  });

  it("keeps actions and empty slots square while preserving the centered bilingual sm layout", async () => {
    vi.spyOn(identityApplicationsApi, "listTechnicianReviews").mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 1
    });

    await act(async () => root.render(
      <MemoryRouter><MerchantPrimaryNavCarousel /></MemoryRouter>
    ));
    await flush();

    const viewport = container.querySelector<HTMLElement>('[data-testid="merchant-primary-module-viewport"]');
    const firstPage = viewport?.firstElementChild;
    const visibleLinks = firstPage?.querySelectorAll<HTMLAnchorElement>("a") ?? [];
    expect(visibleLinks).toHaveLength(4);

    visibleLinks.forEach((link) => {
      expect(link.classList).toContain("aspect-square");
      expect(link.classList).toContain("before:hidden");
      expect(link.classList).toContain("grid-rows-[30px_auto]");
      expect(link.classList).toContain("content-center");
      expect(link.classList).toContain("gap-1");
      expect(link.classList).toContain("py-1.5");
      expect(link.classList).not.toContain("h-[76px]");
      expect(link.classList).not.toContain("sm:min-h-[82px]");
      expect(link.classList).toContain("sm:grid-rows-[34px_auto]");
      expect(link.classList).toContain("sm:content-center");
      expect(link.classList).not.toContain("sm:grid-rows-[34px_1fr]");
      expect(link.classList).toContain("sm:gap-1.5");
      expect(link.classList).toContain("sm:py-3");
    });

    const mobileEmptySlots = viewport?.querySelectorAll<HTMLDivElement>(
      ':scope > div:nth-child(2) > div[aria-hidden="true"]',
    ) ?? [];
    expect(mobileEmptySlots).toHaveLength(1);
    mobileEmptySlots.forEach((slot) => {
      expect(slot.classList).toContain("aspect-square");
      expect(slot.classList).not.toContain("h-[76px]");
      expect(slot.classList).not.toContain("sm:min-h-[82px]");
    });
  });
});
