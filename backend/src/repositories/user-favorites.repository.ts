import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  UserFavoriteInteractionState,
  UserFavoriteItemType,
  UserFavoriteRow,
  UserFavoritesRepositoryPort
} from "../services/user-favorites.service";
import type { AuthRequestContext } from "../services/auth.service";
import {
  EntityEngagementRepository,
  type EntityFavoriteListItem
} from "./entity-engagement.repository";
import {
  ImChatRecordRepository,
  type ChatRecordFavoritePayload
} from "./im-chat-record.repository";
import { RealtimeRepository, type SocialPostPayload } from "./realtime.repository";

const sourcePageSize = 100;

type Page<T> = { list: T[]; total: number };

export class UserFavoritesRepository implements UserFavoritesRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly entityFavorites = new EntityEngagementRepository(client),
    private readonly social = new RealtimeRepository(client),
    private readonly chatRecords = new ImChatRecordRepository(client)
  ) {}

  public async list(input: {
    userId: number;
    identityId: number;
    type?: UserFavoriteItemType;
    query?: string;
    take: number;
  }): Promise<{ list: UserFavoriteRow[]; total: number }> {
    const includeEntities = !input.type || ["shop", "technician", "service"].includes(input.type);
    const includeSocial = !input.type || input.type === "social_post";
    const includeChat = !input.type || input.type === "chat_record";
    const [entityPage, socialPage, chatPage] = await Promise.all([
      includeEntities ? this.listEntities(input) : Promise.resolve({ list: [], total: 0 }),
      includeSocial ? this.listSocial(input) : Promise.resolve({ list: [], total: 0 }),
      includeChat ? this.listChatRecords(input) : Promise.resolve({ list: [], total: 0 })
    ]);
    const rows = [...entityPage.list, ...socialPage.list, ...chatPage.list];
    const interactions = rows.length
      ? await this.client.userFavoriteInteraction.findMany({
          where: {
            ownerUserId: input.userId,
            deletedAt: null,
            OR: rows.map((row) => ({ itemType: row.type, itemKey: row.itemKey }))
          }
        })
      : [];
    const interactionByKey = new Map(
      interactions.map((item) => [`${item.itemType}:${item.itemKey}`, item])
    );

    return {
      list: rows.map((row) => {
        const interaction = interactionByKey.get(`${row.type}:${row.itemKey}`);
        return {
          ...row,
          pinnedAt: interaction?.pinnedAt ?? null,
          reaction: interaction?.reaction ?? null,
          activityAt: interaction?.reaction ? interaction.updatedAt : row.favoritedAt
        };
      }),
      total: entityPage.total + socialPage.total + chatPage.total
    };
  }

  public async owns(input: {
    userId: number;
    identityId: number;
    itemType: UserFavoriteItemType;
    itemKey: string;
  }): Promise<boolean> {
    if (input.itemType === "social_post") {
      const postId = Number(input.itemKey);
      if (!Number.isSafeInteger(postId) || postId < 1) return false;
      return (
        (await this.client.socialPostBookmark.count({
          where: {
            postId,
            actorUserId: input.userId,
            actorIdentityId: input.identityId,
            deletedAt: null,
            post: { deletedAt: null }
          }
        })) > 0
      );
    }
    if (input.itemType === "chat_record") {
      const favoriteId = Number(input.itemKey);
      if (!Number.isSafeInteger(favoriteId) || favoriteId < 1) return false;
      return (
        (await this.client.imChatRecordFavorite.count({
          where: {
            id: favoriteId,
            ownerUserId: input.userId,
            ownerIdentityId: input.identityId,
            deletedAt: null,
            bundle: { deletedAt: null }
          }
        })) > 0
      );
    }

    const [rawTargetType, rawPublicId] = input.itemKey.includes(":")
      ? input.itemKey.split(":", 2)
      : [input.itemType, input.itemKey];
    const targetType =
      rawTargetType === "technician_service" ? "technician_service" : input.itemType;
    const publicId = rawPublicId || input.itemKey;
    const relation =
      targetType === "shop"
        ? { shop: { publicIdentifier: { publicId } } }
        : targetType === "technician"
          ? {
              technicianProfile: {
                user: { identities: { some: { publicIdentifier: { publicId } } } }
              }
            }
          : targetType === "technician_service"
            ? { technicianService: { publicId } }
            : { service: { publicId } };
    return (
      (await this.client.entityFavorite.count({
        where: { userId: input.userId, deletedAt: null, ...relation }
      })) > 0
    );
  }

  public setPin(input: {
    userId: number;
    itemType: UserFavoriteItemType;
    itemKey: string;
    active: boolean;
    context: AuthRequestContext;
  }): Promise<UserFavoriteInteractionState> {
    return this.writeInteraction({ ...input, mode: "pin" });
  }

  public setReaction(input: {
    userId: number;
    itemType: UserFavoriteItemType;
    itemKey: string;
    reaction: string | null;
    context: AuthRequestContext;
  }): Promise<UserFavoriteInteractionState> {
    return this.writeInteraction({ ...input, mode: "reaction" });
  }

  private async listEntities(input: {
    userId: number;
    type?: UserFavoriteItemType;
    query?: string;
    take: number;
  }): Promise<Page<UserFavoriteRow>> {
    const targetTypes =
      input.type === "service" ? (["service", "technician_service"] as const) : undefined;
    const pages = targetTypes
      ? await Promise.all(
          targetTypes.map((targetType) =>
            this.collect(input.take, (page, pageSize) =>
              this.entityFavorites.listFavorites({
                userId: input.userId,
                page,
                pageSize,
                targetType,
                query: input.query
              })
            )
          )
        )
      : [
          await this.collect(input.take, (page, pageSize) =>
            this.entityFavorites.listFavorites({
              userId: input.userId,
              page,
              pageSize,
              targetType:
                input.type === "shop" || input.type === "technician" ? input.type : undefined,
              query: input.query
            })
          )
        ];
    return {
      list: pages.flatMap((page) => page.list).map(this.mapEntity),
      total: pages.reduce((sum, page) => sum + page.total, 0)
    };
  }

  private async listSocial(input: {
    userId: number;
    identityId: number;
    query?: string;
    take: number;
  }): Promise<Page<UserFavoriteRow>> {
    const page = await this.collect(input.take, (number, pageSize) =>
      this.social.listSocialPosts(
        input.identityId,
        { page: number, pageSize, bookmarked: true, query: input.query },
        input.userId
      )
    );
    const bookmarks = page.list.length
      ? await this.client.socialPostBookmark.findMany({
          where: {
            actorIdentityId: input.identityId,
            postId: { in: page.list.map((post) => post.id) },
            deletedAt: null
          },
          select: { postId: true, createdAt: true }
        })
      : [];
    const favoritedAtByPost = new Map(
      bookmarks.map((bookmark) => [bookmark.postId, bookmark.createdAt])
    );
    return {
      list: page.list.map((post) =>
        this.mapSocial(post, favoritedAtByPost.get(post.id) ?? post.createdAt)
      ),
      total: page.total
    };
  }

  private async listChatRecords(input: {
    identityId: number;
    query?: string;
    take: number;
  }): Promise<Page<UserFavoriteRow>> {
    const page = await this.collect(input.take, (number, pageSize) =>
      this.chatRecords.listFavorites({
        identityId: input.identityId,
        page: number,
        pageSize,
        query: input.query
      })
    );
    return { list: page.list.map(this.mapChatRecord), total: page.total };
  }

  private async collect<T>(
    take: number,
    load: (page: number, pageSize: number) => Promise<Page<T>>
  ): Promise<Page<T>> {
    const list: T[] = [];
    let page = 1;
    let total = 0;
    while (list.length < take) {
      const result = await load(page, Math.min(sourcePageSize, take - list.length));
      total = result.total;
      list.push(...result.list);
      if (list.length >= total || result.list.length === 0) break;
      page += 1;
    }
    return { list, total };
  }

  private readonly mapEntity = (favorite: EntityFavoriteListItem): UserFavoriteRow => {
    const itemKey = `${favorite.targetType}:${favorite.publicId}`;
    const type: UserFavoriteItemType =
      favorite.targetType === "technician_service" ? "service" : favorite.targetType;
    const summary =
      favorite.card.description ?? (favorite.card.kind === "shop" ? favorite.card.address : null);
    const detailPath =
      favorite.targetType === "shop"
        ? `/stores/${favorite.publicId}`
        : favorite.targetType === "technician"
          ? `/profiles/technician/${favorite.publicId}`
          : `/services/${favorite.publicId}`;
    return {
      key: `${type}:${itemKey}`,
      type,
      itemKey,
      title: favorite.card.name,
      summary,
      imageUrl: favorite.card.imageUrl,
      detailPath,
      favoritedAt: favorite.favoritedAt,
      activityAt: favorite.favoritedAt,
      pinnedAt: null,
      reaction: null,
      canForward: true,
      canDelete: true
    };
  };

  private readonly mapSocial = (post: SocialPostPayload, favoritedAt: Date): UserFavoriteRow => ({
    key: `social_post:${post.id}`,
    type: "social_post",
    itemKey: String(post.id),
    title: post.author.displayName,
    summary: post.content,
    imageUrl: post.author.avatarUrl,
    detailPath: `/moments/posts/${post.id}`,
    favoritedAt,
    activityAt: favoritedAt,
    pinnedAt: null,
    reaction: null,
    canForward: true,
    canDelete: true
  });

  private readonly mapChatRecord = (favorite: ChatRecordFavoritePayload): UserFavoriteRow => ({
    key: `chat_record:${favorite.id}`,
    type: "chat_record",
    itemKey: String(favorite.id),
    title: favorite.title,
    summary: favorite.preview,
    imageUrl: null,
    detailPath: `/messages/chat-records/${favorite.bundlePublicId}`,
    favoritedAt: favorite.createdAt,
    activityAt: favorite.createdAt,
    pinnedAt: null,
    reaction: null,
    canForward: true,
    canDelete: true
  });

  private writeInteraction(
    input:
      | {
          userId: number;
          itemType: UserFavoriteItemType;
          itemKey: string;
          mode: "pin";
          active: boolean;
          context: AuthRequestContext;
        }
      | {
          userId: number;
          itemType: UserFavoriteItemType;
          itemKey: string;
          mode: "reaction";
          reaction: string | null;
          context: AuthRequestContext;
        }
  ): Promise<UserFavoriteInteractionState> {
    return this.client.$transaction(async (transaction) => {
      const unique = {
        ownerUserId_itemType_itemKey: {
          ownerUserId: input.userId,
          itemType: input.itemType,
          itemKey: input.itemKey
        }
      };
      const existing = await transaction.userFavoriteInteraction.findUnique({ where: unique });
      const interaction = await transaction.userFavoriteInteraction.upsert({
        where: unique,
        create: {
          ownerUserId: input.userId,
          itemType: input.itemType,
          itemKey: input.itemKey,
          pinnedAt: input.mode === "pin" && input.active ? new Date() : null,
          reaction: input.mode === "reaction" ? input.reaction : null
        },
        update: {
          deletedAt: null,
          ...(input.mode === "pin"
            ? {
                pinnedAt: input.active ? new Date() : null,
                ...(existing ? { updatedAt: existing.updatedAt } : {})
              }
            : { reaction: input.reaction })
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.userId,
          action: input.mode === "pin" ? "favorite.pin.updated" : "favorite.reaction.updated",
          targetType: "UserFavoriteInteraction",
          targetId: interaction.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: {
            itemType: input.itemType,
            itemKey: input.itemKey,
            value: input.mode === "pin" ? input.active : input.reaction
          }
        }
      });
      return {
        itemType: interaction.itemType as UserFavoriteItemType,
        itemKey: interaction.itemKey,
        pinnedAt: interaction.pinnedAt,
        reaction: interaction.reaction,
        updatedAt: interaction.updatedAt
      };
    });
  }
}
