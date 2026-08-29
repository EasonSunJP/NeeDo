import { httpClient } from "./httpClient";

export type ContentLocaleCode = "zh-CN" | "zh-TW" | "en" | "ja" | "ko";
export type PublishedCarouselScene = "USER_HOME" | "AFFILIATE_HOME_NOTICE";
export type CarouselSceneSlug = "user-home" | "affiliate-home-notice";
export type CarouselScene = PublishedCarouselScene | CarouselSceneSlug;
export type UserHomeCarouselScene = "USER_HOME" | "user-home";
export type AffiliateCarouselScene = "AFFILIATE_HOME_NOTICE" | "affiliate-home-notice";
export type ContentPublicationStatus = "draft" | "scheduled" | "published" | "disabled" | "archived";

export type PublishedCarouselTarget =
  | { type: "shop"; publicId: string }
  | { type: "technician"; publicId: string }
  | { type: "service"; publicId: string }
  | { type: "affiliate_announcement"; publicId: string };

export type PublishedCarouselSlide = {
  id: string;
  badge: string | null;
  title: string;
  caption: string | null;
  ctaLabel: string | null;
  imageAltText: string;
  imageUrl: string;
  target: PublishedCarouselTarget;
};

export type PublishedCarouselPayload = {
  scene: PublishedCarouselScene;
  locale: ContentLocaleCode;
  releaseVersion: number | null;
  generatedAt: string;
  slides: PublishedCarouselSlide[];
};

export type PublishedAnnouncementPayload = {
  publicId: string;
  version: number;
  locale: ContentLocaleCode;
  title: string;
  summary: string | null;
  body: string;
  visibleFrom: string | null;
  visibleUntil: string | null;
  activatedAt: string | null;
  taskAction: {
    taskCode: string;
    label: string;
    claimable: boolean;
  } | null;
};

export type ContentPage<TItem> = {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
};

export type ContentPageQuery = {
  page?: number;
  pageSize?: number;
};

export type CarouselTranslationInput = {
  locale: ContentLocaleCode;
  badge: string | null;
  title: string;
  caption: string | null;
  ctaLabel: string | null;
  imageAltText: string;
};

export type CarouselTranslation = Omit<CarouselTranslationInput, "locale"> & {
  sourceLocale: ContentLocaleCode;
  isInitialCopy: boolean;
};

export type UserHomeCarouselTargetInput =
  | { type: "shop"; shopId: number }
  | { type: "shop"; publicId: string }
  | { type: "technician"; technicianProfileId: number }
  | { type: "technician"; publicId: string }
  | { type: "service"; serviceId: number }
  | { type: "service"; publicId: string };

export type AffiliateCarouselTargetInput =
  | {
      type: "affiliate_announcement";
      announcementPublicId: string;
      affiliateTaskId: number | null;
      taskCode?: never;
    }
  | {
      type: "affiliate_announcement";
      announcementPublicId: string;
      affiliateTaskId?: never;
      taskCode: string | null;
    };

export type CarouselTargetInput<TScene extends CarouselScene = CarouselScene> =
  TScene extends UserHomeCarouselScene
    ? UserHomeCarouselTargetInput
    : AffiliateCarouselTargetInput;

export type CarouselDraftSlideInput<TScene extends CarouselScene = CarouselScene> = {
  publicId?: string;
  mediaAssetPublicId: string;
  sortOrder: number;
  isEnabled: boolean;
  visibleFrom: string | null;
  visibleUntil: string | null;
  target: CarouselTargetInput<TScene>;
  translations: CarouselTranslationInput[];
};

export type CarouselDraftCreateInput<TScene extends CarouselScene = CarouselScene> = {
  idempotencyKey: string;
  sourceLocale: ContentLocaleCode;
  slides: CarouselDraftSlideInput<TScene>[];
};

export type CarouselDraftReplaceInput<TScene extends CarouselScene = CarouselScene> = {
  expectedLockVersion: number;
  sourceLocale: ContentLocaleCode;
  slides: CarouselDraftSlideInput<TScene>[];
};

export type CarouselLocaleUpdateInput = Omit<CarouselTranslationInput, "locale"> & {
  expectedLockVersion: number;
};

