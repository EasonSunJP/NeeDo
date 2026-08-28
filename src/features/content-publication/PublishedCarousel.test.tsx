// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedCarouselPayload } from "../../api/contentPublication";
import { PublishedCarousel } from "./PublishedCarousel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getAffiliateCarousel: vi.fn(),
  getUserHomeCarousel: vi.fn()
}));

vi.mock("../../api/contentPublication", async () => {
  const actual = await vi.importActual<typeof import("../../api/contentPublication")>(
    "../../api/contentPublication"
  );
  return { ...actual, contentPublicationApi: apiMocks };
});

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh" })
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

const payload = (
  scene: PublishedCarouselPayload["scene"],
  target: PublishedCarouselPayload["slides"][number]["target"]
): PublishedCarouselPayload => ({
  scene,
  locale: "zh-CN",
  releaseVersion: 3,
  generatedAt: "2026-08-29T01:00:00.000Z",
  slides: [
    {
      id: "slide-1",
      badge: "精选",
      title: "东京护理",
      caption: "正式发布内容",
      ctaLabel: "查看服务",
      imageAltText: "东京护理服务",
      imageUrl: "/media/content/image.webp",
      target
    }
  ]
});

let container: HTMLDivElement;
let root: Root;

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

async function renderCarousel(scene: "user-home" | "affiliate-home-notice") {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <PublishedCarousel scene={scene} />
        <LocationProbe />
      </MemoryRouter>
    );
  });
}

describe("PublishedCarousel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps a local loading skeleton while the formal request is pending", async () => {
    apiMocks.getUserHomeCarousel.mockReturnValue(new Promise(() => undefined));

    await renderCarousel("user-home");

    expect(container.querySelector('[data-testid="published-carousel-loading"]')).not.toBeNull();
    expect(container.textContent).toContain("正在读取轮播内容");
    expect(apiMocks.getUserHomeCarousel).toHaveBeenCalledWith("zh-CN");
  });

  it("isolates a rejected request and retries without throwing through the page", async () => {
    apiMocks.getUserHomeCarousel
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(payload("USER_HOME", { type: "service", publicId: "service-1" }));

    await renderCarousel("user-home");
    await waitFor(() => expect(container.textContent).toContain("轮播内容读取失败"));

    const retry = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("重试")
    );
    expect(retry).not.toBeUndefined();
    await act(async () => retry?.click());

    await waitFor(() => expect(container.textContent).toContain("东京护理"));
    expect(apiMocks.getUserHomeCarousel).toHaveBeenCalledTimes(2);
  });

  it("renders an explicit empty state rather than production fallback slides", async () => {
    apiMocks.getAffiliateCarousel.mockResolvedValue({
      ...payload("AFFILIATE_HOME_NOTICE", {
        type: "affiliate_announcement",
        publicId: "announcement-1"
      }),
      slides: []
    });

    await renderCarousel("affiliate-home-notice");

    await waitFor(() => expect(container.textContent).toContain("暂无轮播内容"));
    expect(container.querySelector("img")).toBeNull();
  });

  it("passes API slides to FeatureCarousel and navigates a user-home target", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue(
      payload("USER_HOME", {
        type: "service",
        publicId: "46969a0f-2c2c-4b7b-b986-88e406393255"
      })
    );

    await renderCarousel("user-home");
    await waitFor(() => expect(container.textContent).toContain("东京护理"));

    const slide = container.querySelector<HTMLAnchorElement>('a[href*="/services/"]');
    expect(slide?.getAttribute("href")).toBe(
      "/services/46969a0f-2c2c-4b7b-b986-88e406393255"
    );
    await act(async () =>
      slide?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    );
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/services/46969a0f-2c2c-4b7b-b986-88e406393255"
    );
  });

  it("uses the affiliate announcement route for the affiliate scene", async () => {
    apiMocks.getAffiliateCarousel.mockResolvedValue(
      payload("AFFILIATE_HOME_NOTICE", {
        type: "affiliate_announcement",
        publicId: "a notice/with space"
      })
    );

    await renderCarousel("affiliate-home-notice");
    await waitFor(() => expect(container.textContent).toContain("东京护理"));

    expect(container.querySelector<HTMLAnchorElement>("a")?.getAttribute("href")).toBe(
      "/afirieito/announcements/a%20notice%2Fwith%20space"
    );
  });
});
