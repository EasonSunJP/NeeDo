// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedCarouselPayload } from "../../api/contentPublication";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { PublishedCarousel } from "./PublishedCarousel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getAffiliateCarousel: vi.fn(),
  getUserHomeCarousel: vi.fn()
}));

const i18nMock = vi.hoisted(() => ({ language: "zh" as "zh" | "zh-Hant" | "ja" | "en" | "ko" }));

vi.mock("../../api/contentPublication", async () => {
  const actual = await vi.importActual<typeof import("../../api/contentPublication")>(
    "../../api/contentPublication"
  );
  return { ...actual, contentPublicationApi: apiMocks };
});

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: i18nMock.language })
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

async function renderCarousel(
  scene: "user-home" | "affiliate-home-notice",
  cardHeightClassName?: string
) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <PublishedCarousel cardHeightClassName={cardHeightClassName} scene={scene} />
        <LocationProbe />
      </MemoryRouter>
    );
  });
}

describe("PublishedCarousel", () => {
  beforeEach(async () => {
    await persistentResourceCache.clearScope("public");
    vi.resetAllMocks();
    i18nMock.language = "zh";
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

  it("renders the cached carousel immediately after a route remount without another server read", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue(
      payload("USER_HOME", { type: "service", publicId: "service-cached" })
    );
    await renderCarousel("user-home");
    await waitFor(() => expect(container.textContent).toContain("东京护理"));

    await act(async () => root.unmount());
    root = createRoot(container);
    apiMocks.getUserHomeCarousel.mockReturnValue(new Promise(() => undefined));
    await renderCarousel("user-home");

    expect(container.textContent).toContain("东京护理");
    expect(container.querySelector('[data-testid="published-carousel-loading"]')).toBeNull();
    expect(apiMocks.getUserHomeCarousel).toHaveBeenCalledTimes(1);
  });

  it("preserves the requested height while the formal request is loading", async () => {
    apiMocks.getUserHomeCarousel.mockReturnValue(new Promise(() => undefined));

    await renderCarousel("user-home", "h-[204px]");

    expect(
      container.querySelector('[data-testid="published-carousel-loading"].h\\-\\[204px\\]')
    ).not.toBeNull();
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

  it("preserves the requested height in the isolated error state", async () => {
    apiMocks.getUserHomeCarousel.mockRejectedValue(new Error("offline"));

    await renderCarousel("user-home", "h-[204px]");
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="published-carousel-error"].h\\-\\[204px\\]')
      ).not.toBeNull()
    );
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

  it("preserves the requested height in the explicit empty state", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue({
      ...payload("USER_HOME", { type: "service", publicId: "service-1" }),
      slides: []
    });

    await renderCarousel("user-home", "h-[204px]");
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="published-carousel-empty"].h\\-\\[204px\\]')
      ).not.toBeNull()
    );
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

    expect(container.querySelector('section[data-no-i18n="true"]')).not.toBeNull();
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

  it("renders a none target without a card link or CTA and leaves the route unchanged", async () => {
    const welcome = payload("USER_HOME", { type: "none" });
    welcome.slides[0].ctaLabel = null;
    apiMocks.getUserHomeCarousel.mockResolvedValue(welcome);

    await renderCarousel("user-home");
    await waitFor(() => expect(container.textContent).toContain("东京护理"));

    expect(container.querySelector("a[href]")).toBeNull();
    expect(
      container.querySelector('[data-feature-carousel-cta="true"]'),
    ).toBeNull();
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/",
    );
  });

  it("passes an explicit card height through to the shared carousel", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue(
      payload("USER_HOME", {
        type: "service",
        publicId: "46969a0f-2c2c-4b7b-b986-88e406393255"
      })
    );

    await renderCarousel("user-home", "h-[204px]");
    await waitFor(() => expect(container.textContent).toContain("东京护理"));

    expect(container.querySelector(".h\\-\\[204px\\]")).not.toBeNull();
  });

  it("preserves the API image alt and explicit no-CTA semantics", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue({
      ...payload("USER_HOME", {
        type: "service",
        publicId: "46969a0f-2c2c-4b7b-b986-88e406393255"
      }),
      slides: [
        {
          ...payload("USER_HOME", { type: "service", publicId: "service-1" }).slides[0],
          ctaLabel: null,
          imageAltText: "施術室を準備するスタッフ"
        }
      ]
    });

    await renderCarousel("user-home");
    await waitFor(() => expect(container.textContent).toContain("东京护理"));

    expect(container.querySelector("img")?.getAttribute("alt")).toBe("施術室を準備するスタッフ");
    expect(container.textContent).not.toContain("查看详情");
  });

  it("starts a fresh locale request and ignores the older locale response", async () => {
    let resolveChinese!: (value: PublishedCarouselPayload) => void;
    apiMocks.getUserHomeCarousel
      .mockReturnValueOnce(
        new Promise<PublishedCarouselPayload>((resolve) => {
          resolveChinese = resolve;
        })
      )
      .mockResolvedValueOnce({
        ...payload("USER_HOME", { type: "service", publicId: "service-ja" }),
        locale: "ja",
        slides: [
          {
            ...payload("USER_HOME", { type: "service", publicId: "service-ja" }).slides[0],
            title: "新しい日本語"
          }
        ]
      });

    await renderCarousel("user-home");
    i18nMock.language = "ja";
    await renderCarousel("user-home");
    await waitFor(() => expect(container.textContent).toContain("新しい日本語"));

    await act(async () =>
      resolveChinese({
        ...payload("USER_HOME", { type: "service", publicId: "service-zh" }),
        slides: [
          {
            ...payload("USER_HOME", { type: "service", publicId: "service-zh" }).slides[0],
            title: "旧中文"
          }
        ]
      })
    );

    expect(apiMocks.getUserHomeCarousel).toHaveBeenNthCalledWith(1, "zh-CN");
    expect(apiMocks.getUserHomeCarousel).toHaveBeenNthCalledWith(2, "ja");
    expect(container.textContent).toContain("新しい日本語");
    expect(container.textContent).not.toContain("旧中文");
  });

  it("starts a fresh scene request and ignores the older scene response", async () => {
    let resolveUser!: (value: PublishedCarouselPayload) => void;
    apiMocks.getUserHomeCarousel.mockReturnValueOnce(
      new Promise<PublishedCarouselPayload>((resolve) => {
        resolveUser = resolve;
      })
    );
    apiMocks.getAffiliateCarousel.mockResolvedValueOnce({
      ...payload("AFFILIATE_HOME_NOTICE", {
        type: "affiliate_announcement",
        publicId: "notice-new"
      }),
      slides: [
        {
          ...payload("AFFILIATE_HOME_NOTICE", {
            type: "affiliate_announcement",
            publicId: "notice-new"
          }).slides[0],
          title: "联盟新公告"
        }
      ]
    });

    await renderCarousel("user-home");
    await renderCarousel("affiliate-home-notice");
    await waitFor(() => expect(container.textContent).toContain("联盟新公告"));
    await act(async () =>
      resolveUser({
        ...payload("USER_HOME", { type: "service", publicId: "service-old" }),
        slides: [
          {
            ...payload("USER_HOME", { type: "service", publicId: "service-old" }).slides[0],
            title: "用户旧轮播"
          }
        ]
      })
    );

    expect(apiMocks.getAffiliateCarousel).toHaveBeenCalledWith("zh-CN");
    expect(container.textContent).toContain("联盟新公告");
    expect(container.textContent).not.toContain("用户旧轮播");
  });

  it("does not update state after unmount when a request settles late", async () => {
    let resolveLate!: (value: PublishedCarouselPayload) => void;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    apiMocks.getUserHomeCarousel.mockReturnValueOnce(
      new Promise<PublishedCarouselPayload>((resolve) => {
        resolveLate = resolve;
      })
    );

    await renderCarousel("user-home");
    await act(async () => root.unmount());
    await act(async () =>
      resolveLate(payload("USER_HOME", { type: "service", publicId: "service-late" }))
    );

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    root = createRoot(container);
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