export type CarouselLocaleCopyInput = {
  expectedLockVersion: number;
  sourceLocale: ContentLocaleCode;
};

export type CarouselReleaseSlide = Omit<
  CarouselDraftSlideInput,
  "publicId" | "target" | "translations"
> & {
  id: string;
  mediaAssetPublicId: string;
  imageUrl: string;
  target:
    | { type: "shop"; shopId: number }
    | { type: "technician"; technicianProfileId: number }
    | { type: "service"; serviceId: number }
    | {
        type: "affiliate_announcement";
        announcementPublicId: string;
        affiliateTaskId: number | null;
      };
  translations: Record<ContentLocaleCode, CarouselTranslation>;
};

export type CarouselRelease = {
  scene: PublishedCarouselScene;
  releaseId: number;
  version: number;
  status: ContentPublicationStatus;
  lockVersion: number;
  publishAt: string | null;
  activatedAt: string | null;
  disabledAt: string | null;
  archivedAt: string | null;
  sourceReleaseId: number | null;
  slides: CarouselReleaseSlide[];
  createdAt: string;
  updatedAt: string;
};

export type BackofficeCarouselScene = {
  scene: PublishedCarouselScene;
  draft: CarouselRelease | null;
  published: CarouselRelease | null;
  scheduled: CarouselRelease | null;
};

export type CarouselTargetSearchItem =
  | {
      type: "shop" | "technician" | "service";
      publicId: string;
      label: string;
      status: string;
      target: PublishedCarouselTarget;
    }
  | {
      type: "affiliate_announcement";
      publicId: string;
      label: string;
      status: string;
      target: {
        type: "affiliate_announcement";
        announcementPublicId: string;
        taskCode: string | null;
      };
    }
  | { type: "affiliate_task"; taskCode: string; label: string; status: string };

export type UserHomeTargetSearchQuery = ContentPageQuery & {
  q?: string;
  type?: "shop" | "technician" | "service";
};

export type AffiliateTargetSearchQuery = ContentPageQuery & {
  q?: string;
  type?: "announcement" | "affiliate_task";
};

export type CarouselTargetSearchQuery<TScene extends CarouselScene = CarouselScene> =
  TScene extends UserHomeCarouselScene ? UserHomeTargetSearchQuery : AffiliateTargetSearchQuery;

export type PublishContentInput = {
  idempotencyKey: string;
  expectedLockVersion: number;
  reason?: string;
};

export type ScheduleContentInput = PublishContentInput & {
  publishAt: string;
};

export type DisableContentInput = PublishContentInput & {
  reason: string;
};

export type RollbackContentInput = {
  idempotencyKey: string;
  expectedCurrentVersion: number;
  reason: string;
};

export type AnnouncementTranslationInput = {
  title: string;
  summary: string | null;
  body: string;
};

export type AnnouncementTranslation = AnnouncementTranslationInput & {
  sourceLocale: ContentLocaleCode;
  isInitialCopy: boolean;
};

export type AnnouncementDraftCreateInput = {
  idempotencyKey: string;
  sourceLocale: ContentLocaleCode;
  affiliateTaskId: number | null;
  visibleFrom: string | null;
  visibleUntil: string | null;
  translation: AnnouncementTranslationInput;
};

export type AnnouncementLocaleUpdateInput = AnnouncementTranslationInput & {
  expectedLockVersion: number;
  locale: ContentLocaleCode;
};

export type AnnouncementLocaleCopyInput = {
  operation: "copy_to_all";
  expectedLockVersion: number;
  sourceLocale: ContentLocaleCode;
};

export type AnnouncementRelease = {
  publicId: string;
  releaseId: number;
  version: number;
  status: ContentPublicationStatus;
  lockVersion: number;
  announcementType: string;
  visibilityScope: string;
  affiliateTaskId: number | null;
  publishAt: string | null;
  visibleFrom: string | null;
  visibleUntil: string | null;
  activatedAt: string | null;
  disabledAt: string | null;
  archivedAt: string | null;
  sourceReleaseId: number | null;
  translations: Record<ContentLocaleCode, AnnouncementTranslation>;
  createdAt: string;
  updatedAt: string;
};

