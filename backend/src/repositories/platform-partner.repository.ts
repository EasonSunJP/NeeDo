import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AgentListInput,
  AgentShopReferralRecord,
  LinkAgentShopRepositoryResult,
  MarkPartnerProfileRepositoryResult,
  PlatformPartnerProfileRecord,
  PlatformPartnerRepositoryPort,
  PlatformPartnerTypeRecord
} from "../services/platform-partner.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";

const profileSelect = {
  id: true,
  publicId: true,
  partnerType: true,
  activatedAt: true,
  markedById: true,
  reason: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true,
      isActive: true
    }
  }
} as const satisfies Prisma.PlatformPartnerProfileSelect;

const referralSelect = {
  id: true,
  publicId: true,
  agentProfileId: true,
  status: true,
  source: true,
  confirmedAt: true,
  confirmedById: true,
  successQualifiedAt: true,
  reason: true,
  createdAt: true,
  agentProfile: { select: profileSelect },
  shop: {
    select: {
      id: true,
      name: true,
      city: true,
      publicIdentifier: { select: { publicId: true } }
    }
  }
} as const satisfies Prisma.AgentShopReferralSelect;

type SelectedProfile = Prisma.PlatformPartnerProfileGetPayload<{ select: typeof profileSelect }>;
type SelectedReferral = Prisma.AgentShopReferralGetPayload<{ select: typeof referralSelect }>;

export class PlatformPartnerRepository implements PlatformPartnerRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async markPartnerProfile(input: {
    userId: number;
    partnerType: PlatformPartnerTypeRecord;
    activatedAt: Date;
    markedById: number;
    reason: string;
  }): Promise<MarkPartnerProfileRepositoryResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const user = await transaction.user.findFirst({
          where: { id: input.userId, deletedAt: null },
          select: { id: true }
        });
        if (!user) return { kind: "user_not_found" as const };

        const duplicate = await transaction.platformPartnerProfile.findFirst({
          where: {
            userId: input.userId,
            partnerType: input.partnerType,
            deletedAt: null
          },
          select: { id: true }
        });
        if (duplicate) return { kind: "duplicate" as const };

        const profile = await transaction.platformPartnerProfile.create({
          data: input,
          select: profileSelect
        });
        return { kind: "created" as const, profile: this.mapProfile(profile) };
      });
    } catch (error) {
      if (isUniqueConflict(error)) return { kind: "duplicate" };
      throw error;
    }
  }

  public async listAgents(
    input: AgentListInput
  ): Promise<ReturnType<typeof buildPaginatedResponse<PlatformPartnerProfileRecord>>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.PlatformPartnerProfileWhereInput = {
      partnerType: "AGENT",
      deletedAt: null,
      user: {
        deletedAt: null,
        ...(input.status ? { isActive: input.status === "active" } : {}),
        ...(input.keyword
          ? {
              OR: [
                { needoId: { contains: input.keyword } },
                { username: { contains: input.keyword } }
              ]
            }
          : {})
      }
    };
    const [list, total] = await Promise.all([
      this.client.platformPartnerProfile.findMany({
        where,
        select: profileSelect,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ activatedAt: "desc" }, { id: "desc" }]
      }),
      this.client.platformPartnerProfile.count({ where })
    ]);

    return buildPaginatedResponse(list.map((record) => this.mapProfile(record)), total, pagination);
  }

  public async linkAgentShop(input: {
    agentPublicId: string;
    shopPublicId: string;
    source: string;
    confirmedAt: Date;
    confirmedById: number;
    reason: string;
  }): Promise<LinkAgentShopRepositoryResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const agent = await transaction.platformPartnerProfile.findFirst({
          where: {
            publicId: input.agentPublicId,
            partnerType: "AGENT",
            deletedAt: null,
            user: { deletedAt: null, isActive: true }
          },
          select: { id: true }
        });
        if (!agent) return { kind: "agent_not_found" as const };

        const shop = await transaction.shop.findFirst({
          where: {
            deletedAt: null,
            publicIdentifier: {
              is: {
                publicId: input.shopPublicId,
                kind: "SHOP",
                status: "ACTIVE",
                deletedAt: null
              }
            }
          },
          select: { id: true }
        });
        if (!shop) return { kind: "shop_not_found" as const };

        const conflict = await transaction.agentShopReferral.findFirst({
          where: {
            shopId: shop.id,
            status: { in: ["ACTIVE", "QUALIFIED"] },
            deletedAt: null
          },
          select: { id: true }
        });
        if (conflict) return { kind: "shop_conflict" as const };

        const referral = await transaction.agentShopReferral.create({
          data: {
            agentProfileId: agent.id,
            shopId: shop.id,
            source: input.source,
            confirmedAt: input.confirmedAt,
            confirmedById: input.confirmedById,
            reason: input.reason
          },
          select: referralSelect
        });
        return { kind: "created" as const, referral: this.mapReferral(referral) };
      });
    } catch (error) {
      if (isUniqueConflict(error)) return { kind: "shop_conflict" };
      throw error;
    }
  }

  private mapProfile(record: SelectedProfile): PlatformPartnerProfileRecord {
    return {
      ...record,
      partnerType: record.partnerType as PlatformPartnerTypeRecord
    };
  }

  private mapReferral(record: SelectedReferral): AgentShopReferralRecord {
    const publicId = record.shop.publicIdentifier?.publicId;
    if (!publicId) {
      throw new Error("Agent referral shop is missing its active public identifier");
    }
    return {
      ...record,
      status: record.status,
      agentProfile: this.mapProfile(record.agentProfile),
      shop: {
        id: record.shop.id,
        publicId,
        name: record.shop.name,
        city: record.shop.city
      }
    };
  }
}

const isUniqueConflict = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
