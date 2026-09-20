import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import {
  buildPaginatedResponse,
  normalizePagination,
  type PaginatedResponse
} from "../utils/pagination";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type {
  PersonalIdentityActor,
  PersonalIdentityScope
} from "./personal-identity-scope.service";

export type UserFavoriteItemType =
  | "shop"
  | "technician"
  | "service"
  | "social_post"
  | "chat_record";

export interface UserFavoriteRow {
  key: string;
  type: UserFavoriteItemType;
  itemKey: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  detailPath: string;
  favoritedAt: Date;
  activityAt: Date;
  pinnedAt: Date | null;
  reaction: string | null;
  canForward: boolean;
  canDelete: boolean;
}

export interface UserFavoriteInteractionState {
  itemType: UserFavoriteItemType;
  itemKey: string;
  pinnedAt: Date | null;
  reaction: string | null;
  updatedAt: Date;
}

export interface UserFavoritesRepositoryPort {
  list(input: {
    userId: number;
    identityId: number;
    type?: UserFavoriteItemType;
    query?: string;
    take: number;
  }): Promise<{ list: UserFavoriteRow[]; total: number }>;
  owns(input: {
    userId: number;
    identityId: number;
    itemType: UserFavoriteItemType;
    itemKey: string;
  }): Promise<boolean>;
  setPin(input: {
    userId: number;
    itemType: UserFavoriteItemType;
    itemKey: string;
    active: boolean;
    context: AuthRequestContext;
  }): Promise<UserFavoriteInteractionState>;
  setReaction(input: {
    userId: number;
    itemType: UserFavoriteItemType;
    itemKey: string;
    reaction: string | null;
    context: AuthRequestContext;
  }): Promise<UserFavoriteInteractionState>;
}

type IdentityScopePort = {
  resolve(actor: PersonalIdentityActor): Promise<PersonalIdentityScope>;
};

export class UserFavoritesService {
  public constructor(
    private readonly repository: UserFavoritesRepositoryPort,
    private readonly personalIdentityScope: IdentityScopePort
  ) {}

  public async listFavorites(
    auth: AuthenticatedAccessContext,
    input: {
      page?: number;
      pageSize?: number;
      type?: UserFavoriteItemType;
      query?: string;
    }
  ): Promise<PaginatedResponse<UserFavoriteRow>> {
    const pagination = normalizePagination(input);
    const scope = await this.personalIdentityScope.resolve(auth);
    const source = await this.repository.list({
      userId: auth.userId,
      identityId: scope.identityId,
      type: input.type,
      query: input.query,
      take: pagination.page * pagination.pageSize
    });
    const sorted = [...source.list].sort(this.compareRows);
    const offset = (pagination.page - 1) * pagination.pageSize;
    return buildPaginatedResponse(
      sorted.slice(offset, offset + pagination.pageSize),
      source.total,
      pagination
    );
  }

  public async setPin(
    auth: AuthenticatedAccessContext,
    itemType: UserFavoriteItemType,
    itemKey: string,
    active: boolean,
    context: AuthRequestContext = { ip: "unknown" }
  ): Promise<UserFavoriteInteractionState> {
    const identityId = await this.requireOwned(auth, itemType, itemKey);
    void identityId;
    return this.repository.setPin({ userId: auth.userId, itemType, itemKey, active, context });
  }

  public async setReaction(
    auth: AuthenticatedAccessContext,
    itemType: UserFavoriteItemType,
    itemKey: string,
    reaction: string | null,
    context: AuthRequestContext = { ip: "unknown" }
  ): Promise<UserFavoriteInteractionState> {
    const identityId = await this.requireOwned(auth, itemType, itemKey);
    void identityId;
    return this.repository.setReaction({ userId: auth.userId, itemType, itemKey, reaction, context });
  }

  private readonly compareRows = (left: UserFavoriteRow, right: UserFavoriteRow): number => {
    if (Boolean(left.pinnedAt) !== Boolean(right.pinnedAt)) {
      return left.pinnedAt ? -1 : 1;
    }
    if (left.pinnedAt && right.pinnedAt) {
      const pinnedOrder = right.pinnedAt.getTime() - left.pinnedAt.getTime();
      if (pinnedOrder !== 0) return pinnedOrder;
    }
    const activityOrder = right.activityAt.getTime() - left.activityAt.getTime();
    return activityOrder || left.key.localeCompare(right.key);
  };

  private async requireOwned(
    auth: AuthenticatedAccessContext,
    itemType: UserFavoriteItemType,
    itemKey: string
  ): Promise<number> {
    const scope = await this.personalIdentityScope.resolve(auth);
    const owned = await this.repository.owns({
      userId: auth.userId,
      identityId: scope.identityId,
      itemType,
      itemKey
    });
    if (!owned) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.favorite.not_found",
        statusCode: 404
      });
    }
    return scope.identityId;
  }
}
