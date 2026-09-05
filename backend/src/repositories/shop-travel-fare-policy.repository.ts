import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  PublishTravelFarePolicyInput,
  PublishTravelFarePolicyResult,
  ShopTravelFarePolicyRepositoryPort,
  TravelFarePolicyVersionPayload
} from "../services/shop-travel-fare-policy.service";
import { buildPaginatedResponse, toPrismaPagination, type PaginatedResponse, type PaginationInput } from "../utils/pagination";
import { toAuditLogCreateData } from "./audit-log.repository";

const includeBands = {
  bands: {
    where: { deletedAt: null },
    orderBy: [{ ordinal: "asc" as const }, { id: "asc" as const }]
  }
};
type PolicyRecord = Prisma.ShopTravelFarePolicyVersionGetPayload<{ include: typeof includeBands }>;

export class ShopTravelFarePolicyRepository implements ShopTravelFarePolicyRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findCurrentAndNext(shopId: number, at: Date) {
    const [current, next] = await Promise.all([
      this.client.shopTravelFarePolicyVersion.findFirst({
        where: { shopId, effectiveFrom: { lte: at }, deletedAt: null },
        include: includeBands,
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }]
      }),
      this.client.shopTravelFarePolicyVersion.findFirst({
        where: { shopId, effectiveFrom: { gt: at }, deletedAt: null },
        include: includeBands,
        orderBy: [{ effectiveFrom: "asc" }, { version: "asc" }]
      })
    ]);
    return { current: current ? this.mapPolicy(current) : null, next: next ? this.mapPolicy(next) : null };
  }

  public async listVersions(
    shopId: number,
    input: PaginationInput
  ): Promise<PaginatedResponse<TravelFarePolicyVersionPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ShopTravelFarePolicyVersionWhereInput = { shopId, deletedAt: null };
    const [records, total] = await Promise.all([
      this.client.shopTravelFarePolicyVersion.findMany({
        where,
        include: includeBands,
        orderBy: [{ version: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.shopTravelFarePolicyVersion.count({ where })
    ]);
    return buildPaginatedResponse(records.map((record) => this.mapPolicy(record)), total, pagination);
  }

  public async publishVersion(
    input: PublishTravelFarePolicyInput
  ): Promise<PublishTravelFarePolicyResult> {
    try {
      return await this.client.$transaction(async (tx) => {
        const shop = await tx.shop.findFirst({ where: { id: input.shopId, deletedAt: null }, select: { id: true } });
        if (!shop) return { kind: "shop_not_found" } as const;
        const latest = await tx.shopTravelFarePolicyVersion.findFirst({
          where: { shopId: input.shopId, deletedAt: null },
          select: { version: true, effectiveFrom: true },
          orderBy: { version: "desc" }
        });
        if ((latest?.version ?? 0) !== input.expectedVersion) {
          return { kind: "version_conflict" } as const;
        }
        if (latest && input.effectiveFrom.getTime() <= latest.effectiveFrom.getTime()) {
          return { kind: "effective_time_conflict" } as const;
        }
        const created = await tx.shopTravelFarePolicyVersion.create({
          data: {
            publicId: input.publicId,
            shopId: input.shopId,
            version: input.expectedVersion + 1,
            effectiveFrom: input.effectiveFrom,
            publishedByUserId: input.actorUserId,
            reason: input.reason,
            bands: { create: input.bands }
          },
          include: includeBands
        });
        await tx.auditLog.create({
          data: { ...toAuditLogCreateData(input.audit), targetId: created.id }
        });
        return { kind: "created", value: this.mapPolicy(created) } as const;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { kind: "version_conflict" };
      }
      throw error;
    }
  }

  private mapPolicy(record: PolicyRecord): TravelFarePolicyVersionPayload {
    return {
      publicId: record.publicId,
      version: record.version,
      effectiveFrom: record.effectiveFrom.toISOString(),
      publishedByUserId: record.publishedByUserId,
      reason: record.reason,
      bands: record.bands.map((band) => ({
        ordinal: band.ordinal,
        maximumDistanceMeters: band.maximumDistanceMeters,
        fareAmountJpy: band.fareAmountJpy
      })),
      createdAt: record.createdAt.toISOString()
    };
  }
}