export type AnnouncementPreview = AnnouncementRelease & {
  taskAction: PublishedAnnouncementPayload["taskAction"];
};

export type ContentMediaUpload = {
  publicId: string;
  mediaAssetId: number;
  url: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number | null;
  height: number | null;
  checksumSha256: string;
};

function carouselSceneSlug(scene: CarouselScene): CarouselSceneSlug {
  if (scene === "USER_HOME" || scene === "user-home") {
    return "user-home";
  }
  return "affiliate-home-notice";
}

function carouselBase(scene: CarouselScene) {
  return `/backoffice/content/carousels/${carouselSceneSlug(scene)}`;
}

function announcementBase(publicId: string) {
  return `/backoffice/affiliate/announcements/${encodeURIComponent(publicId)}`;
}

function carouselLifecycle<TInput>(
  scene: CarouselScene,
  releaseId: number,
  action: "publish" | "schedule" | "disable" | "rollback",
  body: TInput
) {
  return httpClient.request<CarouselRelease>(`${carouselBase(scene)}/releases/${releaseId}/${action}`, {
    body,
    method: "POST"
  });
}

function announcementLifecycle<TInput>(
  publicId: string,
  releaseId: number,
  action: "publish" | "schedule" | "disable" | "rollback",
  body: TInput
) {
  return httpClient.request<AnnouncementRelease>(
    `${announcementBase(publicId)}/releases/${releaseId}/${action}`,
    { body, method: "POST" }
  );
}

