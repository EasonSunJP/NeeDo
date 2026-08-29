import { createHash, randomUUID } from "crypto";
import {
  CONTENT_LOCALES,
  initializeContentTranslations,
  type ContentLocaleCode
} from "../constants/content-locales";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  AnnouncementDraftBody,
  AnnouncementDraftMetadataUpdateBody,
  AnnouncementDraftUpdateBody,
  DisableBody,
  PublishBody,
  RollbackBody,
  ScheduleBody
} from "../validators/content-publication.validator";
import { AppError } from "../utils/app-error";
import { normalizePagination, type PaginationInput } from "../utils/pagination";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { ContentPublicationActivationRepositoryPort } from "./content-publication-scheduler.service";

export type OfficialAnnouncementStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "disabled"
  | "archived";

export interface OfficialAnnouncementTranslationInput {
  title: string;
  summary: string | null;
  body: string;
}

export interface OfficialAnnouncementTranslationPayload extends OfficialAnnouncementTranslationInput {
  sourceLocale: ContentLocaleCode;
  isInitialCopy: boolean;
}

export type OfficialAnnouncementStoredTranslation = OfficialAnnouncementTranslationPayload;

export interface OfficialAnnouncementPayload {
  publicId: string;
  releaseId: number;
  version: number;
  status: OfficialAnnouncementStatus;
  lockVersion: number;
  announcementType: string;
  visibilityScope: string;
  affiliateTaskId: number | null;
  publishAt: Date | null;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  activatedAt: Date | null;
  disabledAt: Date | null;
  archivedAt: Date | null;
  sourceReleaseId: number | null;
  translations: Record<ContentLocaleCode, OfficialAnnouncementTranslationPayload>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublishedAnnouncementPayload {
  publicId: string;
  releaseId: number;
  version: number;
  locale: ContentLocaleCode;
  title: string;
  summary: string | null;
  body: string;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  activatedAt: Date | null;
  affiliateTaskId: number | null;
}

export interface PublicOfficialAnnouncementPayload extends Omit<
  PublishedAnnouncementPayload,
  "affiliateTaskId" | "releaseId"
> {
  taskAction: {
    taskCode: string;
    label: string;
    claimable: boolean;
  } | null;
}

export interface AnnouncementMutationAuditInput {
  actorUserId: number;
  context: AuthRequestContext;
  now: Date;
}

export interface CreateAnnouncementDraftMutation extends AnnouncementMutationAuditInput {
  publicId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  sourceLocale: ContentLocaleCode;
  affiliateTaskId: number | null;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  translations: Record<ContentLocaleCode, OfficialAnnouncementStoredTranslation>;
  validateAffiliateTask?: () => Promise<void>;
}

export interface UpdateAnnouncementLocaleMutation extends AnnouncementMutationAuditInput {
  publicId: string;
  releaseId: number;
  expectedLockVersion: number;
  locale: ContentLocaleCode;
  copyToAll: boolean;
  translation?: OfficialAnnouncementTranslationInput;
}

export interface UpdateAnnouncementMetadataMutation extends AnnouncementMutationAuditInput {
  publicId: string;
  releaseId: number;
  expectedLockVersion: number;
  affiliateTaskId: number | null;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  validateAffiliateTask?: () => Promise<void>;
}

export interface AnnouncementAffiliateTaskSearchItem {
  id: number;
  taskCode: string;
  label: string;
  status: string;
}

interface IdempotentReleaseMutation extends AnnouncementMutationAuditInput {
  publicId: string;
  releaseId: number;
  idempotencyKey: string;
  requestFingerprint: string;
  validateAffiliateTask?: (affiliateTaskId: number) => Promise<void>;
}

export interface PublishAnnouncementMutation extends IdempotentReleaseMutation {
  expectedLockVersion: number;
  reason?: string;
}

export interface ScheduleAnnouncementMutation extends IdempotentReleaseMutation {
  expectedLockVersion: number;
  publishAt: Date;
  reason?: string;
}

export interface DisableAnnouncementMutation extends IdempotentReleaseMutation {
  expectedLockVersion: number;
  reason: string;
}

export interface RollbackAnnouncementMutation extends IdempotentReleaseMutation {
  sourceReleaseId: number;
  expectedCurrentVersion: number;
  reason: string;
}

export interface OfficialAnnouncementRepositoryPort extends ContentPublicationActivationRepositoryPort {
  createDraft(input: CreateAnnouncementDraftMutation): Promise<OfficialAnnouncementPayload>;
  list(input: { page: number; pageSize: number }): Promise<{
    list: OfficialAnnouncementPayload[];
    total: number;
    page: number;
    pageSize: number;
  }>;
  findDraft(publicId: string, releaseId: number): Promise<OfficialAnnouncementPayload | null>;
  updateLocale(input: UpdateAnnouncementLocaleMutation): Promise<OfficialAnnouncementPayload>;
  updateMetadata(input: UpdateAnnouncementMetadataMutation): Promise<OfficialAnnouncementPayload>;
  publish(input: PublishAnnouncementMutation): Promise<OfficialAnnouncementPayload>;
  schedule(input: ScheduleAnnouncementMutation): Promise<OfficialAnnouncementPayload>;
  disable(input: DisableAnnouncementMutation): Promise<OfficialAnnouncementPayload>;
  cloneForRollback(input: RollbackAnnouncementMutation): Promise<OfficialAnnouncementPayload>;
  listHistory(input: {
    publicId: string;
    page: number;
    pageSize: number;
  }): Promise<{ list: OfficialAnnouncementPayload[]; total: number }>;
  findPublished(
    publicId: string,
    locale: ContentLocaleCode,
    now: Date
  ): Promise<PublishedAnnouncementPayload | null>;
  searchAffiliateTasks(input: {
    page: number;
    pageSize: number;
    q?: string;
    now: Date;
    validateAffiliateTask: (taskId: number) => Promise<void>;
  }): Promise<{ list: AnnouncementAffiliateTaskSearchItem[]; total: number }>;
}

interface AffiliateMarketplacePolicyPort {
  getTask(
    actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<{ taskCode: string; name: string; claimable: boolean }>;
}

interface OfficialAnnouncementServiceOptions {
  now?: () => Date;
  createPublicId?: () => string;
}

type AnnouncementCreateBody = Extract<AnnouncementDraftBody, { idempotencyKey: string }>;
type AnnouncementUpdateBody = AnnouncementDraftUpdateBody;
type AnnouncementMetadataUpdateBody = Omit<AnnouncementDraftMetadataUpdateBody, "operation">;

export class OfficialAnnouncementService {
  private readonly now: () => Date;
  private readonly createPublicId: () => string;

