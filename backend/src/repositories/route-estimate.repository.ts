import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { shopAddressToJapaneseRouteAddress, type RouteEstimateCreateRecordInput, type RouteEstimateEligibleContext, type RouteEstimatePayload, type RouteEstimateRepositoryPort } from "../services/route-estimate.service";
import { toAuditLogCreateData } from "./audit-log.repository";

const estimateInclude = {
  policyVersion: { select: { publicId: true, version: true } },
  matchedBand: { select: { maximumDistanceMeters: true } }
};
type EstimateRecord = Prisma.RouteEstimateGetPayload<{ include: typeof estimateInclude }>;

export class RouteEstimateRepository implements RouteEstimateRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findEligibleContext(servicePublicId: string, scheduleSlotId: number, at: Date): Promise<RouteEstimateEligibleContext | null> {
    const slot = await this.client.scheduleSlot.findFirst({
      where: {
        id: scheduleSlotId,
        startsAt: { gt: at },
        status: "AVAILABLE",
        deletedAt: null,
        service: { publicId: servicePublicId, serviceMode: { in: ["home", "both", "onsite"] }, status: "published", deletedAt: null },
        shop: { deletedAt: null, status: "published" }
      },
      select: { bookedCount: true, capacity: true, service: { select: { id: true, publicId: true, shopId: true, shop: { select: { city: true, address: true } } } } }
    });
    const service = slot?.service;
    if (!slot || !service || slot.bookedCount >= slot.capacity) return null;
    const policy = await this.client.shopTravelFarePolicyVersion.findFirst({
      where: { shopId: service.shopId, effectiveFrom: { lte: at }, deletedAt: null },
      include: { bands: { where: { deletedAt: null }, orderBy: [{ ordinal: "asc" }, { id: "asc" }] } },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }]
    });
    if (!policy) return { ...this.baseContext(service, scheduleSlotId), policyVersionId: 0, policyVersionPublicId: "", policyVersion: 0, bands: [] };
    return {
      ...this.baseContext(service, scheduleSlotId), policyVersionId: policy.id, policyVersionPublicId: policy.publicId,
      policyVersion: policy.version,
      bands: policy.bands.map((band) => ({ id: band.id, ordinal: band.ordinal, maximumDistanceMeters: band.maximumDistanceMeters, fareAmountJpy: band.fareAmountJpy }))
    };
  }

  public async findReusableEstimate(input: Parameters<RouteEstimateRepositoryPort["findReusableEstimate"]>[0]): Promise<RouteEstimatePayload | null> {
    const record = await this.client.routeEstimate.findFirst({
      where: {
        customerUserId: input.customerUserId, shopId: input.shopId, serviceId: input.serviceId, scheduleSlotId: input.scheduleSlotId, providerCode: input.providerCode,
        policyVersionId: input.policyVersionId, originAddressHash: input.originAddressHash,
        destinationAddressHash: input.destinationAddressHash, createdAt: { gte: input.createdAfter },
        expiresAt: { gt: input.expiresAfter }, consumedAt: null, deletedAt: null
      },
      include: estimateInclude,
      orderBy: { createdAt: "desc" }
    });
    return record ? this.mapEstimate(record) : null;
  }

  public async createEstimate(input: RouteEstimateCreateRecordInput): Promise<RouteEstimatePayload> {
    return this.client.$transaction(async (tx) => {
      const created = await tx.routeEstimate.create({
        data: {
          publicId: input.publicId, customerUserId: input.customerUserId, shopId: input.shopId,
          serviceId: input.serviceId, scheduleSlotId: input.scheduleSlotId, policyVersionId: input.policyVersionId, matchedBandId: input.matchedBandId,
          providerCode: input.providerCode, providerRequestId: input.providerRequestId,
          originAddressHash: input.originAddressHash, destinationAddressHash: input.destinationAddressHash,
          distanceMeters: input.distanceMeters, durationSeconds: input.durationSeconds,
          fareAmountJpy: input.fareAmountJpy, expiresAt: input.expiresAt
        },
        include: estimateInclude
      });
      await tx.auditLog.create({ data: { ...toAuditLogCreateData(input.audit), targetId: created.id } });
      return this.mapEstimate(created);
    });
  }

  private baseContext(service: { id: number; publicId: string; shopId: number; shop: { city: string; address: string } }, scheduleSlotId: number) {
    return { serviceId: service.id, servicePublicId: service.publicId, shopId: service.shopId, scheduleSlotId, origin: shopAddressToJapaneseRouteAddress(service.shop) };
  }

  private mapEstimate(record: EstimateRecord): RouteEstimatePayload {
    return {
      publicId: record.publicId, distanceMeters: record.distanceMeters, durationSeconds: record.durationSeconds,
      fareAmountJpy: record.fareAmountJpy, policyVersionPublicId: record.policyVersion.publicId,
      policyVersion: record.policyVersion.version, bandMaximumDistanceMeters: record.matchedBand.maximumDistanceMeters,
      expiresAt: record.expiresAt.toISOString()
    };
  }
}
