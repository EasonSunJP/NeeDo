import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { OperationsTravelFarePolicy, OperationsTravelPolicyVersion, TravelOperationsRepositoryPort } from "../services/travel-operations.service";
import type { TravelFarePolicyListQuery } from "../validators/travel-operations.validator";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";

export class TravelOperationsRepository implements TravelOperationsRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listFarePolicies(input: TravelFarePolicyListQuery, at: Date) {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ShopWhereInput = {
      deletedAt: null,
      ...(input.city ? { city: input.city } : {}),
      ...(input.shopKeyword ? { OR: [{ name: { contains: input.shopKeyword } }, { publicIdentifier: { is: { publicId: { contains: input.shopKeyword }, status: "ACTIVE", deletedAt: null } } }] } : {})
    };
    const [shops, total] = await Promise.all([
      this.client.shop.findMany({
        where,
        select: { id: true, name: true, city: true, publicIdentifier: { select: { publicId: true, status: true, deletedAt: true } } },
        orderBy: { id: "asc" }, skip: pagination.skip, take: pagination.take
      }),
      this.client.shop.count({ where })
    ]);
    const shopIds = shops.map((shop) => shop.id);
    if (shopIds.length === 0) return buildPaginatedResponse([], total, pagination);
    const selectedVersions = await this.client.$queryRaw<SelectedPolicyRecord[]>(Prisma.sql`
      SELECT ranked.id, ranked.publicId, ranked.shopId, ranked.version,
        ranked.effectiveFrom, ranked.publishedByUserId, ranked.reason,
        ranked.createdAt, ranked.position
      FROM (
        SELECT policy.id, policy.public_id AS publicId, policy.shop_id AS shopId,
          policy.version, policy.effective_from AS effectiveFrom,
          policy.published_by_user_id AS publishedByUserId, policy.reason,
          policy.created_at AS createdAt, ${"current"} AS position,
          ROW_NUMBER() OVER (
            PARTITION BY policy.shop_id
            ORDER BY policy.effective_from DESC, policy.version DESC
          ) AS position_rank
        FROM shop_travel_fare_policy_versions AS policy
        WHERE policy.shop_id IN (${Prisma.join(shopIds)})
          AND policy.effective_from <= ${at}
          AND policy.deleted_at IS NULL
        UNION ALL
        SELECT policy.id, policy.public_id AS publicId, policy.shop_id AS shopId,
          policy.version, policy.effective_from AS effectiveFrom,
          policy.published_by_user_id AS publishedByUserId, policy.reason,
          policy.created_at AS createdAt, ${"next"} AS position,
          ROW_NUMBER() OVER (
            PARTITION BY policy.shop_id
            ORDER BY policy.effective_from ASC, policy.version ASC
          ) AS position_rank
        FROM shop_travel_fare_policy_versions AS policy
        WHERE policy.shop_id IN (${Prisma.join(shopIds)})
          AND policy.effective_from > ${at}
          AND policy.deleted_at IS NULL
      ) AS ranked
      WHERE ranked.position_rank = 1
    `);
    const currentByShop = new Map<number, SelectedPolicyRecord>();
    const nextByShop = new Map<number, SelectedPolicyRecord>();
    for (const item of selectedVersions) {
      (item.position === "current" ? currentByShop : nextByShop).set(item.shopId, item);
    }
    const selected = [...currentByShop.values(), ...nextByShop.values()];
    const bands = selected.length === 0 ? [] : await this.client.shopTravelFareBand.findMany({ where: { policyVersionId: { in: selected.map((item) => item.id) }, deletedAt: null }, orderBy: [{ policyVersionId: "asc" }, { ordinal: "asc" }] });
    const bandsByPolicy = new Map<number, typeof bands>();
    for (const band of bands) bandsByPolicy.set(band.policyVersionId, [...(bandsByPolicy.get(band.policyVersionId) ?? []), band]);
    const list: OperationsTravelFarePolicy[] = shops.map((shop) => ({
      shopId: shop.id,
      shopPublicId: shop.publicIdentifier?.status === "ACTIVE" && !shop.publicIdentifier.deletedAt ? shop.publicIdentifier.publicId : null,
      shopName: shop.name,
      city: shop.city,
      current: this.mapVersion(currentByShop.get(shop.id), bandsByPolicy),
      next: this.mapVersion(nextByShop.get(shop.id), bandsByPolicy)
    }));
    return buildPaginatedResponse(list, total, pagination);
  }

  private mapVersion(record: { id: number; publicId: string; version: number; effectiveFrom: Date; publishedByUserId: number; reason: string; createdAt: Date } | undefined, bandsByPolicy: Map<number, Array<{ ordinal: number; maximumDistanceMeters: number; fareAmountJpy: number }>>): OperationsTravelPolicyVersion | null {
    if (!record) return null;
    return { publicId: record.publicId, version: record.version, effectiveFrom: record.effectiveFrom.toISOString(), publishedByUserId: record.publishedByUserId, reason: record.reason, bands: (bandsByPolicy.get(record.id) ?? []).map((band) => ({ ordinal: band.ordinal, maximumDistanceMeters: band.maximumDistanceMeters, fareAmountJpy: band.fareAmountJpy })), createdAt: record.createdAt.toISOString() };
  }
}

type SelectedPolicyRecord = {
  id: number;
  publicId: string;
  shopId: number;
  version: number;
  effectiveFrom: Date;
  publishedByUserId: number;
  reason: string;
  createdAt: Date;
  position: "current" | "next";
};