  public constructor(
    private readonly repository: OfficialAnnouncementRepositoryPort,
    private readonly marketplacePolicy: AffiliateMarketplacePolicyPort,
    options: OfficialAnnouncementServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.createPublicId = options.createPublicId ?? randomUUID;
  }

  public async createDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: AnnouncementCreateBody
  ): Promise<OfficialAnnouncementPayload> {
    this.assertCompleteTranslation(input.translation);
    const initialized = initializeContentTranslations(input.sourceLocale, input.translation);
    const translations = Object.fromEntries(
      CONTENT_LOCALES.map((locale) => [
        locale,
        {
          ...initialized[locale],
          sourceLocale: input.sourceLocale,
          isInitialCopy: locale !== input.sourceLocale
        }
      ])
    ) as Record<ContentLocaleCode, OfficialAnnouncementStoredTranslation>;
    const currentTime = this.now();
    return this.repository.createDraft({
      publicId: this.createPublicId(),
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: this.fingerprint("create", { actorUserId: actor.userId, input }),
      sourceLocale: input.sourceLocale,
      affiliateTaskId: input.affiliateTaskId,
      visibleFrom: input.visibleFrom ? new Date(input.visibleFrom) : null,
      visibleUntil: input.visibleUntil ? new Date(input.visibleUntil) : null,
      translations,
      validateAffiliateTask:
        input.affiliateTaskId === null
          ? undefined
          : () => this.assertTaskVisible(actor, input.affiliateTaskId as number),
      actorUserId: actor.userId,
      context,
      now: currentTime
    });
  }

