import { createHash, randomUUID } from "node:crypto";
import { CONTENT_LOCALES, type ContentLocaleCode } from "../constants/content-locales";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  MerchantNoticeCreateBody,
  NoticeAudienceInput,
  OfficialNoticeBlockInput,
  OfficialNoticeCreateBody,
  OfficialNoticeLifecycleBody,
  OfficialNoticeListQuery,
  OfficialNoticeReadQuery
} from "../validators/official-notice.validator";
import { AppError } from "../utils/app-error";
import { normalizePagination } from "../utils/pagination";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import {
  resolveNoticeIssuerScope,
  resolveNoticeReadScope,
  type NoticeIssuerReadScope,
  type NoticeIssuerScope
} from "./official-notice-scope";

export type OfficialNoticeLevelCode = "general" | "important" | "urgent";
export type OfficialNoticeStatusCode =
  | "draft"
  | "pending_review"
  | "approved"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "archived";

export interface OfficialNoticeTranslationPayload {
  title: string;
  summary: string;
  blocks: OfficialNoticeBlockInput[];
  sourceLocale: ContentLocaleCode;
  isInitialCopy: boolean;
}

export interface OfficialNoticePayload {
  publicId: string;
  level: OfficialNoticeLevelCode;
  status: OfficialNoticeStatusCode;
  sourceLocale: ContentLocaleCode;
  targetSummary: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  cancelledAt: Date | null;
  archivedAt: Date | null;
  lockVersion: number;
  translations: Record<ContentLocaleCode, OfficialNoticeTranslationPayload>;
  audienceCount: number;
  delivery: { pending: number; delivered: number; failed: number; read: number };
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipientOfficialNoticePayload {
  publicId: string;
  level: OfficialNoticeLevelCode;
  title: string;
  summary: string;
  blocks: OfficialNoticeBlockInput[];
  targetSummary: string;
  sentAt: Date;
  readAt: Date | null;
}

export interface CreateAndPlanOfficialNoticeInput {
  publicId: string;
  actorUserId: number;
  context: AuthRequestContext;
  now: Date;
  level: OfficialNoticeLevelCode;
  sourceLocale: ContentLocaleCode;
  issuerScope: NoticeIssuerScope;
  audience: NoticeAudienceInput;
  targetSummary: string;
  scheduledAt: Date;
  sendMode: "now" | "scheduled";
  idempotencyKey: string;
  requestFingerprint: string;
  translations: Record<ContentLocaleCode, OfficialNoticeTranslationPayload>;
}

export interface OfficialNoticeRepositoryPort {
  createAndPlan(input: CreateAndPlanOfficialNoticeInput): Promise<OfficialNoticePayload>;
  dispatchNotice(publicId: string, now: Date): Promise<OfficialNoticePayload>;
  listBackoffice(input: {
    issuerScope: NoticeIssuerReadScope;
    page: number;
    pageSize: number;
    status?: OfficialNoticeStatusCode;
    level?: OfficialNoticeLevelCode;
  }): Promise<{ list: OfficialNoticePayload[]; total: number }>;
  cancel(input: LifecycleMutationInput): Promise<OfficialNoticePayload>;
  archive(input: LifecycleMutationInput): Promise<OfficialNoticePayload>;
  retryFailures(input: LifecycleMutationInput): Promise<OfficialNoticePayload>;
  listMine(input: {
    recipientIdentityId: number;
    locale: ContentLocaleCode;
    unreadOnly: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ list: RecipientOfficialNoticePayload[]; total: number }>;
  markRead(input: {
    publicId: string;
    recipientIdentityId: number;
    actorUserId: number;
    context: AuthRequestContext;
    now: Date;
  }): Promise<{ publicId: string; readAt: Date }>;
  dispatchDueBatch(now: Date, batchSize: number): Promise<OfficialNoticeDispatchResult>;
}

export interface LifecycleMutationInput {
  publicId: string;
  actorUserId: number;
  context: AuthRequestContext;
  now: Date;
  expectedLockVersion: number;
  reason: string;
  idempotencyKey: string;
  requestFingerprint: string;
  issuerScope: NoticeIssuerScope;
}

export interface OfficialNoticeDispatchResult {
  notices: number;
  delivered: number;
  failed: number;
}

export interface OfficialNoticeServiceOptions {
  now?: () => Date;
  createPublicId?: () => string;
}

const identityLabels: Record<string, string> = {
  customer: "用户端",
  technician: "技师端",
  merchant_owner: "商户端",
  merchant_staff: "商户端",
  platform: "产运后台",
  platform_admin: "产运后台",
  scout: "联盟营销"
};

export class OfficialNoticeService {
  private readonly now: () => Date;
  private readonly createPublicId: () => string;

