// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import type {
  BackofficeCarouselScene,
  CarouselRelease,
} from "../../api/contentPublication";
import { LocalizedCarouselEditor } from "./LocalizedCarouselEditor";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  copyCarouselSlideLocaleToAll: vi.fn(),
  createCarouselDraft: vi.fn(),
  disableCarousel: vi.fn(),
  getBackofficeCarouselScene: vi.fn(),
  getCarouselHistory: vi.fn(),
  previewCarousel: vi.fn(),
  publishCarousel: vi.fn(),
  replaceCarouselDraft: vi.fn(),
  rollbackCarousel: vi.fn(),
  scheduleCarousel: vi.fn(),
  searchCarouselTargets: vi.fn(),
  uploadContentImage: vi.fn(),
}));

const allowedPermissions = vi.hoisted(() => new Set<string>());

vi.mock("../../api/contentPublication", async () => {
  const actual = await vi.importActual<
    typeof import("../../api/contentPublication")
  >("../../api/contentPublication");
  return { ...actual, contentPublicationApi: apiMocks };
});

vi.mock("../../auth/PermissionGate", () => ({
  PermissionGate: ({
    children,
    fallback = null,
    permission,
  }: {
    children: unknown;
    fallback?: unknown;
    permission?: string;
  }) =>
    !permission || allowedPermissions.has(permission) ? children : fallback,
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh" }),
}));

const localeValues = (title: string, isInitialCopy = false) => ({
  "zh-CN": {
    badge: "精选",
    title,
    caption: "说明",
    ctaLabel: "查看",
    imageAltText: "图片说明",
    sourceLocale: "zh-CN" as const,
    isInitialCopy,
  },
  "zh-TW": {
    badge: "精選",
    title: `${title} Traditional`,
    caption: "說明",
    ctaLabel: "查看",
    imageAltText: "圖片說明",
    sourceLocale: "zh-CN" as const,
    isInitialCopy: true,
  },
  en: {
    badge: "Featured",
    title: `${title}-en`,
    caption: "Caption",
    ctaLabel: "View",
    imageAltText: "Image alt",
    sourceLocale: "zh-CN" as const,
    isInitialCopy: true,
  },
  ja: {
    badge: "特集",
    title: `${title}-ja`,
    caption: "説明",
    ctaLabel: "見る",
    imageAltText: "画像説明",
    sourceLocale: "zh-CN" as const,
    isInitialCopy: true,
  },
  ko: {
    badge: "추천",
    title: `${title}-ko`,
    caption: "설명",
    ctaLabel: "보기",
    imageAltText: "이미지 설명",
    sourceLocale: "zh-CN" as const,
    isInitialCopy: true,
  },
});

const draft: CarouselRelease = {
  scene: "USER_HOME",
  releaseId: 81,
  version: 4,
  status: "draft",
  lockVersion: 6,
  publishAt: null,
  activatedAt: null,
  disabledAt: null,
  archivedAt: null,
  sourceReleaseId: 80,
  slides: [
    {
      id: "slide-a",
      mediaAssetPublicId: "media-a",
      imageUrl: "/media/a.webp",
      sortOrder: 0,
      isEnabled: true,
      visibleFrom: null,
      visibleUntil: null,
      target: { type: "service", serviceId: 41 },
      translations: localeValues("护理服务"),
    },
    {
      id: "slide-b",
      mediaAssetPublicId: "media-b",
      imageUrl: "/media/b.webp",
      sortOrder: 1,
      isEnabled: true,
      visibleFrom: null,
      visibleUntil: null,
      target: { type: "shop", shopId: 21 },
      translations: localeValues("东京店铺", true),
    },
  ],
  createdAt: "2026-08-29T01:00:00.000Z",
  updatedAt: "2026-08-29T02:00:00.000Z",
};

const scene: BackofficeCarouselScene = {
  scene: "USER_HOME",
  draft,
  published: {
    ...draft,
    releaseId: 80,
    version: 3,
    status: "published",
    lockVersion: 3,
  },
  scheduled: null,
};

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(
        async () => new Promise((resolve) => window.setTimeout(resolve, 0)),
      );
    }
  }
  throw lastError;
}

async function click(element: Element) {
  await act(async () =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}

async function setValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function button(label: string) {
  const result = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(label),
  );
  if (!result) throw new Error(`Button not found: ${label}`);
  return result;
}

