// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CarouselRelease } from "../../api/contentPublication";
import { CarouselReleasePreview } from "./CarouselReleasePreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh" }),
}));

const publishedRelease: CarouselRelease = {
  scene: "USER_HOME",
  releaseId: 4,
  version: 4,
  status: "published",
  lockVersion: 4,
  publishAt: null,
  activatedAt: "2026-09-01T00:00:00.000Z",
  disabledAt: null,
  archivedAt: null,
  sourceReleaseId: null,
  slides: [
    {
      id: "slide-1",
      defaultMediaAssetPublicId: "a".repeat(64),
      defaultImageUrl: "https://media.example.test/default.webp",
      sortOrder: 0,
      isEnabled: true,
      visibleFrom: null,
      visibleUntil: null,
      target: { type: "service", serviceId: 1 },
      translations: {
        "zh-CN": {
          mediaAssetPublicId: null,
          imageUrl: "",
          badge: "精选",
          title: "正式轮播",
          caption: "正式内容",
          ctaLabel: "查看",
          imageAltText: "正式轮播图片",
          sourceLocale: "zh-CN",
          isInitialCopy: false,
        },
        "zh-TW": {
          mediaAssetPublicId: null,
          imageUrl: "",
          badge: "精選",
          title: "正式輪播",
          caption: "正式內容",
          ctaLabel: "查看",
          imageAltText: "正式輪播圖片",
          sourceLocale: "zh-TW",
          isInitialCopy: false,
        },
        en: {
          mediaAssetPublicId: null,
          imageUrl: "",
          badge: "Featured",
          title: "Published carousel",
          caption: "Published content",
          ctaLabel: "View",
          imageAltText: "Published carousel image",
          sourceLocale: "en",
          isInitialCopy: false,
        },
        ja: {
          mediaAssetPublicId: null,
          imageUrl: "",
          badge: "特集",
          title: "公開カルーセル",
          caption: "公開内容",
          ctaLabel: "見る",
          imageAltText: "公開カルーセル画像",
          sourceLocale: "ja",
          isInitialCopy: false,
        },
        ko: {
          mediaAssetPublicId: null,
          imageUrl: "",
          badge: "추천",
          title: "게시된 캐러셀",
          caption: "게시된 콘텐츠",
          ctaLabel: "보기",
          imageAltText: "게시된 캐러셀 이미지",
          sourceLocale: "ko",
          isInitialCopy: false,
        },
      },
    },
  ],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

describe("CarouselReleasePreview", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("projects the selected locale without edit controls", async () => {
    await act(async () => {
      root.render(
        <CarouselReleasePreview locale="zh-CN" release={publishedRelease} />,
      );
    });

    expect(container.textContent).toContain("当前已发布内容");
    expect(container.textContent).toContain("正式轮播");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      publishedRelease.slides[0].defaultImageUrl,
    );
    expect(container.querySelector("input, textarea, select")).toBeNull();
  });
});
