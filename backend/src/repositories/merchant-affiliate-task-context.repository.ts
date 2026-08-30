import type { Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  MerchantAffiliatePublisherOption,
  MerchantAffiliateServiceOption,
  MerchantAffiliateShopOption,
  MerchantAffiliateTaskContextRepositoryPort,
  MerchantAffiliatePublisherType
} from "../services/merchant-affiliate-task-context.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";
import { AppError } from "../utils/app-error";

type ContextPrismaClient = PrismaClient | Prisma.TransactionClient;

const activePublicIdentifierWhere = {
  is: { kind: "SHOP", status: "ACTIVE", deletedAt: null }
} satisfies Prisma.PublicIdentifierNullableScalarRelationFilter;

const activeShopWhere = {
  status: { in: ["active", "published"] },
  deletedAt: null,
  publicIdentifier: activePublicIdentifierWhere
} satisfies Prisma.ShopWhereInput;

const activeMembershipWhere = (now: Date) =>
  ({
    activeKey: { not: null },
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    deletedAt: null
  }) satisfies Prisma.MerchantShopMembershipWhereInput;

const publicShopSelect = {
  id: true,
  name: true,
  city: true,
  publicIdentifier: { select: { publicId: true } }
} satisfies Prisma.ShopSelect;

type PublicShopRow = Prisma.ShopGetPayload<{ select: typeof publicShopSelect }>;

