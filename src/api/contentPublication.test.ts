import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import {
  contentPublicationApi,
  type CarouselDraftCreateInput,
  type CarouselDraftReplaceInput,
  type ContentLocaleCode
} from "./contentPublication";
import { toContentLocale } from "../features/content-publication/locales";

vi.mock("./httpClient", () => ({
  httpClient: {
    request: vi.fn()
  }
}));

const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const translation = {
  locale: "ja" as ContentLocaleCode,
  badge: null,
  title: "Tokyo",
  caption: null,
  ctaLabel: null,
  imageAltText: "東京の街並み"
};

const userSlide = {
  mediaAssetPublicId: "a".repeat(64),
  sortOrder: 0,
  isEnabled: true,
  visibleFrom: null,
  visibleUntil: null,
  target: { type: "service" as const, publicId: "46969a0f-2c2c-4b7b-b986-88e406393255" },
  translations: [translation]
};

const affiliateSlide = {
  ...userSlide,
  target: {
    type: "affiliate_announcement" as const,
    announcementPublicId: "46969a0f-2c2c-4b7b-b986-88e406393255",
    affiliateTaskId: null
  }
};

describe("contentPublicationApi", () => {
  beforeEach(() => {
    vi.mocked(httpClient.request).mockReset().mockResolvedValue({});
  });

  it("maps every app language to the canonical content locale", () => {
    expect(toContentLocale("zh")).toBe("zh-CN");
    expect(toContentLocale("zh-Hant")).toBe("zh-TW");
    expect(toContentLocale("ja")).toBe("ja");
    expect(toContentLocale("en")).toBe("en");
    expect(toContentLocale("ko")).toBe("ko");
  });

  it("keeps carousel draft and target-search inputs bound to their fixed scene", async () => {
    const userDraft = {
      idempotencyKey,
      sourceLocale: "ja",
      slides: [userSlide]
    } satisfies CarouselDraftCreateInput<"USER_HOME">;
    const affiliateReplacement = {
      expectedLockVersion: 2,
      sourceLocale: "ja",
      slides: [affiliateSlide]
    } satisfies CarouselDraftReplaceInput<"affiliate-home-notice">;

    await contentPublicationApi.createCarouselDraft("USER_HOME", userDraft);
    await contentPublicationApi.replaceCarouselDraft(
      "affiliate-home-notice",
      81,
      affiliateReplacement
    );
    await contentPublicationApi.searchCarouselTargets("USER_HOME", { type: "technician" });
    await contentPublicationApi.searchCarouselTargets("AFFILIATE_HOME_NOTICE", {
      type: "affiliate_task"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/content/carousels/user-home/releases",
      { body: userDraft, method: "POST" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/content/carousels/affiliate-home-notice/releases/81",
      { body: affiliateReplacement, method: "PATCH" }
    );
  });

  it("rejects draft and search inputs from the other fixed scene at compile time", () => {
    contentPublicationApi.createCarouselDraft("USER_HOME", {
      idempotencyKey,
      sourceLocale: "ja",
      // @ts-expect-error USER_HOME cannot target an Affiliate announcement.
      slides: [affiliateSlide]
    });
    contentPublicationApi.replaceCarouselDraft("AFFILIATE_HOME_NOTICE", 81, {
      expectedLockVersion: 2,
      sourceLocale: "ja",
      // @ts-expect-error Affiliate carousel cannot target a Service.
      slides: [userSlide]
    });
    // @ts-expect-error USER_HOME target search does not accept Affiliate task filters.
    contentPublicationApi.searchCarouselTargets("user-home", { type: "affiliate_task" });
    // @ts-expect-error Affiliate target search does not accept Technician filters.
    contentPublicationApi.searchCarouselTargets("affiliate-home-notice", { type: "technician" });
  });

  it("calls the three public localized endpoints exactly", async () => {
    await contentPublicationApi.getUserHomeCarousel("zh-CN");
    await contentPublicationApi.getAffiliateCarousel("ja");
    await contentPublicationApi.getAffiliateAnnouncement("notice / 1", "ko");

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/content/carousels/user-home", {
      query: { locale: "zh-CN" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/affiliate/content/carousel", {
      query: { locale: "ja" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/affiliate/announcements/notice%20%2F%201",
      { query: { locale: "ko" } }
    );
  });

  it("uses fixed scene paths for carousel reads, history, target search, and release reads", async () => {
    await contentPublicationApi.getBackofficeCarouselScene("user-home");
    await contentPublicationApi.getCarouselHistory("affiliate-home-notice", { page: 2, pageSize: 30 });
    await contentPublicationApi.searchCarouselTargets("USER_HOME", {
      page: 3,
      pageSize: 15,
      q: "新宿 / spa",
      type: "service"
    });
    await contentPublicationApi.getCarouselRelease("affiliate-home-notice", 71);
    await contentPublicationApi.previewCarousel("user-home", 72);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/content/carousels/user-home");
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/content/carousels/affiliate-home-notice/history",
      { query: { page: 2, pageSize: 30 } }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/backoffice/content/carousels/user-home/targets",
      { query: { page: 3, pageSize: 15, q: "新宿 / spa", type: "service" } }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/backoffice/content/carousels/affiliate-home-notice/releases/71"
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      5,
      "/backoffice/content/carousels/user-home/releases/72/preview"
    );
  });

  it("passes carousel draft, locale, copy, and lifecycle bodies without rewriting locks or idempotency", async () => {
    const draft = {
      idempotencyKey,
      sourceLocale: "ja",
      slides: []
    } satisfies CarouselDraftCreateInput;
    const replacement = {
      expectedLockVersion: 2,
      sourceLocale: "ja",
      slides: []
    } satisfies import("./contentPublication").CarouselDraftReplaceInput;
    const locale = {
      expectedLockVersion: 3,
      badge: null,
      title: "Tokyo",
      caption: null,
      ctaLabel: "見る",
      imageAltText: "東京の街並み"
    };

    await contentPublicationApi.createCarouselDraft("USER_HOME", draft);
    await contentPublicationApi.replaceCarouselDraft("user-home", 81, replacement);
    await contentPublicationApi.updateCarouselSlideLocale(
      "user-home",
      81,
      "slide / one",
      "ja",
      locale
    );
    await contentPublicationApi.copyCarouselSlideLocaleToAll(
      "user-home",
      81,
      "slide / one",
      { expectedLockVersion: 4, sourceLocale: "ja" }
    );
    await contentPublicationApi.publishCarousel("user-home", 81, {
      idempotencyKey,
      expectedLockVersion: 5,
      reason: "approved"
    });
    await contentPublicationApi.scheduleCarousel("user-home", 81, {
      idempotencyKey,
      expectedLockVersion: 5,
      publishAt: "2099-08-30T03:00:00.000Z"
    });
    await contentPublicationApi.disableCarousel("user-home", 81, {
      idempotencyKey,
      expectedLockVersion: 6,
      reason: "expired"
    });
    await contentPublicationApi.rollbackCarousel("user-home", 79, {
      idempotencyKey,
      expectedCurrentVersion: 7,
      reason: "restore"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/content/carousels/user-home/releases",
      { body: draft, method: "POST" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/content/carousels/user-home/releases/81",
      { body: replacement, method: "PATCH" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/backoffice/content/carousels/user-home/releases/81/slides/slide%20%2F%20one/locales/ja",
      { body: locale, method: "PATCH" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/backoffice/content/carousels/user-home/releases/81/slides/slide%20%2F%20one/copy-to-all",
      { body: { expectedLockVersion: 4, sourceLocale: "ja" }, method: "POST" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      5,
      "/backoffice/content/carousels/user-home/releases/81/publish",
      { body: { idempotencyKey, expectedLockVersion: 5, reason: "approved" }, method: "POST" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      6,
      "/backoffice/content/carousels/user-home/releases/81/schedule",
      {
        body: { idempotencyKey, expectedLockVersion: 5, publishAt: "2099-08-30T03:00:00.000Z" },
        method: "POST"
      }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      7,
      "/backoffice/content/carousels/user-home/releases/81/disable",
      { body: { idempotencyKey, expectedLockVersion: 6, reason: "expired" }, method: "POST" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      8,
      "/backoffice/content/carousels/user-home/releases/79/rollback",
      { body: { idempotencyKey, expectedCurrentVersion: 7, reason: "restore" }, method: "POST" }
    );
  });

  it("covers the complete announcement draft, history, preview, and lifecycle contract", async () => {
    const create = {
      idempotencyKey,
      sourceLocale: "en" as ContentLocaleCode,
      affiliateTaskId: null,
      visibleFrom: null,
      visibleUntil: null,
      translation: { title: "Notice", summary: null, body: "Body" }
    };
    const update = {
      expectedLockVersion: 2,
      locale: "en" as ContentLocaleCode,
      title: "Notice 2",
      summary: "Summary",
      body: "Body 2"
    };

    await contentPublicationApi.listAnnouncements({ page: 1, pageSize: 20 });
    await contentPublicationApi.createAnnouncementDraft(create);
    await contentPublicationApi.getAnnouncementHistory("notice / one", { page: 2, pageSize: 10 });
    await contentPublicationApi.getAnnouncementRelease("notice / one", 8);
    await contentPublicationApi.updateAnnouncementLocale("notice / one", 8, update);
    await contentPublicationApi.copyAnnouncementLocaleToAll("notice / one", 8, {
      expectedLockVersion: 3,
      sourceLocale: "en"
    });
    await contentPublicationApi.previewAnnouncement("notice / one", 8);
    await contentPublicationApi.publishAnnouncement("notice / one", 8, {
      idempotencyKey,
      expectedLockVersion: 3
    });
    await contentPublicationApi.scheduleAnnouncement("notice / one", 8, {
      idempotencyKey,
      expectedLockVersion: 3,
      publishAt: "2099-08-30T03:00:00.000Z"
    });
    await contentPublicationApi.disableAnnouncement("notice / one", 8, {
      idempotencyKey,
      expectedLockVersion: 4,
      reason: "closed"
    });
    await contentPublicationApi.rollbackAnnouncement("notice / one", 7, {
      idempotencyKey,
      expectedCurrentVersion: 5,
      reason: "restore"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/affiliate/announcements", {
      query: { page: 1, pageSize: 20 }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/affiliate/announcements", {
      body: create,
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/backoffice/affiliate/announcements/notice%20%2F%20one/history",
      { query: { page: 2, pageSize: 10 } }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/backoffice/affiliate/announcements/notice%20%2F%20one/releases/8"
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      5,
      "/backoffice/affiliate/announcements/notice%20%2F%20one/releases/8",
      { body: update, method: "PATCH" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      6,
      "/backoffice/affiliate/announcements/notice%20%2F%20one/releases/8",
      {
        body: { expectedLockVersion: 3, operation: "copy_to_all", sourceLocale: "en" },
        method: "PATCH"
      }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      7,
      "/backoffice/affiliate/announcements/notice%20%2F%20one/releases/8/preview"
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      8,
      "/backoffice/affiliate/announcements/notice%20%2F%20one/releases/8/publish",
      { body: { idempotencyKey, expectedLockVersion: 3 }, method: "POST" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      9,
      "/backoffice/affiliate/announcements/notice%20%2F%20one/releases/8/schedule",
      {
        body: { idempotencyKey, expectedLockVersion: 3, publishAt: "2099-08-30T03:00:00.000Z" },
        method: "POST"
      }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      10,
      "/backoffice/affiliate/announcements/notice%20%2F%20one/releases/8/disable",
      { body: { idempotencyKey, expectedLockVersion: 4, reason: "closed" }, method: "POST" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      11,
      "/backoffice/affiliate/announcements/notice%20%2F%20one/releases/7/rollback",
      { body: { idempotencyKey, expectedCurrentVersion: 5, reason: "restore" }, method: "POST" }
    );
  });

  it("uploads the original image Blob as the raw request body with its exact MIME type", async () => {
    const image = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

    await contentPublicationApi.uploadContentImage(image, "Tokyo salon");

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/content/media", {
      body: image,
      headers: { "Content-Type": "image/jpeg" },
      method: "POST",
      query: { alt_text: "Tokyo salon" }
    });
  });
});
