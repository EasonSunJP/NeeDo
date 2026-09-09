// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CarouselRelease,
  ContentLocaleCode,
} from "../../api/contentPublication";
import { UserHomeCarouselWorkspace } from "./UserHomeCarouselWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh" }),
}));

const localeCopy = (title: string) => ({
  mediaAssetPublicId: null,
  imageUrl: "",
  badge: "精选",
  title,
  caption: `${title}说明`,
  ctaLabel: "查看",
  imageAltText: `${title}图片`,
  sourceLocale: "zh-CN" as const,
  isInitialCopy: false,
});

function release(
  status: CarouselRelease["status"],
  titlePrefix: string,
): CarouselRelease {
  return {
    scene: "USER_HOME",
    releaseId: status === "published" ? 40 : 41,
    version: status === "published" ? 4 : 5,
    status,
    lockVersion: 2,
    publishAt: null,
    activatedAt:
      status === "published" ? "2026-09-08T03:20:00.000Z" : null,
    disabledAt: null,
    archivedAt: null,
    sourceReleaseId: status === "draft" ? 40 : null,
    slides: [0, 1].map((sortOrder) => ({
      id: `${status}-${sortOrder}`,
      defaultMediaAssetPublicId: String(sortOrder + 1).repeat(64),
      defaultImageUrl: `/media/${status}-${sortOrder}.webp`,
      sortOrder,
      isEnabled: true,
      visibleFrom: null,
      visibleUntil: null,
      target: { type: "none" },
      translations: {
        "zh-CN": localeCopy(`${titlePrefix}${sortOrder + 1}`),
        "zh-TW": localeCopy(`${titlePrefix}${sortOrder + 1}-繁`),
        en: localeCopy(`${titlePrefix}${sortOrder + 1}-en`),
        ja: localeCopy(`${titlePrefix}${sortOrder + 1}-ja`),
        ko: localeCopy(`${titlePrefix}${sortOrder + 1}-ko`),
      },
    })),
    createdAt: "2026-09-08T03:00:00.000Z",
    updatedAt: "2026-09-08T03:20:00.000Z",
  };
}

let container: HTMLDivElement;
let root: Root;

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("UserHomeCarouselWorkspace", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("reuses the homepage carousel and pauses after selecting a slide", async () => {
    const onSelectedIndexChange = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter>
          <UserHomeCarouselWorkspace
            draft={release("draft", "新内容")}
            locale="zh-CN"
            onLocaleChange={vi.fn()}
            onSelectedIndexChange={onSelectedIndexChange}
            published={release("published", "当前内容")}
            selectedIndex={0}
          >
            <p>正式编辑控件</p>
          </UserHomeCarouselWorkspace>
        </MemoryRouter>,
      );
    });

    const carousel = container.querySelector(
      '[data-testid="feature-carousel"]',
    );
    expect(carousel).not.toBeNull();
    expect(carousel?.getAttribute("data-auto-rotate")).toBe("running");

    const previewSlides = carousel!.querySelectorAll("button");
    await click(previewSlides[1]);

    expect(onSelectedIndexChange).toHaveBeenCalledWith(1);
    expect(carousel?.getAttribute("data-auto-rotate")).toBe("paused");
    expect(container.textContent).toContain("当前内容2");
    expect(container.textContent).toContain("新内容2");
  });

  it("shows five language shortcuts, publication time, replacement flow, and image lightbox", async () => {
    const onLocaleChange = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter>
          <UserHomeCarouselWorkspace
            draft={release("draft", "新内容")}
            getTargetLabel={(slide) =>
              slide.id.startsWith("published") ? "当前目标" : "新目标"
            }
            locale={"zh-CN" satisfies ContentLocaleCode}
            onLocaleChange={onLocaleChange}
            onSelectedIndexChange={vi.fn()}
            published={release("published", "当前内容")}
            selectedIndex={0}
          >
            <p>正式编辑控件</p>
          </UserHomeCarouselWorkspace>
        </MemoryRouter>,
      );
    });

    expect(
      Array.from(container.querySelectorAll('[role="tab"]')).map(
        (node) => node.textContent,
      ),
    ).toEqual(["日本語", "English", "한국어", "繁體中文", "简体中文"]);
    expect(container.textContent).toContain("上次发布");
    expect(container.textContent).toContain("2026");
    expect(
      container.querySelector('[data-testid="carousel-replacement-arrow"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("将替换为以下内容");
    expect(container.textContent).toContain("正式编辑控件");
    const currentPanel = container.querySelector(
      '[data-testid="published-carousel-preview"]',
    );
    expect(currentPanel?.textContent).toContain("精选");
    expect(currentPanel?.textContent).toContain("查看");
    expect(currentPanel?.textContent).toContain("当前目标");
    expect(
      container.querySelector('[data-testid="draft-carousel-preview"]')
        ?.textContent,
    ).toContain("新目标");

    await click(
      container.querySelector(
        'button[aria-label="查看大图：当前内容1图片"]',
      )!,
    );

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(
      "/media/published-0.webp",
    );

    await click(container.querySelector('button[role="tab"]')!);
    expect(onLocaleChange).toHaveBeenCalledWith("ja");
  });

  it("maps visible preview clicks back to the full draft order when disabled slides are hidden", async () => {
    const onSelectedIndexChange = vi.fn();
    const draftWithFirstDisabled = release("draft", "新内容");
    draftWithFirstDisabled.slides[0].isEnabled = false;

    await act(async () => {
      root.render(
        <MemoryRouter>
          <UserHomeCarouselWorkspace
            draft={draftWithFirstDisabled}
            locale="zh-CN"
            onLocaleChange={vi.fn()}
            onSelectedIndexChange={onSelectedIndexChange}
            published={release("published", "当前内容")}
            selectedIndex={0}
          >
            <p>正式编辑控件</p>
          </UserHomeCarouselWorkspace>
        </MemoryRouter>,
      );
    });

    const visiblePreview = container.querySelector(
      '[data-testid="feature-carousel"] button',
    );
    await click(visiblePreview!);

    expect(onSelectedIndexChange).toHaveBeenCalledWith(1);
    expect(container.textContent).toContain("当前内容2");
    expect(container.textContent).toContain("新内容2");
  });
});
