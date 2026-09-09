import type { ContentLocaleCode } from "../constants/content-locales";
import type { ContentMediaProjection, ContentMediaService, UploadContentMediaInput } from "./content-media.service";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";
import type {
  ShopPresentationContent,
  ShopPresentationLocaleSyncBody,
  ShopPresentationLocaleUpdateBody
} from "../validators/shop-presentation.validator";
import { AppError } from "../utils/app-error";

export interface ShopPresentationLocalePayload {
  locale: ContentLocaleCode;
  lockVersion: number;
  content: ShopPresentationContent;
  updatedAt: string | null;
}

export interface ShopPresentationWorkspacePayload {
  shopId: number;
  locales: Record<ContentLocaleCode, ShopPresentationLocalePayload>;
  media: Record<string, { url: string; altText: string | null }>;
  services: Array<{
    id: number;
    name: string;
    description: string;
    priceAmount: string;
    currency: string;
    durationMinutes: number;
    coverMediaAssetPublicId: string | null;
  }>;
}

export interface ShopPresentationRepositoryPort {
  getWorkspace(shopId: number): Promise<ShopPresentationWorkspacePayload>;
  updateLocale(input: {
    shopId: number;
    locale: ContentLocaleCode;
    expectedLockVersion: number;
    content: ShopPresentationContent;
    actorUserId: number;
    actorIdentityId: number;
    context: AuthRequestContext;
    updatedAt: Date;
  }): Promise<ShopPresentationLocalePayload>;
  syncLocale(input: {
    shopId: number;
    sourceLocale: ContentLocaleCode;
    expectedLockVersions: Record<ContentLocaleCode, number>;
    content: ShopPresentationContent;
    actorUserId: number;
    actorIdentityId: number;
    context: AuthRequestContext;
    updatedAt: Date;
  }): Promise<Record<ContentLocaleCode, ShopPresentationLocalePayload>>;
}

export class ShopPresentationService {
  public constructor(
    private readonly repository: ShopPresentationRepositoryPort,
    private readonly auditLogService: Pick<AuditLogService, "record">,
    private readonly now: () => Date = () => new Date(),
    private readonly mediaService?: Pick<ContentMediaService, "upload">
  ) {}

  public async getWorkspace(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<ShopPresentationWorkspacePayload> {
    const shopId = this.requireWritableMerchantScope(actor);
    const workspace = await this.repository.getWorkspace(shopId);
    await this.auditLogService.record({
      actor,
      action: "merchant_admin.shop_presentation.read",
      targetType: "Shop",
      targetId: shopId,
      context,
      metadata: { shopId }
    });
    return workspace;
  }

  public async uploadMedia(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: Omit<UploadContentMediaInput, "now">
  ): Promise<ContentMediaProjection> {
    const shopId = this.requireWritableMerchantScope(actor);
    if (!actor.currentIdentityId || !this.mediaService) {
      throw this.identityForbidden();
    }
    return this.mediaService.upload(actor, context, { ...input, now: this.now() }, {
      entityType: "shop_presentation_upload",
      entityId: shopId,
      shopId,
      ownerIdentityId: actor.currentIdentityId,
      usageType: "shop_presentation_draft"
    });
  }

  public async updateLocale(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    locale: ContentLocaleCode,
    input: ShopPresentationLocaleUpdateBody
  ): Promise<ShopPresentationLocalePayload> {
    const shopId = this.requireWritableMerchantScope(actor);
    if (!actor.currentIdentityId) {
      throw this.identityForbidden();
    }
    return this.repository.updateLocale({
      shopId,
      locale,
      expectedLockVersion: input.expectedLockVersion,
      content: input.content,
      actorUserId: actor.userId,
      actorIdentityId: actor.currentIdentityId,
      context,
      updatedAt: this.now()
    });
  }

  public async syncLocale(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    sourceLocale: ContentLocaleCode,
    input: ShopPresentationLocaleSyncBody
  ): Promise<Record<ContentLocaleCode, ShopPresentationLocalePayload>> {
    const shopId = this.requireWritableMerchantScope(actor);
    if (!actor.currentIdentityId) {
      throw this.identityForbidden();
    }
    return this.repository.syncLocale({
      shopId,
      sourceLocale,
      expectedLockVersions: input.expectedLockVersions,
      content: input.content,
      actorUserId: actor.userId,
      actorIdentityId: actor.currentIdentityId,
      context,
      updatedAt: this.now()
    });
  }

  private requireWritableMerchantScope(actor: AuthenticatedAccessContext): number {
    if (actor.isReadOnlyMerchantPreview) {
      throw this.identityForbidden();
    }
    return requireMerchantShopId(actor);
  }

  private identityForbidden(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }
}
