import { createHash, randomUUID } from "crypto";
import { CONTENT_LOCALES, type ContentLocaleCode } from "../constants/content-locales";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { normalizePagination, type PaginationInput } from "../utils/pagination";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type CarouselSceneCode = "USER_HOME" | "AFFILIATE_HOME_NOTICE";
export type CarouselStatus = "draft" | "scheduled" | "published" | "disabled" | "archived";

export type CarouselTarget =
  | { type: "shop"; shopId: number }
  | { type: "technician"; technicianProfileId: number }
  | { type: "service"; serviceId: number }
  | {
      type: "affiliate_announcement";
      announcementPublicId: string;
      affiliateTaskId: number | null;
    };

export type CarouselTargetInput =
  | CarouselTarget
  | { type: "shop"; publicId: string }
  | { type: "technician"; publicId: string }
  | { type: "service"; publicId: string }
  | {
      type: "affiliate_announcement";
      announcementPublicId: string;
      taskCode: string | null;
    };

export type PublishedCarouselTarget =
  | { type: "shop"; publicId: string }
  | { type: "technician"; publicId: string }
  | { type: "service"; publicId: string }
  | { type: "affiliate_announcement"; publicId: string };

export interface CarouselTranslationInput {
  badge: string | null;
  title: string;
  caption: string | null;
  ctaLabel: string | null;
  imageAltText: string;
}

export interface CarouselTranslationPayload extends CarouselTranslationInput {
  sourceLocale: ContentLocaleCode;
  isInitialCopy: boolean;
}

export interface CarouselSlidePayload {
  id: string;
  mediaAssetPublicId: string;
  imageUrl: string;
  sortOrder: number;
  isEnabled: boolean;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  target: CarouselTarget;
  translations: Record<ContentLocaleCode, CarouselTranslationPayload>;
}

