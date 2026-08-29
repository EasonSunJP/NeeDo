// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import type {
  BackofficeCarouselScene,
  CarouselDraftReplaceInput,
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
  updateCarouselSlideLocale: vi.fn(),
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

const SLIDE_A = "11111111-1111-4111-8111-111111111111";
const SLIDE_B = "22222222-2222-4222-8222-222222222222";
const MEDIA_A = "a".repeat(64);
const MEDIA_B = "b".repeat(64);
const MEDIA_UPLOADED = "c".repeat(64);

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
      id: SLIDE_A,
      mediaAssetPublicId: MEDIA_A,
      imageUrl: "/media/a.webp",
      sortOrder: 0,
      isEnabled: true,
      visibleFrom: null,
      visibleUntil: null,
      target: { type: "service", serviceId: 41 },
      translations: localeValues("护理服务"),
    },
    {
      id: SLIDE_B,
      mediaAssetPublicId: MEDIA_B,
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

function localeTab(label: string) {
  const match = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ).find((node) => node.textContent === label);
  if (!match) throw new Error(`Missing locale tab: ${label}`);
  return match;
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
    allowedPermissions.add("button:backoffice-content-media-upload");
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
    apiMocks.updateCarouselSlideLocale.mockResolvedValue({
      ...draft,
      lockVersion: 7,
    });
    apiMocks.previewCarousel.mockResolvedValue(draft);
    apiMocks.publishCarousel.mockResolvedValue({
      ...draft,
      status: "published",
      lockVersion: 7,
    });
    apiMocks.scheduleCarousel.mockResolvedValue({
      ...draft,
      status: "scheduled",
      lockVersion: 7,
    });
    apiMocks.disableCarousel.mockResolvedValue({
      ...draft,
      status: "disabled",
      lockVersion: 7,
    });
    apiMocks.rollbackCarousel.mockResolvedValue({
      ...draft,
      releaseId: 82,
      version: 5,
      lockVersion: 1,
    });
    apiMocks.copyCarouselSlideLocaleToAll.mockResolvedValue(draft);
    apiMocks.uploadContentImage.mockResolvedValue({
      publicId: MEDIA_UPLOADED,
      mediaAssetId: 61,
      url: "/media/uploaded.webp",
      mimeType: "image/webp",
      width: 1200,
      height: 640,
      checksumSha256: MEDIA_UPLOADED,
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
    ).toEqual(["日本語", "English", "한국어", "繁體中文", "简体中文"]);
    await click(localeTab("English"));
    expect(container.textContent).toContain(
      "来自简体中文的初始复制，尚未人工校对",
    );
  });

  it("keeps locale edits independent and copies only after explicit confirmation", async () => {
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    await click(localeTab("English"));
    const englishTitle = container.querySelector<HTMLInputElement>(
      'input[name="title"]',
    )!;
    await setValue(englishTitle, "Edited English");
    await click(localeTab("日本語"));
    expect(
      container.querySelector<HTMLInputElement>('input[name="title"]')?.value,
    ).toBe("护理服务-ja");
    await click(localeTab("English"));
    expect(
      container.querySelector<HTMLInputElement>('input[name="title"]')?.value,
    ).toBe("Edited English");

    await click(button("复制当前语言到其他语言"));
    expect(window.confirm).toHaveBeenCalled();
    expect(apiMocks.updateCarouselSlideLocale).toHaveBeenCalled();
    expect(
      apiMocks.updateCarouselSlideLocale.mock.invocationCallOrder[0],
    ).toBeLessThan(
      apiMocks.copyCarouselSlideLocaleToAll.mock.invocationCallOrder[0],
    );
    expect(apiMocks.copyCarouselSlideLocaleToAll).toHaveBeenCalledWith(
      "user-home",
      81,
      SLIDE_A,
      {
        expectedLockVersion: 7,
        sourceLocale: "en",
      },
    );
  });

  it("uploads a raw image, searches typed targets on the server with pagination, and reorders slides", async () => {
    apiMocks.searchCarouselTargets.mockResolvedValue({
      list: [
        {
          type: "service",
          publicId: "4f3d7460-73dc-4b79-bc88-4b1bbfb501a4",
          label: "正式护理服务",
          status: "published",
          target: {
            type: "service",
            publicId: "4f3d7460-73dc-4b79-bc88-4b1bbfb501a4",
          },
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

    await click(container.querySelector(`[aria-label="下移 ${SLIDE_A}"]`)!);
    expect(
      container
        .querySelectorAll('[data-testid="carousel-slide-card"]')[0]
        .getAttribute("data-slide-id"),
    ).toBe(SLIDE_B);
  });

  it("previews, saves the complete structural draft, and publishes with the saved lock", async () => {
    const reviewedDraft = {
      ...draft,
      slides: draft.slides.map((slide) => ({
        ...slide,
        translations: Object.fromEntries(
          Object.entries(slide.translations).map(([locale, value]) => [
            locale,
            { ...value, sourceLocale: locale, isInitialCopy: false },
          ]),
        ) as CarouselRelease["slides"][number]["translations"],
      })),
    };
    apiMocks.getBackofficeCarouselScene.mockResolvedValue({
      ...scene,
      draft: reviewedDraft,
    });
    apiMocks.replaceCarouselDraft.mockResolvedValue({
      ...reviewedDraft,
      lockVersion: 7,
      slides: [...reviewedDraft.slides].reverse().map((slide, sortOrder) => ({
        ...slide,
        sortOrder,
      })),
    });
    apiMocks.publishCarousel.mockResolvedValue({
      ...reviewedDraft,
      status: "published",
      lockVersion: 8,
    });
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

    await click(container.querySelector(`[aria-label="下移 ${SLIDE_A}"]`)!);
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
    for (const slide of savedBody.slides) {
      for (const translation of slide.translations) {
        expect(translation).toEqual(
          expect.objectContaining({
            sourceLocale: translation.locale,
            isInitialCopy: false,
          }),
        );
      }
    }

    await click(button("立即发布"));
    await waitFor(() =>
      expect(apiMocks.publishCarousel).toHaveBeenCalledWith(
        "user-home",
        81,
        expect.objectContaining({ expectedLockVersion: 7 }),
      ),
    );
    expect(apiMocks.getBackofficeCarouselScene).toHaveBeenCalledTimes(2);
  });

  it("blocks structural replacement while any untouched locale still carries initial-copy provenance", async () => {
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    await click(container.querySelector(`[aria-label="下移 ${SLIDE_A}"]`)!);
    await click(button("保存草稿"));
    await waitFor(() =>
      expect(container.textContent).toContain(
        "保存轮播结构前，请先逐一校对所有初始复制语言",
      ),
    );
    expect(apiMocks.replaceCarouselDraft).not.toHaveBeenCalled();
  });

  it("preserves explicit copy-to-all provenance through upload, reorder, and structural save", async () => {
    const reviewedDraft = {
      ...draft,
      slides: draft.slides.map((slide) =>
        slide.id === SLIDE_B
          ? {
              ...slide,
              translations: Object.fromEntries(
                Object.entries(slide.translations).map(([locale, value]) => [
                  locale,
                  { ...value, sourceLocale: locale, isInitialCopy: false },
                ]),
              ) as CarouselRelease["slides"][number]["translations"],
            }
          : slide,
      ),
    };
    const copiedDraft = {
      ...reviewedDraft,
      lockVersion: 7,
      slides: reviewedDraft.slides.map((slide) =>
        slide.id === SLIDE_A
          ? {
              ...slide,
              translations: Object.fromEntries(
                Object.entries(slide.translations).map(([locale, value]) => [
                  locale,
                  { ...value, sourceLocale: "en", isInitialCopy: false },
                ]),
              ) as CarouselRelease["slides"][number]["translations"],
            }
          : slide,
      ),
    };
    apiMocks.getBackofficeCarouselScene.mockResolvedValue({
      ...scene,
      draft: reviewedDraft,
    });
    apiMocks.copyCarouselSlideLocaleToAll.mockResolvedValue(copiedDraft);
    apiMocks.replaceCarouselDraft.mockResolvedValue({
      ...copiedDraft,
      lockVersion: 8,
      slides: [...copiedDraft.slides].reverse().map((slide, sortOrder) => ({
        ...slide,
        sortOrder,
      })),
    });
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    await click(localeTab("English"));
    await click(button("复制当前语言到其他语言"));
    await waitFor(() =>
      expect(apiMocks.copyCarouselSlideLocaleToAll).toHaveBeenCalled(),
    );

    const image = new File(["replacement"], "replacement.webp", {
      type: "image/webp",
    });
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [image],
    });
    await act(async () =>
      fileInput.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await click(container.querySelector(`[aria-label="下移 ${SLIDE_A}"]`)!);
    await click(button("保存草稿"));

    await waitFor(() =>
      expect(apiMocks.replaceCarouselDraft).toHaveBeenCalled(),
    );
    const body = apiMocks.replaceCarouselDraft.mock
      .calls[0][2] as CarouselDraftReplaceInput;
    expect(body.expectedLockVersion).toBe(7);
    expect(body.slides[0].publicId).toBe(SLIDE_B);
    expect(body.slides[1].mediaAssetPublicId).toBe(MEDIA_UPLOADED);
    expect(body.slides[0].translations).toEqual(
      expect.arrayContaining(
        ["zh-CN", "zh-TW", "en", "ja", "ko"].map((locale) =>
          expect.objectContaining({
            locale,
            sourceLocale: locale,
            isInitialCopy: false,
          }),
        ),
      ),
    );
    expect(body.slides[1].translations).toEqual(
      expect.arrayContaining(
        ["zh-CN", "zh-TW", "en", "ja", "ko"].map((locale) =>
          expect.objectContaining({
            locale,
            sourceLocale: "en",
            isInitialCopy: false,
          }),
        ),
      ),
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
    apiMocks.updateCarouselSlideLocale
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

  it("bootstraps a published-only scene by cloning an explicitly selected historical release", async () => {
    const publishedOnly = { ...scene, draft: null };
    const clonedDraft = { ...draft, lockVersion: 1 };
    apiMocks.getBackofficeCarouselScene
      .mockResolvedValueOnce(publishedOnly)
      .mockResolvedValueOnce({ ...publishedOnly, draft: clonedDraft });
    apiMocks.getCarouselHistory.mockResolvedValue({
      list: [scene.published],
      total: 1,
      page: 1,
      page_size: 20,
    });
    apiMocks.rollbackCarousel.mockResolvedValue(clonedDraft);

    await renderEditor();
    await waitFor(() =>
      expect(container.textContent).toContain("从历史版本创建草稿"),
    );
    await setValue(
      container.querySelector<HTMLSelectElement>(
        'select[name="draftSourceReleaseId"]',
      )!,
      "80",
    );
    await setValue(
      container.querySelector<HTMLInputElement>('input[name="cloneReason"]')!,
      "继续编辑已发布版本",
    );
    await click(button("创建新草稿"));

    await waitFor(() =>
      expect(apiMocks.rollbackCarousel).toHaveBeenCalledWith(
        "user-home",
        80,
        expect.objectContaining({
          expectedCurrentVersion: 3,
          reason: "继续编辑已发布版本",
        }),
      ),
    );
    expect(apiMocks.getBackofficeCarouselScene).toHaveBeenCalledTimes(2);
  });

  it("supports a genuinely empty scene with an explicit first-slide draft bootstrap", async () => {
    const firstDraft = {
      ...draft,
      releaseId: 1,
      version: 1,
      lockVersion: 1,
      sourceReleaseId: null,
    };
    apiMocks.getBackofficeCarouselScene
      .mockResolvedValueOnce({
        scene: "USER_HOME",
        draft: null,
        published: null,
        scheduled: null,
      })
      .mockResolvedValueOnce({
        scene: "USER_HOME",
        draft: firstDraft,
        published: null,
        scheduled: null,
      });
    apiMocks.getCarouselHistory.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 20,
    });
    apiMocks.searchCarouselTargets.mockResolvedValue({
      list: [
        {
          type: "service",
          publicId: "4f3d7460-73dc-4b79-bc88-4b1bbfb501a4",
          label: "正式护理服务",
          status: "published",
          target: {
            type: "service",
            publicId: "4f3d7460-73dc-4b79-bc88-4b1bbfb501a4",
          },
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
    });
    apiMocks.createCarouselDraft.mockResolvedValue(firstDraft);

    await renderEditor();
    await waitFor(() =>
      expect(container.textContent).toContain("创建首个草稿"),
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="bootstrapTitle"]',
      )!,
      "首个正式轮播",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="bootstrapImageAlt"]',
      )!,
      "首个轮播图说明",
    );
    const file = new File(["raw"], "first.webp", { type: "image/webp" });
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[name="bootstrapMedia"]',
    )!;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file],
    });
    await act(async () =>
      fileInput.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await click(button("搜索目标"));
    await waitFor(() =>
      expect(container.textContent).toContain("正式护理服务"),
    );
    await click(button("正式护理服务"));
    await click(button("创建首个草稿"));

    await waitFor(() =>
      expect(apiMocks.createCarouselDraft).toHaveBeenCalledWith(
        "user-home",
        expect.objectContaining({
          sourceLocale: "zh-CN",
          slides: [
            expect.objectContaining({
              mediaAssetPublicId: MEDIA_UPLOADED,
              translations: [
                expect.objectContaining({
                  locale: "zh-CN",
                  title: "首个正式轮播",
                  imageAltText: "首个轮播图说明",
                }),
              ],
            }),
          ],
        }),
      ),
    );
  });

  it("saves dirty locale text through the per-locale contract and keeps untouched provenance", async () => {
    apiMocks.updateCarouselSlideLocale.mockResolvedValue({
      ...draft,
      lockVersion: 7,
      slides: draft.slides.map((slide) =>
        slide.id === SLIDE_A
          ? {
              ...slide,
              translations: {
                ...slide.translations,
                en: {
                  ...slide.translations.en,
                  title: "Edited English",
                  sourceLocale: "en",
                  isInitialCopy: false,
                },
              },
            }
          : slide,
      ),
    });
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    await click(localeTab("English"));
    await setValue(
      container.querySelector<HTMLInputElement>('input[name="title"]')!,
      "Edited English",
    );
    await click(button("保存草稿"));

    await waitFor(() =>
      expect(apiMocks.updateCarouselSlideLocale).toHaveBeenCalledWith(
        "user-home",
        81,
        SLIDE_A,
        "en",
        expect.objectContaining({
          expectedLockVersion: 6,
          title: "Edited English",
        }),
      ),
    );
    expect(apiMocks.replaceCarouselDraft).not.toHaveBeenCalled();
    expect(
      apiMocks.updateCarouselSlideLocale.mock.calls[0][4],
    ).not.toHaveProperty("sourceLocale");
  });

  it("saves dirty input before publishing and reloads the authoritative scene", async () => {
    apiMocks.updateCarouselSlideLocale.mockResolvedValue({
      ...draft,
      lockVersion: 7,
    });
    apiMocks.publishCarousel.mockResolvedValue({
      ...draft,
      status: "published",
      lockVersion: 8,
    });
    apiMocks.getBackofficeCarouselScene
      .mockResolvedValueOnce(scene)
      .mockResolvedValueOnce({ ...scene, draft: null });
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    await setValue(
      container.querySelector<HTMLInputElement>('input[name="title"]')!,
      "发布前保存",
    );
    await click(button("立即发布"));
    await waitFor(() => expect(apiMocks.publishCarousel).toHaveBeenCalled());
    expect(
      apiMocks.updateCarouselSlideLocale.mock.invocationCallOrder[0],
    ).toBeLessThan(apiMocks.publishCarousel.mock.invocationCallOrder[0]);
    expect(apiMocks.publishCarousel).toHaveBeenCalledWith(
      "user-home",
      81,
      expect.objectContaining({ expectedLockVersion: 7 }),
    );
    expect(apiMocks.getBackofficeCarouselScene).toHaveBeenCalledTimes(2);
  });

  it("saves dirty input before scheduling and uses the reconciled lock version", async () => {
    const scheduledRelease = {
      ...draft,
      status: "scheduled" as const,
      lockVersion: 8,
      publishAt: "2026-09-01T00:00:00.000Z",
    };
    apiMocks.updateCarouselSlideLocale.mockResolvedValue({
      ...draft,
      lockVersion: 7,
    });
    apiMocks.scheduleCarousel.mockResolvedValue(scheduledRelease);
    apiMocks.getBackofficeCarouselScene
      .mockResolvedValueOnce(scene)
      .mockResolvedValueOnce({
        ...scene,
        draft: null,
        scheduled: scheduledRelease,
      });
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    await setValue(
      container.querySelector<HTMLInputElement>('input[name="title"]')!,
      "定时前保存",
    );
    await setValue(
      container.querySelector<HTMLInputElement>('input[name="publishAt"]')!,
      "2026-09-01T09:00",
    );
    await click(button("定时发布"));
    await waitFor(() => expect(apiMocks.scheduleCarousel).toHaveBeenCalled());
    expect(
      apiMocks.updateCarouselSlideLocale.mock.invocationCallOrder[0],
    ).toBeLessThan(apiMocks.scheduleCarousel.mock.invocationCallOrder[0]);
    expect(apiMocks.scheduleCarousel).toHaveBeenCalledWith(
      "user-home",
      81,
      expect.objectContaining({
        expectedLockVersion: 7,
        publishAt: expect.any(String),
      }),
    );
    await waitFor(() =>
      expect(container.textContent).toContain("从历史版本创建草稿"),
    );
  });

  it("stops preview when the required dirty save fails", async () => {
    apiMocks.updateCarouselSlideLocale.mockRejectedValue(new Error("offline"));
    apiMocks.replaceCarouselDraft.mockRejectedValue(new Error("offline"));
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    await setValue(
      container.querySelector<HTMLInputElement>('input[name="title"]')!,
      "未保存标题",
    );
    await click(button("预览"));
    await waitFor(() =>
      expect(
        apiMocks.updateCarouselSlideLocale.mock.calls.length +
          apiMocks.replaceCarouselDraft.mock.calls.length,
      ).toBeGreaterThan(0),
    );
    await waitFor(() =>
      expect(container.textContent).toContain("保存失败，页面内输入已保留"),
    );
    expect(apiMocks.previewCarousel).not.toHaveBeenCalled();
  });

  it("adds, deletes, and enables slides, then reconciles lifecycle mutations from the authoritative scene", async () => {
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    await click(button("添加轮播项"));
    expect(
      container.querySelectorAll('[data-testid="carousel-slide-card"]'),
    ).toHaveLength(3);
    await click(button("停用此轮播项"));
    expect(
      container.querySelector<HTMLInputElement>('input[name="slideEnabled"]')
        ?.checked,
    ).toBe(false);
    await click(button("删除此轮播项"));
    expect(
      container.querySelectorAll('[data-testid="carousel-slide-card"]'),
    ).toHaveLength(2);
  });

  it("disables the selected active slot and rolls back the selected historical release", async () => {
    const scheduled = {
      ...draft,
      releaseId: 82,
      version: 5,
      status: "scheduled" as const,
      lockVersion: 2,
    };
    const historical = {
      ...draft,
      releaseId: 70,
      version: 1,
      status: "archived" as const,
      lockVersion: 4,
    };
    const withoutDraft = { ...scene, draft: null, scheduled };
    apiMocks.getBackofficeCarouselScene
      .mockResolvedValueOnce(withoutDraft)
      .mockResolvedValue(withoutDraft);
    apiMocks.getCarouselHistory.mockResolvedValue({
      list: [scheduled, scene.published, historical],
      total: 3,
      page: 1,
      page_size: 20,
    });
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("版本操作"));
    await setValue(
      container.querySelector<HTMLSelectElement>(
        'select[name="disableReleaseId"]',
      )!,
      "82",
    );
    await setValue(
      container.querySelector<HTMLInputElement>('input[name="disableReason"]')!,
      "取消定时",
    );
    await click(button("停用当前版本"));
    expect(apiMocks.disableCarousel).toHaveBeenCalledWith(
      "user-home",
      82,
      expect.objectContaining({ expectedLockVersion: 2, reason: "取消定时" }),
    );

    await setValue(
      container.querySelector<HTMLSelectElement>(
        'select[name="rollbackReleaseId"]',
      )!,
      "70",
    );
    await setValue(
      container.querySelector<HTMLInputElement>(
        'input[name="rollbackReason"]',
      )!,
      "恢复历史版本",
    );
    await click(button("回滚所选版本"));
    expect(apiMocks.rollbackCarousel).toHaveBeenCalledWith(
      "user-home",
      70,
      expect.objectContaining({
        expectedCurrentVersion: 5,
        reason: "恢复历史版本",
      }),
    );
  });

  it("gates raw media upload with its dedicated permission", async () => {
    allowedPermissions.delete("button:backoffice-content-media-upload");
    await renderEditor();
    await waitFor(() => expect(container.textContent).toContain("护理服务"));
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).toContain("无媒体上传权限");
  });
});