  public async list(
    _actor: AuthenticatedAccessContext,
    input: PaginationInput
  ): Promise<{
    list: OfficialAnnouncementPayload[];
    total: number;
    page: number;
    page_size: number;
  }> {
    const pagination = normalizePagination(input);
    const result = await this.repository.list(pagination);
    return {
      list: result.list,
      total: result.total,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  }

  public async searchAffiliateTasks(
    actor: AuthenticatedAccessContext,
    input: PaginationInput & { q?: string }
  ): Promise<{
    list: AnnouncementAffiliateTaskSearchItem[];
    total: number;
    page: number;
    page_size: number;
  }> {
    const pagination = normalizePagination(input);
    const result = await this.repository.searchAffiliateTasks({
      ...pagination,
      q: input.q,
      now: this.now(),
      validateAffiliateTask: (taskId) => this.assertTaskVisible(actor, taskId)
    });
    return { ...result, page: pagination.page, page_size: pagination.pageSize };
  }

  public async getRelease(
    _actor: AuthenticatedAccessContext,
    publicId: string,
    releaseId: number
  ): Promise<OfficialAnnouncementPayload> {
    return this.requireRelease(publicId, releaseId);
  }

  public async updateLocale(
    _actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    releaseId: number,
    input: AnnouncementUpdateBody
  ): Promise<OfficialAnnouncementPayload> {
    this.assertCompleteTranslation(input);
    return this.repository.updateLocale({
      publicId,
      releaseId,
      expectedLockVersion: input.expectedLockVersion,
      locale: input.locale,
      copyToAll: false,
      translation: { title: input.title.trim(), summary: input.summary, body: input.body.trim() },
      actorUserId: _actor.userId,
      context,
      now: this.now()
    });
  }

  public async updateMetadata(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    releaseId: number,
    input: AnnouncementMetadataUpdateBody
  ): Promise<OfficialAnnouncementPayload> {
    return this.repository.updateMetadata({
      publicId,
      releaseId,
      expectedLockVersion: input.expectedLockVersion,
      affiliateTaskId: input.affiliateTaskId,
      visibleFrom: input.visibleFrom ? new Date(input.visibleFrom) : null,
      visibleUntil: input.visibleUntil ? new Date(input.visibleUntil) : null,
      validateAffiliateTask:
        input.affiliateTaskId === null
          ? undefined
          : () => this.assertTaskVisible(actor, input.affiliateTaskId as number),
      actorUserId: actor.userId,
      context,
      now: this.now()
    });
  }

  public async copyLocaleToAll(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    releaseId: number,
    input: { expectedLockVersion: number; locale: ContentLocaleCode }
  ): Promise<OfficialAnnouncementPayload> {
    return this.repository.updateLocale({
      publicId,
      releaseId,
      expectedLockVersion: input.expectedLockVersion,
      locale: input.locale,
      copyToAll: true,
      actorUserId: actor.userId,
      context,
      now: this.now()
    });
  }

  public async preview(
    actor: AuthenticatedAccessContext,
    publicId: string,
    releaseId: number
  ): Promise<
    OfficialAnnouncementPayload & { taskAction: PublicOfficialAnnouncementPayload["taskAction"] }
  > {
    const release = await this.requireRelease(publicId, releaseId);
    return { ...release, taskAction: await this.resolveTaskAction(actor, release.affiliateTaskId) };
  }

  public async publish(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    releaseId: number,
    input: PublishBody
  ): Promise<OfficialAnnouncementPayload> {
    return this.repository.publish({
      publicId,
      releaseId,
      ...input,
      requestFingerprint: this.fingerprint("publish", {
        actorUserId: actor.userId,
        publicId,
        releaseId,
        ...input
      }),
      actorUserId: actor.userId,
      context,
      now: this.now(),
      validateAffiliateTask: (affiliateTaskId) => this.assertTaskVisible(actor, affiliateTaskId)
    });
  }

  public async schedule(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    releaseId: number,
    input: ScheduleBody
  ): Promise<OfficialAnnouncementPayload> {
    return this.repository.schedule({
      publicId,
      releaseId,
      idempotencyKey: input.idempotencyKey,
      expectedLockVersion: input.expectedLockVersion,
      publishAt: new Date(input.publishAt),
      reason: input.reason,
      requestFingerprint: this.fingerprint("schedule", {
        actorUserId: actor.userId,
        publicId,
        releaseId,
        ...input
      }),
      actorUserId: actor.userId,
      context,
      now: this.now(),
      validateAffiliateTask: (affiliateTaskId) => this.assertTaskVisible(actor, affiliateTaskId)
    });
  }

  public async disable(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    releaseId: number,
    input: DisableBody
  ): Promise<OfficialAnnouncementPayload> {
    return this.repository.disable({
      publicId,
      releaseId,
      ...input,
      requestFingerprint: this.fingerprint("disable", {
        actorUserId: actor.userId,
        publicId,
        releaseId,
        ...input
      }),
      actorUserId: actor.userId,
      context,
      now: this.now()
    });
  }

  public async rollback(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    sourceReleaseId: number,
    input: RollbackBody
  ): Promise<OfficialAnnouncementPayload> {
    return this.repository.cloneForRollback({
      publicId,
      releaseId: sourceReleaseId,
      sourceReleaseId,
      ...input,
      requestFingerprint: this.fingerprint("rollback", {
        actorUserId: actor.userId,
        publicId,
        sourceReleaseId,
        ...input
      }),
      actorUserId: actor.userId,
      context,
      now: this.now()
    });
  }

  public async history(
    _actor: AuthenticatedAccessContext,
    publicId: string,
    input: PaginationInput
  ): Promise<{
    list: OfficialAnnouncementPayload[];
    total: number;
    page: number;
    page_size: number;
  }> {
    const pagination = normalizePagination(input);
    const result = await this.repository.listHistory({ publicId, ...pagination });
    return {
      ...result,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  }

  public async getPublishedForAffiliate(
    actor: AuthenticatedAccessContext,
    publicId: string,
    locale: ContentLocaleCode
  ): Promise<PublicOfficialAnnouncementPayload> {
    this.requireAffiliateIdentity(actor);
    const release = await this.repository.findPublished(publicId, locale, this.now());
    if (!release) {
      throw this.contentError("error.content.not_found", 404);
    }
    return {
      publicId: release.publicId,
      version: release.version,
      locale: release.locale,
      title: release.title,
      summary: release.summary,
      body: release.body,
      visibleFrom: release.visibleFrom,
      visibleUntil: release.visibleUntil,
      activatedAt: release.activatedAt,
      taskAction: await this.resolveTaskAction(actor, release.affiliateTaskId)
    };
  }

  private requireAffiliateIdentity(actor: AuthenticatedAccessContext): void {
    if (actor.currentIdentityType !== "scout") {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.affiliate_profile.identity_required",
        statusCode: 403
      });
    }
  }