export const contentPublicationApi = {
  getUserHomeCarousel(locale: ContentLocaleCode) {
    return httpClient.request<PublishedCarouselPayload>("/content/carousels/user-home", {
      query: { locale }
    });
  },

  getAffiliateCarousel(locale: ContentLocaleCode) {
    return httpClient.request<PublishedCarouselPayload>("/affiliate/content/carousel", {
      query: { locale }
    });
  },

  getAffiliateAnnouncement(publicId: string, locale: ContentLocaleCode) {
    return httpClient.request<PublishedAnnouncementPayload>(
      `/affiliate/announcements/${encodeURIComponent(publicId)}`,
      { query: { locale } }
    );
  },

  getBackofficeCarouselScene(scene: CarouselScene) {
    return httpClient.request<BackofficeCarouselScene>(carouselBase(scene));
  },

  createCarouselDraft<TScene extends CarouselScene>(
    scene: TScene,
    body: CarouselDraftCreateInput<NoInfer<TScene>>
  ) {
    return httpClient.request<CarouselRelease>(`${carouselBase(scene)}/releases`, {
      body,
      method: "POST"
    });
  },

  getCarouselHistory(scene: CarouselScene, query: ContentPageQuery = {}) {
    return httpClient.request<ContentPage<CarouselRelease>>(`${carouselBase(scene)}/history`, {
      query
    });
  },

  searchCarouselTargets<TScene extends CarouselScene>(
    scene: TScene,
    query: CarouselTargetSearchQuery<NoInfer<TScene>> = {}
  ) {
    return httpClient.request<ContentPage<CarouselTargetSearchItem>>(`${carouselBase(scene)}/targets`, {
      query
    });
  },

  getCarouselRelease(scene: CarouselScene, releaseId: number) {
    return httpClient.request<CarouselRelease>(`${carouselBase(scene)}/releases/${releaseId}`);
  },

  replaceCarouselDraft<TScene extends CarouselScene>(
    scene: TScene,
    releaseId: number,
    body: CarouselDraftReplaceInput<NoInfer<TScene>>
  ) {
    return httpClient.request<CarouselRelease>(`${carouselBase(scene)}/releases/${releaseId}`, {
      body,
      method: "PATCH"
    });
  },

  updateCarouselSlideLocale(
    scene: CarouselScene,
    releaseId: number,
    slidePublicId: string,
    locale: ContentLocaleCode,
    body: CarouselLocaleUpdateInput
  ) {
    return httpClient.request<CarouselRelease>(
      `${carouselBase(scene)}/releases/${releaseId}/slides/${encodeURIComponent(slidePublicId)}/locales/${locale}`,
      { body, method: "PATCH" }
    );
  },

  copyCarouselSlideLocaleToAll(
    scene: CarouselScene,
    releaseId: number,
    slidePublicId: string,
    body: CarouselLocaleCopyInput
  ) {
    return httpClient.request<CarouselRelease>(
      `${carouselBase(scene)}/releases/${releaseId}/slides/${encodeURIComponent(slidePublicId)}/copy-to-all`,
      { body, method: "POST" }
    );
  },

  previewCarousel(scene: CarouselScene, releaseId: number) {
    return httpClient.request<CarouselRelease>(`${carouselBase(scene)}/releases/${releaseId}/preview`);
  },

  publishCarousel(scene: CarouselScene, releaseId: number, body: PublishContentInput) {
    return carouselLifecycle(scene, releaseId, "publish", body);
  },

  scheduleCarousel(scene: CarouselScene, releaseId: number, body: ScheduleContentInput) {
    return carouselLifecycle(scene, releaseId, "schedule", body);
  },

  disableCarousel(scene: CarouselScene, releaseId: number, body: DisableContentInput) {
    return carouselLifecycle(scene, releaseId, "disable", body);
  },

  rollbackCarousel(scene: CarouselScene, releaseId: number, body: RollbackContentInput) {
    return carouselLifecycle(scene, releaseId, "rollback", body);
  },

  listAnnouncements(query: ContentPageQuery = {}) {
    return httpClient.request<ContentPage<AnnouncementRelease>>("/backoffice/affiliate/announcements", {
      query
    });
  },

  createAnnouncementDraft(body: AnnouncementDraftCreateInput) {
    return httpClient.request<AnnouncementRelease>("/backoffice/affiliate/announcements", {
      body,
      method: "POST"
    });
  },

  getAnnouncementHistory(publicId: string, query: ContentPageQuery = {}) {
    return httpClient.request<ContentPage<AnnouncementRelease>>(`${announcementBase(publicId)}/history`, {
      query
    });
  },

  getAnnouncementRelease(publicId: string, releaseId: number) {
    return httpClient.request<AnnouncementRelease>(`${announcementBase(publicId)}/releases/${releaseId}`);
  },

  updateAnnouncementLocale(
    publicId: string,
    releaseId: number,
    body: AnnouncementLocaleUpdateInput
  ) {
    return httpClient.request<AnnouncementRelease>(
      `${announcementBase(publicId)}/releases/${releaseId}`,
      { body, method: "PATCH" }
    );
  },

  copyAnnouncementLocaleToAll(
    publicId: string,
    releaseId: number,
    body: Omit<AnnouncementLocaleCopyInput, "operation">
  ) {
    return httpClient.request<AnnouncementRelease>(
      `${announcementBase(publicId)}/releases/${releaseId}`,
      { body: { ...body, operation: "copy_to_all" }, method: "PATCH" }
    );
  },

  previewAnnouncement(publicId: string, releaseId: number) {
    return httpClient.request<AnnouncementPreview>(
      `${announcementBase(publicId)}/releases/${releaseId}/preview`
    );
  },

  publishAnnouncement(publicId: string, releaseId: number, body: PublishContentInput) {
    return announcementLifecycle(publicId, releaseId, "publish", body);
  },

  scheduleAnnouncement(publicId: string, releaseId: number, body: ScheduleContentInput) {
    return announcementLifecycle(publicId, releaseId, "schedule", body);
  },

  disableAnnouncement(publicId: string, releaseId: number, body: DisableContentInput) {
    return announcementLifecycle(publicId, releaseId, "disable", body);
  },

  rollbackAnnouncement(publicId: string, releaseId: number, body: RollbackContentInput) {
    return announcementLifecycle(publicId, releaseId, "rollback", body);
  },

  uploadContentImage(image: Blob, altText?: string) {
    return httpClient.request<ContentMediaUpload>("/backoffice/content/media", {
      body: image,
      headers: { "Content-Type": image.type },
      method: "POST",
      query: { alt_text: altText }
    });
  }
};
