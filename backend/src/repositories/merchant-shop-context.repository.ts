import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";

export interface MerchantShopContextRow {
  publicId: string;
  name: string;
  city: string;
  status: string;
  selected: boolean;
}

export interface MerchantShopContextPage {
  list: MerchantShopContextRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface MerchantShopContextRepositoryPort {
  listManageableShops(input: {
    identityScopeType: string;
    identityScopeId: number;
    selectedShopPublicId: string | null;
    now: Date;
    page: number;
    pageSize: number;
  }): Promise<MerchantShopContextPage>;
  resolveShop(input: {
    merchantAccountId: number;
    shopPublicId: string;
    now: Date;
  }): Promise<{ shopId: number; shopPublicId: string } | null>;
  resolveDefaultShop(input: {
    merchantAccountId: number;
    now: Date;
  }): Promise<{ shopId: number; shopPublicId: string } | null>;
}

const shopSelect = {
  name: true,
  city: true,
  status: true,
  publicIdentifier: { select: { publicId: true } }
} satisfies Prisma.ShopSelect;

const resolvedShopSelect = {
  shop: { select: { id: true, publicIdentifier: { select: { publicId: true } } } }
} satisfies Prisma.MerchantShopMembershipSelect;

type ShopListRecord = Prisma.ShopGetPayload<{ select: typeof shopSelect }>;
type ResolvedMembershipRecord = Prisma.MerchantShopMembershipGetPayload<{
  select: typeof resolvedShopSelect;
}>;

export class MerchantShopContextRepository implements MerchantShopContextRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listManageableShops(input: {
    identityScopeType: string;
    identityScopeId: number;
    selectedShopPublicId: string | null;
    now: Date;
    page: number;
    pageSize: number;
  }): Promise<MerchantShopContextPage> {
    if (input.identityScopeType === "shop") {
      return this.listDirectShop(input);
    }
    if (input.identityScopeType !== "merchant_account") {
      return { list: [], total: 0, page: input.page, page_size: input.pageSize };
    }

    const where = this.activeMembershipWhere(input.identityScopeId, input.now);
    const [total, records] = await this.client.$transaction(async (transaction) =>
      Promise.all([
        transaction.merchantShopMembership.count({ where }),
        transaction.merchantShopMembership.findMany({
          where,
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          select: { shop: { select: shopSelect } }
        })
      ])
    );

    return {
      list: records.map((record) => this.mapShop(record.shop, input.selectedShopPublicId)),
      total,
      page: input.page,
      page_size: input.pageSize
    };
  }

  public async resolveShop(input: {
    merchantAccountId: number;
    shopPublicId: string;
    now: Date;
  }): Promise<{ shopId: number; shopPublicId: string } | null> {
    const activeWhere = this.activeMembershipWhere(input.merchantAccountId, input.now);
    const record = await this.client.merchantShopMembership.findFirst({
      where: {
        ...activeWhere,
        shop: {
          is: {
            ...activeWhere.shop.is,
            publicIdentifier: {
              is: {
                publicId: input.shopPublicId,
                status: "ACTIVE",
                deletedAt: null
              }
            }
          }
        }
      },
      select: resolvedShopSelect
    });
    return this.mapResolvedShop(record);
  }

  public async resolveDefaultShop(input: {
    merchantAccountId: number;
    now: Date;
  }): Promise<{ shopId: number; shopPublicId: string } | null> {
    const record = await this.client.merchantShopMembership.findFirst({
      where: this.activeMembershipWhere(input.merchantAccountId, input.now),
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: resolvedShopSelect
    });
    return this.mapResolvedShop(record);
  }

  private async listDirectShop(input: {
    identityScopeId: number;
    page: number;
    pageSize: number;
  }): Promise<MerchantShopContextPage> {
    const record = await this.client.shop.findFirst({
      where: {
        id: input.identityScopeId,
        status: { in: ["active", "published"] },
        deletedAt: null,
        publicIdentifier: { is: { status: "ACTIVE", deletedAt: null } }
      },
      select: shopSelect
    });
    const total = record ? 1 : 0;
    return {
      list: record && input.page === 1 ? [this.mapDirectShop(record)] : [],
      total,
      page: input.page,
      page_size: input.pageSize
    };
  }

  private mapDirectShop(record: ShopListRecord): MerchantShopContextRow {
    return {
      ...this.mapShop(record, null),
      selected: true
    };
  }

  private activeMembershipWhere(
    merchantAccountId: number,
    now: Date
  ): Prisma.MerchantShopMembershipWhereInput & {
    shop: { is: Prisma.ShopWhereInput };
  } {
    return {
      merchantAccountId,
      activeKey: { not: null },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      deletedAt: null,
      merchantAccount: { is: { status: "active", deletedAt: null } },
      shop: {
        is: {
          status: { in: ["active", "published"] },
          deletedAt: null,
          publicIdentifier: { is: { status: "ACTIVE", deletedAt: null } }
        }
      }
    };
  }

  private mapShop(
    record: ShopListRecord,
    selectedShopPublicId: string | null
  ): MerchantShopContextRow {
    const publicId = record.publicIdentifier!.publicId;
    return {
      publicId,
      name: record.name,
      city: record.city,
      status: record.status,
      selected: publicId === selectedShopPublicId
    };
  }

  private mapResolvedShop(
    record: ResolvedMembershipRecord | null
  ): { shopId: number; shopPublicId: string } | null {
    if (!record?.shop.publicIdentifier) return null;
    return {
      shopId: record.shop.id,
      shopPublicId: record.shop.publicIdentifier.publicId
    };
  }
}