  private async requireRelease(
    publicId: string,
    releaseId: number
  ): Promise<OfficialAnnouncementPayload> {
    const release = await this.repository.findDraft(publicId, releaseId);
    if (!release) {
      throw this.contentError("error.content.release_not_found", 404);
    }
    return release;
  }

  private async assertTaskVisible(
    actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<void> {
    try {
      await this.marketplacePolicy.getTask(actor, taskId);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        throw this.contentError("error.content.target_unavailable", 409);
      }
      throw error;
    }
  }

  private async resolveTaskAction(
    actor: AuthenticatedAccessContext,
    taskId: number | null
  ): Promise<PublicOfficialAnnouncementPayload["taskAction"]> {
    if (taskId === null) return null;
    try {
      const task = await this.marketplacePolicy.getTask(actor, taskId);
      return { taskCode: task.taskCode, label: task.name, claimable: task.claimable };
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) return null;
      throw error;
    }
  }

  private assertCompleteTranslation(input: { title: string; body: string }): void {
    if (!input.title.trim() || !input.body.trim()) {
      throw this.contentError("error.content.incomplete_translations", 409);
    }
  }

  private fingerprint(action: string, input: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify(this.canonicalize({ action, input })))
      .digest("hex");
  }

  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.canonicalize(item));
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.canonicalize(item)])
      );
    }
    return value;
  }

  private contentError(message: string, statusCode: number): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode });
  }
}