export class MerchantAffiliateTaskContextRepository
  implements MerchantAffiliateTaskContextRepositoryPort
{
  public constructor(private readonly client: ContextPrismaClient = prisma) {}

  public async findCurrentShopPublisher(input: {
    shopId: number;
    keyword?: string;
  }): Promise<MerchantAffiliatePublisherOption | null> {
    const shop = await this.client.shop.findFirst({
      where: {
        id: input.shopId,
        ...activeShopWhere,
        ...(input.keyword ? { name: { contains: input.keyword } } : {})
      },
      select: publicShopSelect
    });
    if (!shop) return null;

    return {
      publisherType: "shop",
      merchantAccountId: null,
      shopId: shop.id,
      publicId: this.requirePublicId(shop),
      displayName: shop.name,
      current: true,
      manageableShopCount: 1
    };
  }

  public async listManageableMerchantPublishers(input: {
    userId: number;
    keyword?: string;
    offset: number;
    limit: number;
    now: Date;
  }): Promise<{ list: MerchantAffiliatePublisherOption[]; total: number }> {
    const where = await this.manageableMerchantAccountWhere(input.userId, input.keyword);
    const [accounts, total] = await Promise.all([
      this.client.merchantAccount.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { id: "asc" },
        skip: input.offset,
        take: input.limit
      }),
      this.client.merchantAccount.count({ where })
    ]);
    const accountIds = accounts.map((account) => account.id);
    const counts =
      accountIds.length === 0
        ? []
        : await this.client.merchantShopMembership.groupBy({
            by: ["merchantAccountId"],
            where: {
              merchantAccountId: { in: accountIds },
              ...activeMembershipWhere(input.now),
              merchantAccount: { status: "active", deletedAt: null },
              shop: activeShopWhere
            },
            _count: { _all: true }
          });
    const countByAccountId = new Map(
      counts.map((row) => [row.merchantAccountId, row._count._all])
    );

    return {
      list: accounts.map((account) => ({
        publisherType: "merchant_account",
        merchantAccountId: account.id,
        shopId: null,
        publicId: null,
        displayName: account.name,
        current: false,
        manageableShopCount: countByAccountId.get(account.id) ?? 0
      })),
      total
    };
  }

  public async isManageableMerchantAccount(
    userId: number,
    merchantAccountId: number
  ): Promise<boolean> {
    const where = await this.manageableMerchantAccountWhere(userId);
    return (
      (await this.client.merchantAccount.count({
        where: { AND: [where, { id: merchantAccountId }] }
      })) === 1
    );
  }

  public async listCurrentShop(input: {
    shopId: number;
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<MerchantAffiliateShopOption>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ShopWhereInput = {
      id: input.shopId,
      ...activeShopWhere,
      ...(input.keyword ? { name: { contains: input.keyword } } : {})
    };
    const [shops, total] = await Promise.all([
      this.client.shop.findMany({
        where,
        select: publicShopSelect,
        orderBy: { id: "asc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.shop.count({ where })
    ]);
    return buildPaginatedResponse(
      await this.mapShopsWithServiceCounts(shops),
      total,
      pagination
    );
  }

  public async listMerchantShops(input: {
    merchantAccountId: number;
    keyword?: string;
    page: number;
    pageSize: number;
    now: Date;
  }): Promise<PaginatedResponse<MerchantAffiliateShopOption>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.MerchantShopMembershipWhereInput = {
      merchantAccountId: input.merchantAccountId,
      ...activeMembershipWhere(input.now),
      merchantAccount: { status: "active", deletedAt: null },
      shop: {
        ...activeShopWhere,
        ...(input.keyword ? { name: { contains: input.keyword } } : {})
      }
    };
    const [memberships, total] = await Promise.all([
      this.client.merchantShopMembership.findMany({
        where,
        select: { shop: { select: publicShopSelect } },
        orderBy: { shopId: "asc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.merchantShopMembership.count({ where })
    ]);
    return buildPaginatedResponse(
      await this.mapShopsWithServiceCounts(memberships.map((membership) => membership.shop)),
      total,
      pagination
    );
  }

  public async countEligibleShops(input: {
    publisherType: MerchantAffiliatePublisherType;
    currentShopId: number | null;
    merchantAccountId: number | null;
    shopIds: number[];
    now: Date;
  }): Promise<number> {
    if (input.publisherType === "shop") {
      return this.client.shop.count({
        where: {
          id: input.currentShopId ?? -1,
          AND: [{ id: { in: input.shopIds } }, activeShopWhere]
        }
      });
    }
    return this.client.merchantShopMembership.count({
      where: {
        merchantAccountId: input.merchantAccountId ?? -1,
        shopId: { in: input.shopIds },
        ...activeMembershipWhere(input.now),
        merchantAccount: { status: "active", deletedAt: null },
        shop: activeShopWhere
      }
    });
  }

  public async listServices(input: {
    shopIds: number[];
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<MerchantAffiliateServiceOption>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ServiceWhereInput = {
      shopId: { in: input.shopIds },
      status: { in: ["active", "published"] },
      currency: "JPY",
      deletedAt: null,
      shop: activeShopWhere,
      ...(input.keyword ? { name: { contains: input.keyword } } : {})
    };
    const [services, total] = await Promise.all([
      this.client.service.findMany({
        where,
        select: {
          id: true,
          shopId: true,
          name: true,
          priceAmount: true,
          shop: {
            select: {
              name: true,
              publicIdentifier: { select: { publicId: true } }
            }
          }
        },
        orderBy: [{ shopId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.service.count({ where })
    ]);

    return buildPaginatedResponse(
      services.map((service) => ({
        serviceId: service.id,
        shopId: service.shopId,
        serviceName: service.name,
        priceJpy: service.priceAmount.toNumber(),
        shopName: service.shop.name,
        shopPublicId: this.requirePublicId(service.shop)
      })),
      total,
      pagination
    );
  }

  public async findTaskDisplayResources(input: {
    merchantAccountIds: number[];
    shopIds: number[];
  }): Promise<{
    merchantAccounts: Array<{ id: number; name: string }>;
    shops: Array<{ id: number; publicId: string | null }>;
  }> {
    const merchantAccountIds = [...new Set(input.merchantAccountIds)].sort(
      (left, right) => left - right
    );
    const shopIds = [...new Set(input.shopIds)].sort((left, right) => left - right);
    const [merchantAccounts, shops] = await Promise.all([
      merchantAccountIds.length === 0
        ? Promise.resolve([])
        : this.client.merchantAccount.findMany({
            where: { id: { in: merchantAccountIds }, status: "active", deletedAt: null },
            select: { id: true, name: true },
            orderBy: { id: "asc" }
          }),
      shopIds.length === 0
        ? Promise.resolve([])
        : this.client.shop.findMany({
            where: { id: { in: shopIds }, deletedAt: null },
            select: {
              id: true,
              publicIdentifier: {
                select: { publicId: true, kind: true, status: true, deletedAt: true }
              }
            },
            orderBy: { id: "asc" }
          })
    ]);

    return {
      merchantAccounts,
      shops: shops.map((shop) => ({
        id: shop.id,
        publicId:
          shop.publicIdentifier?.kind === "SHOP" &&
          shop.publicIdentifier.status === "ACTIVE" &&
          shop.publicIdentifier.deletedAt === null
            ? shop.publicIdentifier.publicId
            : null
      }))
    };
  }

  private async manageableMerchantAccountWhere(
    userId: number,
    keyword?: string
  ): Promise<Prisma.MerchantAccountWhereInput> {
    const scopedRoles = await this.client.userRole.findMany({
      where: {
        userId,
        deletedAt: null,
        scopeType: { in: ["merchant", "merchant_account"] },
        scopeId: { not: null },
        role: {
          deletedAt: null,
          code: { in: ["merchant_owner", "merchant_staff"] }
        }
      },
      select: { scopeId: true }
    });
    const scopedIds = [
      ...new Set(scopedRoles.flatMap((role) => (role.scopeId === null ? [] : [role.scopeId])))
    ].sort((left, right) => left - right);

    return {
      deletedAt: null,
      status: "active",
      OR: [{ ownerUserId: userId }, ...(scopedIds.length ? [{ id: { in: scopedIds } }] : [])],
      ...(keyword ? { name: { contains: keyword } } : {})
    };
  }

  private async mapShopsWithServiceCounts(
    shops: PublicShopRow[]
  ): Promise<MerchantAffiliateShopOption[]> {
    const shopIds = shops.map((shop) => shop.id);
    const counts =
      shopIds.length === 0
        ? []
        : await this.client.service.groupBy({
            by: ["shopId"],
            where: {
              shopId: { in: shopIds },
              status: { in: ["active", "published"] },
              currency: "JPY",
              deletedAt: null
            },
            _count: { _all: true }
          });
    const countByShopId = new Map(counts.map((row) => [row.shopId, row._count._all]));
    return shops.map((shop) => ({
      shopId: shop.id,
      publicId: this.requirePublicId(shop),
      name: shop.name,
      city: shop.city,
      activeServiceCount: countByShopId.get(shop.id) ?? 0
    }));
  }

  private requirePublicId(input: { publicIdentifier: { publicId: string } | null }): string {
    if (!input.publicIdentifier) {
      throw new AppError({
        code: ERROR_CODES.PUBLIC_IDENTIFIER_ALLOCATION_UNAVAILABLE,
        message: "error.public_identifier_allocation_unavailable",
        statusCode: 503
      });
    }
    return input.publicIdentifier.publicId;
  }
}
