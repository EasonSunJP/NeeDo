import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  EntityEngagementRepositoryPort,
  EntityFavoriteListItem,
  EntityFavoriteState,
  EntityShareReceipt,
  EntityTarget,
  EntityTargetType
} from "../repositories/entity-engagement.repository";
import type { AuthenticatedAccessContext } from "./auth.service";
import type { RealtimeService } from "./realtime.service";
import type {
  PersonalIdentityActor,
  PersonalIdentityScope
} from "./personal-identity-scope.service";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { ShopVisibilityViewer } from "../repositories/shop-visibility.repository";

export type { EntityEngagementRepositoryPort } from "../repositories/entity-engagement.repository";

export class EntityEngagementService {
  public constructor(
    private readonly repository: EntityEngagementRepositoryPort,
    private readonly realtimeService?: Pick<RealtimeService, "createNeedoEntityShare">,
    private readonly personalIdentityScope?: {
      resolve(actor: PersonalIdentityActor): Promise<PersonalIdentityScope>;
    }
  ) {}

  public async setFavorite(
    auth: AuthenticatedAccessContext,
    targetType: EntityTargetType,
    publicId: string,
    isFavorited: boolean
  ): Promise<EntityFavoriteState> {
    const result = await this.repository.setFavorite(
      auth.userId,
      { targetType, publicId },
      isFavorited,
      this.visibilityViewer(auth)
    );
    if (!result) {
      throw this.targetNotFound();
    }
    return result;
  }

  public async getFavoriteStatuses(
    auth: AuthenticatedAccessContext,
    targets: EntityTarget[]
  ): Promise<EntityFavoriteState[]> {
    const states = await this.repository.getFavoriteStatuses(
      auth.userId,
      targets,
      this.visibilityViewer(auth)
    );
    if (states.length !== targets.length) {
      throw this.targetNotFound();
    }
    return states;
  }

  public listFavorites(
    auth: AuthenticatedAccessContext,
    input: { page: number; pageSize: number; targetType?: EntityTargetType }
  ): Promise<PaginatedResponse<EntityFavoriteListItem>> {
    return this.repository.listFavorites({
      ...input,
      userId: auth.userId,
      viewer: this.visibilityViewer(auth)
    });
  }

  public async recordNeedoShare(
    auth: AuthenticatedAccessContext,
    targetType: EntityTargetType,
    publicId: string,
    input: {
      conversationId: number;
      idempotencyKey: string;
    }
  ): Promise<EntityShareReceipt> {
    const target = await this.repository.resolveTarget(
      { targetType, publicId },
      this.visibilityViewer(auth)
    );
    if (!target) {
      throw this.targetNotFound();
    }
    if (!this.realtimeService) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.internal_server_error",
        statusCode: 500
      });
    }
    const actorIdentityId = await this.resolveActorIdentityId(auth);
    return this.realtimeService.createNeedoEntityShare(auth, {
      ...input,
      target,
      requestFingerprint: this.shareFingerprint({
        channel: "needo_message",
        actorIdentityId,
        targetType,
        publicId,
        conversationId: input.conversationId
      })
    });
  }

  public async recordSystemShare(
    auth: AuthenticatedAccessContext,
    targetType: EntityTargetType,
    publicId: string,
    idempotencyKey: string
  ): Promise<EntityShareReceipt> {
    const actorIdentityId = await this.resolveActorIdentityId(auth);
    const outcome = await this.repository.recordSystemShare({
      actorUserId: auth.userId,
      actorIdentityId,
      target: { targetType, publicId },
      idempotencyKey,
      requestFingerprint: this.shareFingerprint({
        channel: "system_share",
        actorIdentityId,
        targetType,
        publicId
      }),
      viewer: this.visibilityViewer(auth)
    });
    if (outcome.status === "target_not_found") {
      throw this.targetNotFound();
    }
    if (outcome.status === "idempotency_conflict") {
      throw new AppError({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.idempotency_key_reused",
        statusCode: 409
      });
    }
    return outcome.receipt;
  }

  private targetNotFound(): AppError {
    return new AppError({
      code: ERROR_CODES.ENTITY_ENGAGEMENT_TARGET_NOT_FOUND,
      message: "error.entity_engagement.target_not_found",
      statusCode: 404
    });
  }

  private async resolveActorIdentityId(auth: AuthenticatedAccessContext): Promise<number> {
    if (this.personalIdentityScope) {
      return (await this.personalIdentityScope.resolve(auth)).identityId;
    }
    return auth.currentIdentityId ?? auth.userId;
  }

  private shareFingerprint(payload: Record<string, string | number>): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  private visibilityViewer(auth: AuthenticatedAccessContext): ShopVisibilityViewer {
    const selectedShopId = auth.selectedMerchantShopId ?? auth.merchantPreviewShopId;
    return {
      userId: auth.userId,
      identityId: auth.currentIdentityId,
      identityType: auth.currentIdentityType,
      identityScopeType: selectedShopId ? "shop" : auth.currentIdentityScopeType,
      identityScopeId: selectedShopId ?? auth.currentIdentityScopeId
    };
  }
}