async function renderEditor() {
  await act(async () => {
    root.render(
      <LocalizedCarouselEditor
        editPermission="carousel:edit"
        publishPermission="carousel:publish"
        readPermission="carousel:read"
        scene="user-home"
      />,
    );
  });
}

describe("LocalizedCarouselEditor", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.resetAllMocks();
    allowedPermissions.clear();
    allowedPermissions.add("carousel:read");
    allowedPermissions.add("carousel:edit");
    allowedPermissions.add("carousel:publish");
    apiMocks.getBackofficeCarouselScene.mockResolvedValue(scene);
    apiMocks.getCarouselHistory.mockResolvedValue({
      list: [scene.published],
      total: 1,
      page: 1,
      page_size: 20,
    });
    apiMocks.searchCarouselTargets.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 10,
    });
    apiMocks.replaceCarouselDraft.mockResolvedValue({
      ...draft,
      lockVersion: 7,
    });
    apiMocks.previewCarousel.mockResolvedValue(draft);
    apiMocks.publishCarousel.mockResolvedValue({
      ...draft,
      status: "published",
    });
    apiMocks.scheduleCarousel.mockResolvedValue({
      ...draft,
      status: "scheduled",
    });
    apiMocks.disableCarousel.mockResolvedValue({
      ...draft,
      status: "disabled",
    });
    apiMocks.rollbackCarousel.mockResolvedValue({
      ...draft,
      releaseId: 82,
      version: 5,
    });
    apiMocks.copyCarouselSlideLocaleToAll.mockResolvedValue(draft);
    apiMocks.uploadContentImage.mockResolvedValue({
      publicId: "media-uploaded",
      mediaAssetId: 61,
      url: "/media/uploaded.webp",
      mimeType: "image/webp",
      width: 1200,
      height: 640,
      checksumSha256: "abc",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("loads the server draft and exposes the exact five locale tabs with initial-copy state", async () => {
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));

    expect(apiMocks.getBackofficeCarouselScene).toHaveBeenCalledWith(
      "user-home",
    );
    expect(
      Array.from(container.querySelectorAll('[role="tab"]')).map(
        (node) => node.textContent,
      ),
    ).toEqual(["简体中文", "繁體中文", "English", "日本語", "한국어"]);
    await click(Array.from(container.querySelectorAll('[role="tab"]'))[2]);
    expect(container.textContent).toContain(
      "来自简体中文的初始复制，尚未人工校对",
    );
  });

  it("keeps locale edits independent and copies only after explicit confirmation", async () => {
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    await click(tabs[2]);
    const englishTitle = container.querySelector<HTMLInputElement>(
      'input[name="title"]',
    )!;
    await setValue(englishTitle, "Edited English");
    await click(tabs[3]);
    expect(
      container.querySelector<HTMLInputElement>('input[name="title"]')?.value,
    ).toBe("护理服务-ja");
    await click(tabs[2]);
    expect(
      container.querySelector<HTMLInputElement>('input[name="title"]')?.value,
    ).toBe("Edited English");

    await click(button("复制当前语言到其他语言"));
    expect(window.confirm).toHaveBeenCalled();
    expect(apiMocks.copyCarouselSlideLocaleToAll).toHaveBeenCalledWith(
      "user-home",
      81,
      "slide-a",
      {
        expectedLockVersion: 6,
        sourceLocale: "en",
      },
    );
  });

  it("uploads a raw image, searches typed targets on the server with pagination, and reorders slides", async () => {
    apiMocks.searchCarouselTargets.mockResolvedValue({
      list: [
        {
          type: "service",
          publicId: "svc-1",
          label: "正式护理服务",
          status: "published",
          target: { type: "service", publicId: "svc-1" },
        },
      ],
      total: 11,
      page: 1,
      page_size: 10,
    });
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));

    const file = new File(["raw"], "cover.webp", { type: "image/webp" });
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file],
    });
    await act(async () =>
      fileInput.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await waitFor(() =>
      expect(apiMocks.uploadContentImage).toHaveBeenCalledWith(
        file,
        "图片说明",
      ),
    );
    expect(
      container.querySelector<HTMLImageElement>(
        'img[src="/media/uploaded.webp"]',
      ),
    ).not.toBeNull();

    await setValue(
      container.querySelector<HTMLSelectElement>('select[name="targetType"]')!,
      "service",
    );
    await setValue(
      container.querySelector<HTMLInputElement>('input[name="targetQuery"]')!,
      "护理",
    );
    await click(button("搜索目标"));
    await waitFor(() =>
      expect(apiMocks.searchCarouselTargets).toHaveBeenCalledWith("user-home", {
        page: 1,
        pageSize: 10,
        q: "护理",
        type: "service",
      }),
    );
    expect(container.textContent).toContain("正式护理服务");
    await click(button("下一页"));
    expect(apiMocks.searchCarouselTargets).toHaveBeenLastCalledWith(
      "user-home",
      expect.objectContaining({ page: 2, type: "service" }),
    );

    await click(container.querySelector('[aria-label="下移 slide-a"]')!);
    expect(
      container
        .querySelectorAll('[data-testid="carousel-slide-card"]')[0]
        .getAttribute("data-slide-id"),
    ).toBe("slide-b");
  });

  it("previews, saves the complete draft, and performs lifecycle actions with reasons", async () => {
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    await click(button("预览"));
    await waitFor(() =>
      expect(apiMocks.previewCarousel).toHaveBeenCalledWith("user-home", 81),
    );
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "护理服务",
    );
    await click(button("关闭预览"));

    await click(button("保存草稿"));
    await waitFor(() =>
      expect(apiMocks.replaceCarouselDraft).toHaveBeenCalledWith(
        "user-home",
        81,
        expect.objectContaining({
          expectedLockVersion: 6,
          sourceLocale: "zh-CN",
          slides: expect.any(Array),
        }),
      ),
    );
    const savedBody = apiMocks.replaceCarouselDraft.mock.calls[0][2];
    expect(savedBody).not.toHaveProperty("scene");

    await click(button("立即发布"));
    expect(apiMocks.publishCarousel).toHaveBeenCalledWith(
      "user-home",
      81,
      expect.objectContaining({ expectedLockVersion: 7 }),
    );
    await setValue(
      container.querySelector<HTMLInputElement>('input[name="publishAt"]')!,
      "2026-09-01T09:00",
    );
    await click(button("定时发布"));
    expect(apiMocks.scheduleCarousel).toHaveBeenCalledWith(
      "user-home",
      81,
      expect.objectContaining({ publishAt: expect.any(String) }),
    );

    await setValue(
      container.querySelector<HTMLInputElement>('input[name="disableReason"]')!,
      "活动结束",
    );
    await click(button("停用当前版本"));
    expect(apiMocks.disableCarousel).toHaveBeenCalledWith(
      "user-home",
      81,
      expect.objectContaining({ reason: "活动结束" }),
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="rollbackReason"]',
      )!,
      "恢复稳定版本",
    );
    await click(button("回滚所选版本"));
    expect(apiMocks.rollbackCarousel).toHaveBeenCalledWith(
      "user-home",
      80,
      expect.objectContaining({ reason: "恢复稳定版本" }),
    );
  });

  it("renders a server-backed read-only view when edit and publish permissions are absent", async () => {
    allowedPermissions.delete("carousel:edit");
    allowedPermissions.delete("carousel:publish");
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));

    expect(container.textContent).toContain("只读模式");
    expect(container.textContent).not.toContain("保存草稿");
    expect(container.textContent).not.toContain("立即发布");
    expect(
      container.querySelector<HTMLInputElement>('input[name="title"]')
        ?.readOnly,
    ).toBe(true);
  });

  it("preserves in-memory input after failed save and reloads explicitly after a 409 conflict", async () => {
    apiMocks.replaceCarouselDraft
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(
        new ApiClientError("error.content.lock_conflict", 40901, 409),
      );
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    const title = container.querySelector<HTMLInputElement>(
      'input[name="title"]',
    )!;
    await setValue(title, "尚未保存的输入");
    await click(button("保存草稿"));
    await waitFor(() =>
      expect(container.textContent).toContain("保存失败，页面内输入已保留"),
    );
    expect(
      container.querySelector<HTMLInputElement>('input[name="title"]')?.value,
    ).toBe("尚未保存的输入");

    await click(button("保存草稿"));
    await waitFor(() =>
      expect(container.textContent).toContain("服务器版本已更新"),
    );
    expect(
      container.querySelector<HTMLInputElement>('input[name="title"]')?.value,
    ).toBe("尚未保存的输入");
    await click(button("重新读取服务器草稿"));
    expect(apiMocks.getBackofficeCarouselScene).toHaveBeenCalledTimes(2);
  });
});
