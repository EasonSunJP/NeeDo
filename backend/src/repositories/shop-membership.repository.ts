import {
  ShopCustomerMembershipStatus,
  ShopMembershipCardStatus,
  ShopMembershipCardType,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import type { AuditLogCreateInput } from "./audit-log.repository";
import { toAuditLogCreateData } from "./audit-log.repository";
import { buildPaginatedResponse, toPrismaPagination, type PaginatedResponse, type PaginationInput } from "../utils/pagination";

export type ShopMembershipStatusPayload = "active" | "ended";
export type ShopMembershipCardTypePayload = "stored_value" | "count" | "benefit";
export type ShopMembershipCardStatusPayload = "active" | "frozen" | "expired" | "void";
export type ShopMembershipAnalyticsPeriod = "last7days" | "last30days" | "last90days";

export interface ShopMembershipStorePayload {
  id: number;
  shopNo: string | null;
  name: string;
  city: string;
  address: string;
}

export interface ShopMembershipCardPayload {
  publicId: string;
  cardNoMasked: string;
  name: string;
  type: ShopMembershipCardTypePayload;
  status: ShopMembershipCardStatusPayload;
  principalBalanceJpy: number | null;
  bonusBalanceJpy: number | null;
  remainingUses: number | null;
  totalUses: number | null;
  issuedAt: Date;
  expiresAt: Date | null;
  frozenAt: Date | null;
}

export interface MerchantShopMembershipListItemPayload {
  internalId: number;
  publicId: string;
  customerProfileId: number;
  customerNeedoId: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  status: ShopMembershipStatusPayload;
  source: "merchant_manual";
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  cardCount: number;
  activeCardCount: number;
  lastActivityAt: Date;
}

export interface MerchantShopMembershipDetailPayload extends MerchantShopMembershipListItemPayload {
  shop: ShopMembershipStorePayload;
  cards: ShopMembershipCardPayload[];
}

export interface ShopMembershipActivityPayload {
  id: string;
  action: "membership_created";
  membershipPublicId: string;
  customerNeedoId: string;
  customerDisplayName: string;
  actorName: string;
  occurredAt: Date;
}

export interface ShopMembershipOverviewPayload {
  shop: ShopMembershipStorePayload;
  activeMemberCount: number;
  todayNewMemberCount: number;
  activeCardCount: number;
  expiringSoonCardCount: number;
  recentActivities: ShopMembershipActivityPayload[];
}

export interface ShopMembershipCandidatePayload {
  customerNeedoId: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  lastOrderAt: Date;
}

export interface ShopMembershipCandidateRecord extends ShopMembershipCandidatePayload {
  customerProfileId: number;
  shopNo: string | null;
}

export interface MerchantShopMembershipCardPayload extends ShopMembershipCardPayload {
  membershipPublicId: string;
  customerNeedoId: string;
  customerDisplayName: string;
}

export interface ShopMembershipAnalyticsPayload {
  period: ShopMembershipAnalyticsPeriod;
  from: Date;
  to: Date;
  activeMemberCount: number;
  newMemberCount: number;
  cardStatusCounts: Record<ShopMembershipCardStatusPayload, number>;
  dailyNewMembers: Array<{ date: string; count: number }>;
}

export interface CustomerShopMembershipListItemPayload {
  internalId: number;
  publicId: string;
  status: ShopMembershipStatusPayload;
  startedAt: Date;
  endedAt: Date | null;
  cardCount: number;
  activeCardCount: number;
  expiringSoonCardCount: number;
  updatedAt: Date;
  shop: ShopMembershipStorePayload;
}

export interface CustomerShopMembershipDetailPayload extends CustomerShopMembershipListItemPayload {
  cards: ShopMembershipCardPayload[];
}

export interface MembershipListInput extends PaginationInput {
  keyword?: string;
  status?: ShopMembershipStatusPayload;
}

export interface MembershipCardListInput extends PaginationInput {
  status?: ShopMembershipCardStatusPayload;
  type?: ShopMembershipCardTypePayload;
}

export interface MembershipAnalyticsRange {
  period: ShopMembershipAnalyticsPeriod;
  from: Date;
  to: Date;
  dateKeys: string[];
}

export interface CreateShopMembershipRepositoryInput {
  actorId: number;
  customerNeedoId: string;
  customerProfileId: number;
  shopId: number;
  shopNo: string | null;
  audit: AuditLogCreateInput;
}

export interface ShopMembershipRepositoryPort {
  getOverview: (shopId: number, todayStart: Date, expiryCutoff: Date) => Promise<ShopMembershipOverviewPayload | null>;
  listMemberships: (shopId: number, input: MembershipListInput) => Promise<PaginatedResponse<MerchantShopMembershipListItemPayload>>;
  findMembershipDetail: (shopId: number, publicId: string) => Promise<MerchantShopMembershipDetailPayload | null>;
  listCandidates: (shopId: number, input: Omit<MembershipListInput, "status">) => Promise<PaginatedResponse<ShopMembershipCandidatePayload>>;
  findCandidateByNeedoId: (shopId: number, customerNeedoId: string) => Promise<ShopMembershipCandidateRecord | null>;
  createMembershipWithAudit: (input: CreateShopMembershipRepositoryInput) => Promise<MerchantShopMembershipDetailPayload>;
  listCards: (shopId: number, input: MembershipCardListInput) => Promise<PaginatedResponse<MerchantShopMembershipCardPayload>>;
  listActivities: (shopId: number, input: PaginationInput) => Promise<PaginatedResponse<ShopMembershipActivityPayload>>;
  getAnalytics: (shopId: number, range: MembershipAnalyticsRange) => Promise<ShopMembershipAnalyticsPayload>;
  listCustomerMemberships: (customerProfileId: number, input: Omit<MembershipListInput, "keyword">) => Promise<PaginatedResponse<CustomerShopMembershipListItemPayload>>;
  findCustomerMembershipDetail: (customerProfileId: number, publicId: string) => Promise<CustomerShopMembershipDetailPayload | null>;
}

const shopSelect = { id: true, shopNo: true, name: true, city: true, address: true } as const;
const customerSelect = {
  displayName: true,
  city: true,
  user: { select: { needoId: true, avatarUrl: true } }
} as const;
const cardSelect = {
  publicId: true,
  cardNo: true,
  name: true,
  type: true,
  status: true,
  principalBalanceJpy: true,
  bonusBalanceJpy: true,
  remainingUses: true,
  totalUses: true,
  issuedAt: true,
  expiresAt: true,
  frozenAt: true
} as const;

interface MembershipCustomerSnapshot {
  displayName: string;
  city: string | null;
  user: { needoId: string; avatarUrl: string | null };
}

interface MembershipCardRecord {
  publicId: string;
  cardNo: string;
  name: string;
  type: ShopMembershipCardType;
  status: ShopMembershipCardStatus;
  principalBalanceJpy: number | null;
  bonusBalanceJpy: number | null;
  remainingUses: number | null;
  totalUses: number | null;
  issuedAt: Date;
  expiresAt: Date | null;
  frozenAt: Date | null;
}

interface MerchantMembershipListRecord {
  id: number;
  publicId: string;
  customerProfileId: number;
  status: ShopCustomerMembershipStatus;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customerProfile: MembershipCustomerSnapshot;
  cards: Array<{ id: number }>;
  _count: { cards: number };
}

interface MerchantMembershipDetailRecord {
  id: number;
  publicId: string;
  customerProfileId: number;
  status: ShopCustomerMembershipStatus;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  shop: ShopMembershipStorePayload;
  customerProfile: MembershipCustomerSnapshot;
  cards: MembershipCardRecord[];
}

interface CustomerMembershipListRecord {
  id: number;
  publicId: string;
  status: ShopCustomerMembershipStatus;
  startedAt: Date;
  endedAt: Date | null;
  updatedAt: Date;
  shop: ShopMembershipStorePayload;
  cards: Array<{ status: ShopMembershipCardStatus; expiresAt: Date | null }>;
}

export class ShopMembershipRepository implements ShopMembershipRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async getOverview(shopId: number, todayStart: Date, expiryCutoff: Date): Promise<ShopMembershipOverviewPayload | null> {
    const shopPromise = this.client.shop.findFirst({ where: { id: shopId, deletedAt: null }, select: shopSelect });
    const membershipWhere: Prisma.ShopCustomerMembershipWhereInput = { shopId, status: ShopCustomerMembershipStatus.ACTIVE, deletedAt: null };
    const cardWhere: Prisma.ShopMembershipCardWhereInput = {
      membership: { shopId, deletedAt: null },
      status: ShopMembershipCardStatus.ACTIVE,
      deletedAt: null
    };
    const [shop, activeMemberCount, todayNewMemberCount, activeCardCount, expiringSoonCardCount, recent] = await Promise.all([
      shopPromise,
      this.client.shopCustomerMembership.count({ where: membershipWhere }),
      this.client.shopCustomerMembership.count({ where: { ...membershipWhere, startedAt: { gte: todayStart } } }),
      this.client.shopMembershipCard.count({ where: cardWhere }),
      this.client.shopMembershipCard.count({ where: { ...cardWhere, expiresAt: { gte: todayStart, lte: expiryCutoff } } }),
      this.listActivities(shopId, { page: 1, pageSize: 5 })
    ]);
    if (!shop) return null;
    return { shop, activeMemberCount, todayNewMemberCount, activeCardCount, expiringSoonCardCount, recentActivities: recent.list };
  }

  public async listMemberships(shopId: number, input: MembershipListInput): Promise<PaginatedResponse<MerchantShopMembershipListItemPayload>> {
    const pagination = toPrismaPagination(input);
    const keyword = input.keyword?.trim();
    const where: Prisma.ShopCustomerMembershipWhereInput = {
      shopId,
      deletedAt: null,
      ...(input.status ? { status: this.membershipStatusToDb(input.status) } : {}),
      ...(keyword
        ? {
            OR: [
              { publicId: { contains: keyword } },
              { customerProfile: { displayName: { contains: keyword } } },
              { customerProfile: { user: { needoId: { contains: keyword.toLowerCase() } } } }
            ]
          }
        : {})
    };
    const [records, total] = await Promise.all([
      this.client.shopCustomerMembership.findMany({
        where,
        select: {
          id: true,
          publicId: true,
          customerProfileId: true,
          status: true,
          source: true,
          startedAt: true,
          endedAt: true,
          createdAt: true,
          updatedAt: true,
          customerProfile: { select: customerSelect },
          cards: { where: { status: ShopMembershipCardStatus.ACTIVE, deletedAt: null }, select: { id: true } },
          _count: { select: { cards: { where: { deletedAt: null } } } }
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.shopCustomerMembership.count({ where })
    ]);
    return buildPaginatedResponse(records.map((record) => this.mapMerchantListItem(record)), total, pagination);
  }

  public async findMembershipDetail(shopId: number, publicId: string): Promise<MerchantShopMembershipDetailPayload | null> {
    const record = await this.client.shopCustomerMembership.findFirst({
      where: { publicId, shopId, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        customerProfileId: true,
        status: true,
        source: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        updatedAt: true,
        shop: { select: shopSelect },
        customerProfile: { select: customerSelect },
        cards: { where: { deletedAt: null }, select: cardSelect, orderBy: [{ issuedAt: "desc" }, { publicId: "desc" }] }
      }
    });
    return record ? this.mapMerchantDetail(record) : null;
  }

  public async listCandidates(shopId: number, input: Omit<MembershipListInput, "status">): Promise<PaginatedResponse<ShopMembershipCandidatePayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.candidateWhere(shopId, input.keyword);
    const [records, total] = await Promise.all([
      this.client.customerProfile.findMany({
        where,
        select: {
          id: true,
          displayName: true,
          city: true,
          user: {
            select: {
              needoId: true,
              avatarUrl: true,
              bookingOrders: { where: { shopId, deletedAt: null }, select: { startsAt: true }, orderBy: { startsAt: "desc" }, take: 1 }
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.customerProfile.count({ where })
    ]);
    return buildPaginatedResponse(
      records.flatMap((record) => {
        const lastOrderAt = record.user.bookingOrders[0]?.startsAt;
        return lastOrderAt ? [{ customerNeedoId: record.user.needoId, displayName: record.displayName, avatarUrl: record.user.avatarUrl, city: record.city, lastOrderAt }] : [];
      }),
      total,
      pagination
    );
  }

  public async findCandidateByNeedoId(shopId: number, customerNeedoId: string): Promise<ShopMembershipCandidateRecord | null> {
    const record = await this.client.customerProfile.findFirst({
      where: this.candidateWhere(shopId, customerNeedoId),
      select: {
        id: true,
        displayName: true,
        city: true,
        user: {
          select: {
            needoId: true,
            avatarUrl: true,
            bookingOrders: {
              where: { shopId, deletedAt: null },
              select: { startsAt: true, shop: { select: { shopNo: true } } },
              orderBy: { startsAt: "desc" },
              take: 1
            }
          }
        }
      }
    });
    const order = record?.user.bookingOrders[0];
    if (!record || !order) return null;
    return {
      customerProfileId: record.id,
      customerNeedoId: record.user.needoId,
      displayName: record.displayName,
      avatarUrl: record.user.avatarUrl,
      city: record.city,
      lastOrderAt: order.startsAt,
      shopNo: order.shop.shopNo
    };
  }

  public async createMembershipWithAudit(input: CreateShopMembershipRepositoryInput): Promise<MerchantShopMembershipDetailPayload> {
    const created = await this.client.$transaction(async (transaction) => {
      const membership = await transaction.shopCustomerMembership.create({
        data: {
          shopId: input.shopId,
          customerProfileId: input.customerProfileId,
          activeKey: `shop:${input.shopId}:customer:${input.customerProfileId}`,
          createdById: input.actorId,
          updatedById: input.actorId
        },
        select: {
          id: true,
          publicId: true,
          customerProfileId: true,
          status: true,
          source: true,
          startedAt: true,
          endedAt: true,
          createdAt: true,
          updatedAt: true,
          shop: { select: shopSelect },
          customerProfile: { select: customerSelect },
          cards: { where: { deletedAt: null }, select: cardSelect }
        }
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.audit,
          targetId: membership.id,
          metadata: {
            membershipPublicId: membership.publicId,
            customerNeedoId: input.customerNeedoId,
            shopNo: input.shopNo,
            source: "merchant_manual"
          }
        })
      });
      return membership;
    });
    return this.mapMerchantDetail(created);
  }

  public async listCards(shopId: number, input: MembershipCardListInput): Promise<PaginatedResponse<MerchantShopMembershipCardPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ShopMembershipCardWhereInput = {
      membership: { shopId, deletedAt: null },
      deletedAt: null,
      ...(input.status ? { status: this.cardStatusToDb(input.status) } : {}),
      ...(input.type ? { type: this.cardTypeToDb(input.type) } : {})
    };
    const [records, total] = await Promise.all([
      this.client.shopMembershipCard.findMany({
        where,
        select: {
          ...cardSelect,
          membership: {
            select: { publicId: true, customerProfile: { select: { displayName: true, user: { select: { needoId: true } } } } }
          }
        },
        orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.shopMembershipCard.count({ where })
    ]);
    return buildPaginatedResponse(records.map((record) => ({
      ...this.mapCard(record),
      membershipPublicId: record.membership.publicId,
      customerNeedoId: record.membership.customerProfile.user.needoId,
      customerDisplayName: record.membership.customerProfile.displayName
    })), total, pagination);
  }

  public async listActivities(shopId: number, input: PaginationInput): Promise<PaginatedResponse<ShopMembershipActivityPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ShopCustomerMembershipWhereInput = { shopId, deletedAt: null };
    const [records, total] = await Promise.all([
      this.client.shopCustomerMembership.findMany({
        where,
        select: {
          id: true,
          publicId: true,
          createdAt: true,
          customerProfile: { select: { displayName: true, user: { select: { needoId: true } } } },
          createdBy: { select: { username: true } }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.shopCustomerMembership.count({ where })
    ]);
    return buildPaginatedResponse(records.map((record) => ({
      id: `membership:${record.id}:created`,
      action: "membership_created",
      membershipPublicId: record.publicId,
      customerNeedoId: record.customerProfile.user.needoId,
      customerDisplayName: record.customerProfile.displayName,
      actorName: record.createdBy?.username ?? "NeeDo",
      occurredAt: record.createdAt
    })), total, pagination);
  }

  public async getAnalytics(shopId: number, range: MembershipAnalyticsRange): Promise<ShopMembershipAnalyticsPayload> {
    const membershipWhere: Prisma.ShopCustomerMembershipWhereInput = { shopId, deletedAt: null };
    const [activeMemberCount, startDates, groupedCards] = await Promise.all([
      this.client.shopCustomerMembership.count({ where: { ...membershipWhere, status: ShopCustomerMembershipStatus.ACTIVE } }),
      this.client.shopCustomerMembership.findMany({ where: { ...membershipWhere, startedAt: { gte: range.from, lte: range.to } }, select: { startedAt: true } }),
      this.client.shopMembershipCard.groupBy({
        by: ["status"],
        where: { membership: { shopId, deletedAt: null }, deletedAt: null },
        _count: { _all: true }
      })
    ]);
    const counts: Record<ShopMembershipCardStatusPayload, number> = { active: 0, frozen: 0, expired: 0, void: 0 };
    for (const item of groupedCards) counts[this.cardStatusFromDb(item.status)] = item._count._all;
    const daily = new Map(range.dateKeys.map((key) => [key, 0]));
    for (const record of startDates) {
      const key = this.japanDateKey(record.startedAt);
      if (daily.has(key)) daily.set(key, (daily.get(key) ?? 0) + 1);
    }
    return {
      period: range.period,
      from: range.from,
      to: range.to,
      activeMemberCount,
      newMemberCount: startDates.length,
      cardStatusCounts: counts,
      dailyNewMembers: [...daily].map(([date, count]) => ({ date, count }))
    };
  }

  public async listCustomerMemberships(customerProfileId: number, input: Omit<MembershipListInput, "keyword">): Promise<PaginatedResponse<CustomerShopMembershipListItemPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ShopCustomerMembershipWhereInput = {
      customerProfileId,
      deletedAt: null,
      ...(input.status ? { status: this.membershipStatusToDb(input.status) } : {})
    };
    const [records, total] = await Promise.all([
      this.client.shopCustomerMembership.findMany({
        where,
        select: {
          id: true,
          publicId: true,
          status: true,
          startedAt: true,
          endedAt: true,
          updatedAt: true,
          shop: { select: shopSelect },
          cards: { where: { deletedAt: null }, select: { status: true, expiresAt: true } }
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.shopCustomerMembership.count({ where })
    ]);
    return buildPaginatedResponse(records.map((record) => this.mapCustomerListItem(record)), total, pagination);
  }

  public async findCustomerMembershipDetail(customerProfileId: number, publicId: string): Promise<CustomerShopMembershipDetailPayload | null> {
    const record = await this.client.shopCustomerMembership.findFirst({
      where: { customerProfileId, publicId, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        status: true,
        startedAt: true,
        endedAt: true,
        updatedAt: true,
        shop: { select: shopSelect },
        cards: { where: { deletedAt: null }, select: cardSelect, orderBy: [{ issuedAt: "desc" }, { publicId: "desc" }] }
      }
    });
    return record ? { ...this.mapCustomerListItem(record), cards: record.cards.map((card) => this.mapCard(card)) } : null;
  }

  private candidateWhere(shopId: number, keyword?: string): Prisma.CustomerProfileWhereInput {
    const normalized = keyword?.trim();
    return {
      deletedAt: null,
      user: {
        deletedAt: null,
        bookingOrders: { some: { shopId, deletedAt: null } }
      },
      shopMemberships: { none: { shopId, status: ShopCustomerMembershipStatus.ACTIVE, deletedAt: null } },
      ...(normalized
        ? { OR: [{ displayName: { contains: normalized } }, { user: { needoId: { contains: normalized.toLowerCase() } } }] }
        : {})
    };
  }

  private mapMerchantListItem(record: MerchantMembershipListRecord): MerchantShopMembershipListItemPayload {
    return {
      internalId: record.id,
      publicId: record.publicId,
      customerProfileId: record.customerProfileId,
      customerNeedoId: record.customerProfile.user.needoId,
      displayName: record.customerProfile.displayName,
      avatarUrl: record.customerProfile.user.avatarUrl,
      city: record.customerProfile.city,
      status: this.membershipStatusFromDb(record.status),
      source: "merchant_manual",
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      cardCount: record._count.cards,
      activeCardCount: record.cards.length,
      lastActivityAt: record.updatedAt
    };
  }

  private mapMerchantDetail(record: MerchantMembershipDetailRecord): MerchantShopMembershipDetailPayload {
    const cards = record.cards.map((card) => this.mapCard(card));
    return {
      internalId: record.id,
      publicId: record.publicId,
      customerProfileId: record.customerProfileId,
      customerNeedoId: record.customerProfile.user.needoId,
      displayName: record.customerProfile.displayName,
      avatarUrl: record.customerProfile.user.avatarUrl,
      city: record.customerProfile.city,
      status: this.membershipStatusFromDb(record.status),
      source: "merchant_manual",
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      cardCount: cards.length,
      activeCardCount: cards.filter((card: ShopMembershipCardPayload) => card.status === "active").length,
      lastActivityAt: record.updatedAt,
      shop: record.shop,
      cards
    };
  }

  private mapCustomerListItem(record: CustomerMembershipListRecord): CustomerShopMembershipListItemPayload {
    const expiryCutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const activeCards = record.cards.filter((card: { status: ShopMembershipCardStatus }) => card.status === ShopMembershipCardStatus.ACTIVE);
    return {
      internalId: record.id,
      publicId: record.publicId,
      status: this.membershipStatusFromDb(record.status),
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      cardCount: record.cards.length,
      activeCardCount: activeCards.length,
      expiringSoonCardCount: activeCards.filter((card: { expiresAt: Date | null }) => card.expiresAt && card.expiresAt <= expiryCutoff).length,
      updatedAt: record.updatedAt,
      shop: record.shop
    };
  }

  private mapCard(record: MembershipCardRecord): ShopMembershipCardPayload {
    return {
      publicId: record.publicId,
      cardNoMasked: this.maskCardNumber(record.cardNo),
      name: record.name,
      type: this.cardTypeFromDb(record.type),
      status: this.cardStatusFromDb(record.status),
      principalBalanceJpy: record.principalBalanceJpy,
      bonusBalanceJpy: record.bonusBalanceJpy,
      remainingUses: record.remainingUses,
      totalUses: record.totalUses,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      frozenAt: record.frozenAt
    };
  }

  private membershipStatusToDb(value: ShopMembershipStatusPayload): ShopCustomerMembershipStatus {
    return value === "active" ? ShopCustomerMembershipStatus.ACTIVE : ShopCustomerMembershipStatus.ENDED;
  }

  private membershipStatusFromDb(value: ShopCustomerMembershipStatus): ShopMembershipStatusPayload {
    return value === ShopCustomerMembershipStatus.ACTIVE ? "active" : "ended";
  }

  private cardTypeToDb(value: ShopMembershipCardTypePayload): ShopMembershipCardType {
    return value === "stored_value" ? ShopMembershipCardType.STORED_VALUE : value === "count" ? ShopMembershipCardType.COUNT : ShopMembershipCardType.BENEFIT;
  }

  private cardTypeFromDb(value: ShopMembershipCardType): ShopMembershipCardTypePayload {
    return value === ShopMembershipCardType.STORED_VALUE ? "stored_value" : value === ShopMembershipCardType.COUNT ? "count" : "benefit";
  }

  private cardStatusToDb(value: ShopMembershipCardStatusPayload): ShopMembershipCardStatus {
    const values = { active: ShopMembershipCardStatus.ACTIVE, frozen: ShopMembershipCardStatus.FROZEN, expired: ShopMembershipCardStatus.EXPIRED, void: ShopMembershipCardStatus.VOID } as const;
    return values[value];
  }

  private cardStatusFromDb(value: ShopMembershipCardStatus): ShopMembershipCardStatusPayload {
    const values: Record<ShopMembershipCardStatus, ShopMembershipCardStatusPayload> = {
      [ShopMembershipCardStatus.ACTIVE]: "active",
      [ShopMembershipCardStatus.FROZEN]: "frozen",
      [ShopMembershipCardStatus.EXPIRED]: "expired",
      [ShopMembershipCardStatus.VOID]: "void"
    };
    return values[value];
  }

  private maskCardNumber(cardNo: string): string {
    const suffix = cardNo.slice(-4);
    return `•••• •••• •••• ${suffix}`;
  }

  private japanDateKey(value: Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  }
}
