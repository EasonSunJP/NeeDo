import { ERROR_CODES } from "../constants/error-codes";
import type {
  EntityEngagementRepositoryPort,
  EntityFavoriteListItem,
  EntityFavoriteState,
  EntityTarget,
  EntityTargetType
} from "../repositories/entity-engagement.repository";
import type { AuthenticatedAccessContext } from "./auth.service";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";

export type { EntityEngagementRepositoryPort } from "../repositories/entity-engagement.repository";

export class EntityEngagementService {
  public constructor(private readonly repository: EntityEngagementRepositoryPort) {}

  public async setFavorite(
    auth: AuthenticatedAccessContext,
    targetType: EntityTargetType,
    publicId: string,
    isFavorited: boolean
  ): Promise<EntityFavoriteState> {
    const result = await this.repository.setFavorite(
      auth.userId,
      { targetType, publicId },
      isFavorited
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
    const states = await this.repository.getFavoriteStatuses(auth.userId, targets);
    if (states.length !== targets.length) {
      throw this.targetNotFound();
    }
    return states;
  }

  public listFavorites(
    auth: AuthenticatedAccessContext,
    input: { page: number; pageSize: number; targetType?: EntityTargetType }
  ): Promise<PaginatedResponse<EntityFavoriteListItem>> {
    return this.repository.listFavorites({ ...input, userId: auth.userId });
  }

  private targetNotFound(): AppError {
    return new AppError({
      code: ERROR_CODES.ENTITY_ENGAGEMENT_TARGET_NOT_FOUND,
      message: "error.entity_engagement.target_not_found",
      statusCode: 404
    });
  }
}