  public constructor(
    private readonly repository: OfficialNoticeRepositoryPort,
    options: OfficialNoticeServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.createPublicId = options.createPublicId ?? randomUUID;
  }

  public async createAndPlan(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: OfficialNoticeCreateBody
  ): Promise<OfficialNoticePayload> {
    return this.createAndPlanScoped(actor, context, input, { type: "platform" });
  }

  public async createAndPlanMerchant(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: MerchantNoticeCreateBody
  ): Promise<OfficialNoticePayload> {
    return this.createAndPlanScoped(actor, context, input, resolveNoticeIssuerScope(actor, "shop"));
  }

  private async createAndPlanScoped(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: OfficialNoticeCreateBody | MerchantNoticeCreateBody,
    issuerScope: NoticeIssuerScope
  ): Promise<OfficialNoticePayload> {
    const now = this.now();
    const scheduledAt = input.sendMode === "now" ? now : new Date(input.scheduledAt as string);
    const translation = {
      title: input.title.trim(),
      summary: input.summary.trim(),
      blocks: structuredClone(input.blocks)
    };
    const translations = Object.fromEntries(
      CONTENT_LOCALES.map((locale) => [
        locale,
        {
          ...structuredClone(translation),
          sourceLocale: input.sourceLocale,
          isInitialCopy: locale !== input.sourceLocale
        }
      ])
    ) as Record<ContentLocaleCode, OfficialNoticeTranslationPayload>;
    const publicId = this.createPublicId();
    const created = await this.repository.createAndPlan({
      publicId,
      actorUserId: actor.userId,
      issuerScope,
      context,
      now,
      level: input.level,
      sourceLocale: input.sourceLocale,
      audience: input.audience,
      targetSummary: this.targetSummary(input.audience),
      scheduledAt,
      sendMode: input.sendMode,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: this.fingerprint(
        "create_and_plan",
        issuerScope.type === "platform"
          ? { actorUserId: actor.userId, input }
          : {
              actorUserId: actor.userId,
              actorIdentityId: issuerScope.actorIdentityId,
              issuerShopId: issuerScope.shopId,
              input
            }
      ),
      translations
    });
    return input.sendMode === "now" && ["scheduled", "sending"].includes(created.status)
      ? this.repository.dispatchNotice(created.publicId, now)
      : created;
  }

  public async listBackoffice(
    _actor: AuthenticatedAccessContext,
    input: OfficialNoticeListQuery
  ): Promise<{ list: OfficialNoticePayload[]; total: number; page: number; page_size: number }> {
    const pagination = normalizePagination(input);
    const result = await this.repository.listBackoffice({
      issuerScope: { type: "platform" },
      ...pagination,
      ...(input.status ? { status: input.status } : {}),
      ...(input.level ? { level: input.level } : {})
    });
    return { ...result, page: pagination.page, page_size: pagination.pageSize };
  }

  public async listMerchant(
    actor: AuthenticatedAccessContext,
    input: OfficialNoticeListQuery
  ): Promise<{ list: OfficialNoticePayload[]; total: number; page: number; page_size: number }> {
    const pagination = normalizePagination(input);
    const result = await this.repository.listBackoffice({
      issuerScope: resolveNoticeReadScope(actor),
      ...pagination,
      ...(input.status ? { status: input.status } : {}),
      ...(input.level ? { level: input.level } : {})
    });
    return { ...result, page: pagination.page, page_size: pagination.pageSize };
  }

