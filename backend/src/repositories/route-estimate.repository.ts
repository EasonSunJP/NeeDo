import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { JapaneseRouteAddress } from "../services/route-distance.provider";
import type { RouteEstimateCreateRecordInput, RouteEstimateEligibleContext, RouteEstimatePayload, RouteEstimateRepositoryPort } from "../services/route-estimate.service";
import { toAuditLogCreateData } from "./audit-log.repository";

const estimateInclude = {
  policyVersion: { select: { publicId: true, version: true } },
  matchedBand: { select: { maximumDistanceMeters: true } }
};
type EstimateRecord = Prisma.RouteEstimateGetPayload<{ include: typeof estimateInclude }>;

export class RouteEstimateRepository implements RouteEstimateRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findEligibleContext(servicePublicId: string, at: Date): Promise<RouteEstimateEligibleContext | null> {
    const service = await this.client.service.findFirst({
      where: { publicId: servicePublicId, serviceMode: "home", status: "published", deletedAt: null, shop: { deletedAt: null, status: "published" } },
      select: { id: true, publicId: true, shopId: true, shop: { select: { city: true, address: true } } }
    });
    if (!service) return null;
    const policy = await this.client.shopTravelFarePolicyVersion.findFirst({
      where: { shopId: service.shopId, effectiveFrom: { lte: at }, deletedAt: null },
      include: { bands: { where: { deletedAt: null }, orderBy: [{ ordinal: "asc" }, { id: "asc" }] } },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }]
    });
    if (!policy) return { ...this.baseContext(service), policyVersionId: 0, policyVersionPublicId: "", policyVersion: 0, bands: [] };
    return {
      ...this.baseContext(service), policyVersionId: policy.id, policyVersionPublicId: policy.publicId,
      policyVersion: policy.version,
      bands: policy.bands.map((band) => ({ id: band.id, ordinal: band.ordinal, maximumDistanceMeters: band.maximumDistanceMeters, fareAmountJpy: band.fareAmountJpy }))
    };
  }

  public async findReusableEstimate(input: Parameters<RouteEstimateRepositoryPort["findReusableEstimate"]>[0]): Promise<RouteEstimatePayload | null> {
    const record = await this.client.routeEstimate.findFirst({
      where: {
        customerUserId: input.customerUserId, shopId: input.shopId, serviceId: input.serviceId,
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
          serviceId: input.serviceId, policyVersionId: input.policyVersionId, matchedBandId: input.matchedBandId,
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

  private baseContext(service: { id: number; publicId: string; shopId: number; shop: { city: string; address: string } }) {
    return { serviceId: service.id, servicePublicId: service.publicId, shopId: service.shopId, origin: this.shopAddress(service.shop) };
  }

  private shopAddress(shop: { city: string; address: string }): JapaneseRouteAddress {
    const postalCode = /(?:〒\s*)?(\d{3})-?(\d{4})/u.exec(shop.address);
    const prefecture = /(東京都|北海道|大阪府|京都府|.{2,3}県)/u.exec(shop.address)?.[1] ?? shop.city;
    return { countryCode: "JP", postalCode: postalCode ? `${postalCode[1]}${postalCode[2]}` : "", prefecture, city: shop.city, addressLine1: shop.address.replace(/(?:〒\s*)?\d{3}-?\d{4}/u, "").trim() };
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