export interface CarouselPublicationPayload {
  scene: CarouselSceneCode;
  releaseId: number;
  version: number;
  status: CarouselStatus;
  lockVersion: number;
  publishAt: Date | null;
  activatedAt: Date | null;
  disabledAt: Date | null;
  archivedAt: Date | null;
  sourceReleaseId: number | null;
  slides: CarouselSlidePayload[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PublishedCarouselSlide {
  id: string;
  badge: string | null;
  title: string;
  caption: string | null;
  ctaLabel: string | null;
  imageAltText: string;
  imageUrl: string;
  target: PublishedCarouselTarget;
}

export interface PublishedCarouselPayload {
  scene: CarouselSceneCode;
  locale: ContentLocaleCode;
  releaseVersion: number | null;
  generatedAt: string;
  slides: PublishedCarouselSlide[];
}

export type CarouselTargetSearchItem =
  | {
      type: "shop" | "technician" | "service";
      publicId: string;
      label: string;
      status: string;
      target:
        | { type: "shop"; publicId: string }
        | { type: "technician"; publicId: string }
        | { type: "service"; publicId: string };
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

interface MutationBase {
  scene: CarouselSceneCode;
  actorUserId: number;
  actor: AuthenticatedAccessContext;
  context: AuthRequestContext;
  now: Date;
}

export interface StoredCarouselSlide {
  publicId: string;
  mediaAssetPublicId: string;
  sortOrder: number;
  isEnabled: boolean;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  target: CarouselTargetInput;
  translations: Record<ContentLocaleCode, CarouselTranslationPayload>;
}

export interface CreateCarouselDraftMutation extends MutationBase {
  idempotencyKey: string;
  requestFingerprint: string;
  sourceLocale: ContentLocaleCode;
  slides: StoredCarouselSlide[];
  validateAffiliateTask: (taskId: number) => Promise<void>;
}

export interface ReplaceCarouselDraftMutation extends MutationBase {
  releaseId: number;
  expectedLockVersion: number;
  sourceLocale: ContentLocaleCode;
  slides: StoredCarouselSlide[];
  validateAffiliateTask: (taskId: number) => Promise<void>;
}

export interface UpdateCarouselLocaleMutation extends MutationBase {
  releaseId: number;
  slidePublicId: string;
  expectedLockVersion: number;
  locale: ContentLocaleCode;
  copyToAll: boolean;
  translation?: CarouselTranslationInput;
}

interface IdempotentCarouselMutation extends MutationBase {
  releaseId: number;
  idempotencyKey: string;
  requestFingerprint: string;
  validateAffiliateTask: (taskId: number) => Promise<void>;
}

export interface PublishCarouselMutation extends IdempotentCarouselMutation {
  expectedLockVersion: number;
  reason?: string;
}

export interface ScheduleCarouselMutation extends IdempotentCarouselMutation {
  expectedLockVersion: number;
  publishAt: Date;
  reason?: string;
}

export interface DisableCarouselMutation extends IdempotentCarouselMutation {
  expectedLockVersion: number;
  reason: string;
}

export interface RollbackCarouselMutation extends IdempotentCarouselMutation {
  sourceReleaseId: number;
  expectedCurrentVersion: number;
  reason: string;
}

export interface CarouselPublicationRepositoryPort {
  getScene(scene: CarouselSceneCode): Promise<{
    scene: CarouselSceneCode;
    draft: CarouselPublicationPayload | null;
    published: CarouselPublicationPayload | null;
    scheduled: CarouselPublicationPayload | null;
  }>;
  createDraft(input: CreateCarouselDraftMutation): Promise<CarouselPublicationPayload>;
  findRelease(
    scene: CarouselSceneCode,
    releaseId: number
  ): Promise<CarouselPublicationPayload | null>;
  replaceDraft(input: ReplaceCarouselDraftMutation): Promise<CarouselPublicationPayload>;
  updateLocale(input: UpdateCarouselLocaleMutation): Promise<CarouselPublicationPayload>;
  publish(input: PublishCarouselMutation): Promise<CarouselPublicationPayload>;
  schedule(input: ScheduleCarouselMutation): Promise<CarouselPublicationPayload>;
  disable(input: DisableCarouselMutation): Promise<CarouselPublicationPayload>;
  cloneForRollback(input: RollbackCarouselMutation): Promise<CarouselPublicationPayload>;
  listHistory(input: { scene: CarouselSceneCode; page: number; pageSize: number }): Promise<{
    list: CarouselPublicationPayload[];
    total: number;
  }>;
  findPublishedScene(
    scene: CarouselSceneCode,
    locale: ContentLocaleCode,
    actor: AuthenticatedAccessContext,
    now: Date
  ): Promise<PublishedCarouselPayload>;
  searchTargets(input: {
    scene: CarouselSceneCode;
    type?: string;
    q?: string;
    page: number;
    pageSize: number;
    scopeShopId: number | null;
    actor: AuthenticatedAccessContext;
    now: Date;
    validateAffiliateTask: (taskId: number) => Promise<void>;
  }): Promise<{ list: CarouselTargetSearchItem[]; total: number }>;
}

interface AffiliateMarketplacePolicyPort {
  getTask(
    actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<{
    taskCode: string;
    name: string;
    claimable: boolean;
  }>;
}

interface DraftTranslationBody extends CarouselTranslationInput {
  locale: ContentLocaleCode;
}

interface DraftSlideBody {
  publicId?: string;
  mediaAssetPublicId: string;
  sortOrder: number;
  isEnabled: boolean;
  visibleFrom: string | null;
  visibleUntil: string | null;
  target: CarouselTargetInput;
  translations: DraftTranslationBody[];
}

interface CreateDraftBody {
  idempotencyKey: string;
  sourceLocale: ContentLocaleCode;
  slides: DraftSlideBody[];
}

interface ReplaceDraftBody {
  expectedLockVersion: number;
  sourceLocale: ContentLocaleCode;
  slides: DraftSlideBody[];
}

interface PublishBody {
  idempotencyKey: string;
  expectedLockVersion: number;
  reason?: string;
}

interface ScheduleBody extends PublishBody {
  publishAt: string;
}

interface DisableBody extends PublishBody {
  reason: string;
}

interface RollbackBody {
  idempotencyKey: string;
  expectedCurrentVersion: number;
  reason: string;
}

export class CarouselPublicationService {
  private readonly now: () => Date;
  private readonly createPublicId: () => string;

  public constructor(
    private readonly repository: CarouselPublicationRepositoryPort,
    private readonly marketplacePolicy: AffiliateMarketplacePolicyPort,
    options: { now?: () => Date; createPublicId?: () => string } = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.createPublicId = options.createPublicId ?? randomUUID;
  }

  public assertTarget(scene: CarouselSceneCode, target: CarouselTargetInput): void {
    const valid =
      (scene === "USER_HOME" && ["shop", "technician", "service"].includes(target.type)) ||
      (scene === "AFFILIATE_HOME_NOTICE" && target.type === "affiliate_announcement");
    if (!valid) throw this.carouselError("error.carousel.target_invalid", 409);
  }

  public getBackofficeScene(scene: CarouselSceneCode, actor: AuthenticatedAccessContext) {
    void actor;
    return this.repository.getScene(scene);
  }

  public async createDraft(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: CreateDraftBody
  ): Promise<CarouselPublicationPayload> {
    const slides = this.normalizeSlides(scene, input.sourceLocale, input.slides, true);
    return this.repository.createDraft({
      scene,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: this.fingerprint("create", { actorUserId: actor.userId, scene, input }),
      sourceLocale: input.sourceLocale,
      slides,
      validateAffiliateTask: (taskId) => this.assertTaskVisible(actor, taskId),
      actorUserId: actor.userId,
      actor,
      context,
      now: this.now()
    });
  }

  public async getRelease(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    releaseId: number
  ) {
    void actor;
    const release = await this.repository.findRelease(scene, releaseId);
    if (!release) throw this.carouselError("error.content.release_not_found", 404);
    return release;
  }

  public replaceDraft(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    releaseId: number,
    input: ReplaceDraftBody
  ): Promise<CarouselPublicationPayload> {
    return this.repository.replaceDraft({
      scene,
      releaseId,
      expectedLockVersion: input.expectedLockVersion,
      sourceLocale: input.sourceLocale,
      slides: this.normalizeSlides(scene, input.sourceLocale, input.slides, false),
      validateAffiliateTask: (taskId) => this.assertTaskVisible(actor, taskId),
      actorUserId: actor.userId,
      actor,
      context,
      now: this.now()
    });
  }

  public updateLocale(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    releaseId: number,
    slidePublicId: string,
    input: { expectedLockVersion: number; locale: ContentLocaleCode } & CarouselTranslationInput
  ): Promise<CarouselPublicationPayload> {
    this.assertCompleteTranslation(input);
    return this.repository.updateLocale({
      scene,
      releaseId,
      slidePublicId,
      expectedLockVersion: input.expectedLockVersion,
      locale: input.locale,
      copyToAll: false,
      translation: this.cleanTranslation(input),
      actorUserId: actor.userId,
      actor,
      context,
      now: this.now()
    });
  }

  public copyLocaleToAll(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    releaseId: number,
    slidePublicId: string,
    input: { expectedLockVersion: number; sourceLocale: ContentLocaleCode }
  ): Promise<CarouselPublicationPayload> {
    return this.repository.updateLocale({
      scene,
      releaseId,
      slidePublicId,
      expectedLockVersion: input.expectedLockVersion,
      locale: input.sourceLocale,
      copyToAll: true,
      actorUserId: actor.userId,
      actor,
      context,
      now: this.now()
    });
  }

  public preview(scene: CarouselSceneCode, actor: AuthenticatedAccessContext, releaseId: number) {
    return this.getRelease(scene, actor, releaseId);
  }

  public publish(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    releaseId: number,
    input: PublishBody
  ) {
    return this.repository.publish({
      scene,
      releaseId,
      ...input,
      requestFingerprint: this.fingerprint("publish", {
        actorUserId: actor.userId,
        scene,
        releaseId,
        input
      }),
      validateAffiliateTask: (taskId) => this.assertTaskVisible(actor, taskId),
      actorUserId: actor.userId,
      actor,
      context,
      now: this.now()
    });
  }

  public schedule(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    releaseId: number,
    input: ScheduleBody
  ) {
    return this.repository.schedule({
      scene,
      releaseId,
      idempotencyKey: input.idempotencyKey,
      expectedLockVersion: input.expectedLockVersion,
      publishAt: new Date(input.publishAt),
      reason: input.reason,
      requestFingerprint: this.fingerprint("schedule", {
        actorUserId: actor.userId,
        scene,
        releaseId,
        input
      }),
      validateAffiliateTask: (taskId) => this.assertTaskVisible(actor, taskId),
      actorUserId: actor.userId,
      actor,
      context,
      now: this.now()
    });
  }

  public disable(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    releaseId: number,
    input: DisableBody
  ) {
    return this.repository.disable({
      scene,
      releaseId,
      ...input,
      requestFingerprint: this.fingerprint("disable", {
        actorUserId: actor.userId,
        scene,
        releaseId,
        input
      }),
      validateAffiliateTask: (taskId) => this.assertTaskVisible(actor, taskId),
      actorUserId: actor.userId,
      actor,
      context,
      now: this.now()
    });
  }

  public rollback(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    sourceReleaseId: number,
    input: RollbackBody
  ) {
    return this.repository.cloneForRollback({
      scene,
      releaseId: sourceReleaseId,
      sourceReleaseId,
      ...input,
      requestFingerprint: this.fingerprint("rollback", {
        actorUserId: actor.userId,
        scene,
        sourceReleaseId,
        input
      }),
      validateAffiliateTask: (taskId) => this.assertTaskVisible(actor, taskId),
      actorUserId: actor.userId,
      actor,
      context,
      now: this.now()
    });
  }

  public async history(
    scene: CarouselSceneCode,
    _actor: AuthenticatedAccessContext,
    input: PaginationInput
  ) {
    const pagination = normalizePagination(input);
    const result = await this.repository.listHistory({ scene, ...pagination });
    return { ...result, page: pagination.page, page_size: pagination.pageSize };
  }

  public async searchTargets(
    scene: CarouselSceneCode,
    actor: AuthenticatedAccessContext,
    input: PaginationInput & { type?: string; q?: string }
  ) {
    const allowed =
      scene === "USER_HOME"
        ? ["shop", "technician", "service"]
        : ["announcement", "affiliate_task"];
    if (input.type && !allowed.includes(input.type))
      throw this.carouselError("error.carousel.target_invalid", 400);
    const pagination = normalizePagination(input);
    const result = await this.repository.searchTargets({
      scene,
      type: input.type,
      q: input.q,
      ...pagination,
      scopeShopId:
        actor.currentIdentityScopeType === "shop" ? (actor.currentIdentityScopeId ?? null) : null,
      actor,
      now: this.now(),
      validateAffiliateTask: (taskId) => this.assertTaskVisible(actor, taskId)
    });
    return { ...result, page: pagination.page, page_size: pagination.pageSize };
  }

  public getPublishedScene(
    scene: CarouselSceneCode,
    locale: ContentLocaleCode,
    actor: AuthenticatedAccessContext,
    now = this.now()
  ) {
    return this.repository.findPublishedScene(scene, locale, actor, now);
  }

  private normalizeSlides(
    scene: CarouselSceneCode,
    sourceLocale: ContentLocaleCode,
    slides: DraftSlideBody[],
    initial: boolean
  ): StoredCarouselSlide[] {
    const sorted = [...slides].sort((left, right) => left.sortOrder - right.sortOrder);
    if (sorted.some((slide, index) => slide.sortOrder !== index))
      throw this.carouselError("error.carousel.sort_invalid", 409);
    if (
      !sorted.some(
        (slide) =>
          slide.isEnabled && (!slide.visibleUntil || new Date(slide.visibleUntil) > this.now())
      )
    ) {
      throw this.carouselError("error.carousel.no_visible_slide", 409);
    }
    const normalized = sorted.map((slide) => {
      this.assertTarget(scene, slide.target);
      if (
        slide.visibleFrom &&
        slide.visibleUntil &&
        Date.parse(slide.visibleFrom) >= Date.parse(slide.visibleUntil)
      ) {
        throw this.carouselError("error.content.schedule_conflict", 409);
      }
      const byLocale = new Map(
        slide.translations.map((translation) => [translation.locale, translation])
      );
      const source = byLocale.get(sourceLocale);
      if (!source) throw this.carouselError("error.content.incomplete_translations", 409);
      const translations = Object.fromEntries(
        CONTENT_LOCALES.map((locale) => {
          const value = byLocale.get(locale) ?? (initial ? source : undefined);
          if (!value) throw this.carouselError("error.content.incomplete_translations", 409);
          this.assertCompleteTranslation(value);
          return [
            locale,
            {
              ...this.cleanTranslation(value),
              sourceLocale: byLocale.has(locale) ? locale : sourceLocale,
              isInitialCopy: initial && locale !== sourceLocale
            }
          ];
        })
      ) as Record<ContentLocaleCode, CarouselTranslationPayload>;
      return {
        publicId: slide.publicId ?? this.createPublicId(),
        mediaAssetPublicId: slide.mediaAssetPublicId,
        sortOrder: slide.sortOrder,
        isEnabled: slide.isEnabled,
        visibleFrom: slide.visibleFrom ? new Date(slide.visibleFrom) : null,
        visibleUntil: slide.visibleUntil ? new Date(slide.visibleUntil) : null,
        target: slide.target,
        translations
      };
    });
    if (new Set(normalized.map((slide) => slide.publicId)).size !== normalized.length)
      throw this.carouselError("error.carousel.sort_invalid", 409);
    return normalized;
  }

  private assertCompleteTranslation(value: CarouselTranslationInput): void {
    if (!value.title.trim() || !value.imageAltText.trim())
      throw this.carouselError("error.content.incomplete_translations", 409);
  }

  private cleanTranslation(value: CarouselTranslationInput): CarouselTranslationInput {
    return {
      badge: value.badge,
      title: value.title.trim(),
      caption: value.caption,
      ctaLabel: value.ctaLabel,
      imageAltText: value.imageAltText.trim()
    };
  }

  private async assertTaskVisible(
    actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<void> {
    try {
      await this.marketplacePolicy.getTask(actor, taskId);
    } catch {
      throw this.carouselError("error.content.target_unavailable", 409);
    }
  }

  private fingerprint(action: string, value: unknown): string {
    return createHash("sha256").update(JSON.stringify({ action, value })).digest("hex");
  }

  private carouselError(message: string, statusCode: number): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode });
  }
}
