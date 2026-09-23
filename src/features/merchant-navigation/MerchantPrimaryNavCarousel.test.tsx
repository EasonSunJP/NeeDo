// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Language } from "../../i18n/translations";
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

const i18nState = vi.hoisted(() => ({ language: "zh" as Language }));

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({
    language: i18nState.language,
    setLanguage: vi.fn()
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
    i18nState.language = "zh";
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

  it("uses the same four-column, fixed-height shortcut layout as the customer home", async () => {
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
    const section = viewport?.closest("section");
    const firstPage = viewport?.firstElementChild;
    const visibleLinks = firstPage?.querySelectorAll<HTMLAnchorElement>("a") ?? [];
    expect(visibleLinks).toHaveLength(4);
    expect(section?.className).toContain("py-0.5");
    expect(section?.className).not.toContain("border border-line bg-white");
    expect(viewport?.className).toContain("home-quick-actions__viewport");
    expect(firstPage?.className).toContain("home-quick-actions__page");

    visibleLinks.forEach((link) => {
      expect(link.classList).toContain("home-quick-action-card");
      expect(link.classList).toContain("before:hidden");
      expect(link.classList).toContain("flex-col");
      expect(link.classList).toContain("items-center");
      expect(link.classList).toContain("justify-center");
      expect(link.classList).not.toContain("aspect-square");
      expect(link.querySelector(".home-quick-action-card__icon")).not.toBeNull();
      expect(link.querySelector(".home-quick-action-card__label")).not.toBeNull();
    });

    expect(viewport?.querySelectorAll('div[aria-hidden="true"]')).toHaveLength(0);
  });

  it("keeps every viewport paged into groups of at most four modules", async () => {
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
    const pages = Array.from(viewport?.children ?? []);
    const indicators = container.querySelector<HTMLElement>('[data-navigation-page-indicators="true"]');

    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.querySelectorAll("a").length)).toEqual([4, 3]);
    expect(viewport?.className).not.toContain("md:grid-cols-7");
    expect(viewport?.className).not.toContain("md:overflow-visible");
    expect(pages.every((page) => !page.className.includes("md:contents"))).toBe(true);
    expect(indicators?.className).not.toContain("md:hidden");
  });

  it("renders only the active language for each shortcut", async () => {
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

    const appointmentLink = container.querySelector<HTMLAnchorElement>('a[href="/merchant/schedule?tab=appointments"]');
    expect(appointmentLink?.textContent).toBe("预约一览");
    expect(appointmentLink?.textContent).not.toContain("予約一覧");

    for (const [language, expectedLabel] of [
      ["zh-Hant", "預約一覽"],
      ["ja", "予約一覧"],
      ["en", "Reservations"],
      ["ko", "예약 목록"]
    ] as const) {
      i18nState.language = language;
      await act(async () => root.render(
        <MemoryRouter><MerchantPrimaryNavCarousel /></MemoryRouter>
      ));
      expect(appointmentLink?.textContent).toBe(expectedLabel);
    }
  });
});