  public cancel(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: OfficialNoticeLifecycleBody
  ): Promise<OfficialNoticePayload> {
    return this.repository.cancel(
      this.lifecycle("cancel", actor, context, publicId, input, { type: "platform" })
    );
  }

  public archive(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: OfficialNoticeLifecycleBody
  ): Promise<OfficialNoticePayload> {
    return this.repository.archive(
      this.lifecycle("archive", actor, context, publicId, input, { type: "platform" })
    );
  }

  public retryFailures(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: OfficialNoticeLifecycleBody
  ): Promise<OfficialNoticePayload> {
    return this.repository.retryFailures(
      this.lifecycle("retry_failures", actor, context, publicId, input, { type: "platform" })
    );
  }

  public cancelMerchant(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: OfficialNoticeLifecycleBody
  ): Promise<OfficialNoticePayload> {
    return this.repository.cancel(
      this.lifecycle(
        "cancel",
        actor,
        context,
        publicId,
        input,
        resolveNoticeIssuerScope(actor, "shop")
      )
    );
  }

  public archiveMerchant(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: OfficialNoticeLifecycleBody
  ): Promise<OfficialNoticePayload> {
    return this.repository.archive(
      this.lifecycle(
        "archive",
        actor,
        context,
        publicId,
        input,
        resolveNoticeIssuerScope(actor, "shop")
      )
    );
  }

  public retryMerchantFailures(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: OfficialNoticeLifecycleBody
  ): Promise<OfficialNoticePayload> {
    return this.repository.retryFailures(
      this.lifecycle(
        "retry_failures",
        actor,
        context,
        publicId,
        input,
        resolveNoticeIssuerScope(actor, "shop")
      )
    );
  }

  public async listMine(
    actor: AuthenticatedAccessContext,
    input: OfficialNoticeReadQuery
  ): Promise<{
    list: RecipientOfficialNoticePayload[];
    total: number;
    page: number;
    page_size: number;
  }> {
    const recipientIdentityId = this.requireIdentity(actor);
    const pagination = normalizePagination(input);
    const result = await this.repository.listMine({
      recipientIdentityId,
      locale: input.locale,
      unreadOnly: input.unreadOnly,
      ...pagination
    });
    return { ...result, page: pagination.page, page_size: pagination.pageSize };
  }

  public markRead(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string
  ): Promise<{ publicId: string; readAt: Date }> {
    return this.repository.markRead({
      publicId,
      recipientIdentityId: this.requireIdentity(actor),
      actorUserId: actor.userId,
      context,
      now: this.now()
    });
  }

  private lifecycle(
    action: string,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: OfficialNoticeLifecycleBody,
    issuerScope: NoticeIssuerScope
  ): LifecycleMutationInput {
    return {
      publicId,
      actorUserId: actor.userId,
      context,
      now: this.now(),
      ...input,
      issuerScope,
      requestFingerprint: this.fingerprint(
        action,
        issuerScope.type === "platform"
          ? { actorUserId: actor.userId, publicId, input }
          : {
              actorUserId: actor.userId,
              actorIdentityId: issuerScope.actorIdentityId,
              issuerShopId: issuerScope.shopId,
              publicId,
              input
            }
      )
    };
  }

  private targetSummary(audience: NoticeAudienceInput): string {
    if (audience.type === "all") return "全体用户";
    if (audience.type === "exact_users") return `指定账号 ${audience.userIds.length} 个`;
    if (audience.type === "identity_types")
      return [...new Set(audience.identityTypes.map((type) => identityLabels[type] ?? type))].join(
        " / "
      );
    if (audience.type === "shop_card_holders") return "本店の会員カード保有者";
    if (audience.type === "shop_technicians") return "本店の技師";
    return "本店の従業員";
  }

  private requireIdentity(actor: AuthenticatedAccessContext): number {
    if (!actor.currentIdentityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.auth.identity_required",
        statusCode: 403
      });
    }
    return actor.currentIdentityId;
  }

  private fingerprint(action: string, input: unknown): string {
    return createHash("sha256").update(JSON.stringify({ action, input })).digest("hex");
  }
}
