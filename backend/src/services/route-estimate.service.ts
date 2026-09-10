import { createHash, randomUUID } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import { TravelFareRuleError, selectTravelFareBand, type ValidatedTravelFareBand } from "../domain/shop-travel-fare";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogRecordInput, AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { RouteDistanceProviderError, type JapaneseRouteAddress, type RouteDistanceProvider, type RouteDistanceProviderErrorKey } from "./route-distance.provider";

export interface RouteEstimatePolicyBand extends ValidatedTravelFareBand { id: number }
export interface RouteEstimateEligibleContext {
  serviceId: number;
  scheduleSlotId: number;
  servicePublicId: string;
  shopId: number;
  origin: JapaneseRouteAddress;
  policyVersionId: number;
  policyVersionPublicId: string;
  policyVersion: number;
  bands: RouteEstimatePolicyBand[];
}
export interface RouteEstimatePayload {
  publicId: string;
  distanceMeters: number;
  durationSeconds: number;
  fareAmountJpy: number;
  policyVersionPublicId: string;
  policyVersion: number;
  bandMaximumDistanceMeters: number;
  expiresAt: string;
}
export interface RouteEstimateCreateRecordInput {
  publicId: string;
  customerUserId: number;
  shopId: number;
  serviceId: number;
  scheduleSlotId: number;
  policyVersionId: number;
  matchedBandId: number;
  providerCode: string;
  providerRequestId: string | null;
  originAddressHash: string;
  destinationAddressHash: string;
  distanceMeters: number;
  durationSeconds: number;
  fareAmountJpy: number;
  expiresAt: Date;
  audit: AuditLogCreateInput;
}
export interface RouteEstimateRepositoryPort {
  findEligibleContext: (servicePublicId: string, scheduleSlotId: number, at: Date) => Promise<RouteEstimateEligibleContext | null>;
  findReusableEstimate: (input: {
    customerUserId: number; shopId: number; serviceId: number; scheduleSlotId: number; policyVersionId: number;
    providerCode: string; originAddressHash: string; destinationAddressHash: string; createdAfter: Date; expiresAfter: Date;
  }) => Promise<RouteEstimatePayload | null>;
  createEstimate: (input: RouteEstimateCreateRecordInput) => Promise<RouteEstimatePayload>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;
type RouteEstimateOptions = { estimateTtlSeconds: number; cacheTtlSeconds: number; negativeCacheTtlSeconds?: number };
const CUSTOMER_IDENTITIES = new Set(["customer", "user", "u"]);

export class RouteEstimateService {
  private readonly inFlight = new Map<string, Promise<RouteEstimatePayload & { cached: boolean }>>();
  private readonly negativeCache = new Map<string, { errorKey: RouteDistanceProviderErrorKey; expiresAt: number }>();
  private readonly cacheEpoch: Date;

  public constructor(
    private readonly repository: RouteEstimateRepositoryPort,
    private readonly provider: RouteDistanceProvider,
    private readonly auditInputFactory: AuditInputFactory,
    private readonly options: RouteEstimateOptions,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.cacheEpoch = this.clock();
  }

  public async create(
    actor: AuthenticatedAccessContext,
    requestContext: AuthRequestContext,
    input: { servicePublicId: string; scheduleSlotId: number; destination: JapaneseRouteAddress }
  ): Promise<RouteEstimatePayload & { cached: boolean }> {
    this.assertCustomerIdentity(actor);
    const now = this.clock();
    const context = await this.repository.findEligibleContext(input.servicePublicId, input.scheduleSlotId, now);
    if (!context) {
      throw new AppError({ code: ERROR_CODES.TRAVEL_HOME_SERVICE_NOT_ELIGIBLE, message: "error.travel.home_service_not_eligible", statusCode: 422 });
    }
    if (context.bands.length === 0) {
      throw new AppError({ code: ERROR_CODES.TRAVEL_FARE_POLICY_UNAVAILABLE, message: "error.travel.policy_unavailable", statusCode: 503 });
    }
    const destination = normalizeJapaneseRouteAddress(input.destination);
    const origin = normalizeJapaneseRouteAddress(context.origin);
    const originAddressHash = hashRouteAddress(origin);
    const destinationAddressHash = hashRouteAddress(destination);
    const cached = await this.repository.findReusableEstimate({
      customerUserId: actor.userId,
      shopId: context.shopId,
      serviceId: context.serviceId,
      scheduleSlotId: context.scheduleSlotId,
      policyVersionId: context.policyVersionId,
      providerCode: this.provider.key,
      originAddressHash,
      destinationAddressHash,
      createdAfter: new Date(
        Math.max(
          this.cacheEpoch.getTime(),
          now.getTime() - this.options.cacheTtlSeconds * 1_000
        )
      ),
      expiresAfter: now
    });
    if (cached) return { ...cached, cached: true };

    const requestKey = [actor.userId, context.shopId, context.serviceId, context.scheduleSlotId, context.policyVersionId, this.provider.key, "drive", originAddressHash, destinationAddressHash].join(":");
    const negative = this.negativeCache.get(requestKey);
    if (negative && negative.expiresAt > now.getTime()) throw new RouteDistanceProviderError(negative.errorKey);
    if (negative) this.negativeCache.delete(requestKey);
    const active = this.inFlight.get(requestKey);
    if (active) return active;

    const pending = this.createFreshEstimate(actor, requestContext, context, origin, destination, originAddressHash, destinationAddressHash, now, requestKey);
    this.inFlight.set(requestKey, pending);
    try { return await pending; }
    finally { this.inFlight.delete(requestKey); }
  }

  private async createFreshEstimate(
    actor: AuthenticatedAccessContext,
    requestContext: AuthRequestContext,
    context: RouteEstimateEligibleContext,
    origin: JapaneseRouteAddress,
    destination: JapaneseRouteAddress,
    originAddressHash: string,
    destinationAddressHash: string,
    now: Date,
    requestKey: string
  ): Promise<RouteEstimatePayload & { cached: boolean }> {
    let route: Awaited<ReturnType<RouteDistanceProvider["getDrivingRoute"]>>;
    try {
      route = await this.provider.getDrivingRoute({ origin, destination });
    } catch (error) {
      if (error instanceof RouteDistanceProviderError) {
        this.negativeCache.set(requestKey, { errorKey: error.errorKey, expiresAt: now.getTime() + (this.options.negativeCacheTtlSeconds ?? 30) * 1_000 });
      }
      throw error;
    }
    let selected: ValidatedTravelFareBand;
    try {
      selected = selectTravelFareBand(route.distanceMeters, context.bands);
    } catch (error) {
      if (error instanceof TravelFareRuleError && error.errorKey === "error.travel.outside_service_area") {
        throw new AppError({ code: ERROR_CODES.TRAVEL_OUTSIDE_SERVICE_AREA, message: error.errorKey, statusCode: 422 });
      }
      throw error;
    }
    const matchedBand = context.bands.find((band) => band.ordinal === selected.ordinal);
    if (!matchedBand) {
      throw new AppError({ code: ERROR_CODES.TRAVEL_FARE_POLICY_UNAVAILABLE, message: "error.travel.policy_unavailable", statusCode: 503 });
    }
    const publicId = randomUUID();
    const expiresAt = new Date(now.getTime() + this.options.estimateTtlSeconds * 1_000);
    const audit = this.auditInputFactory.createInput(this.auditRecord(actor, requestContext, {
      action: "booking.travel_estimate.create",
      targetType: "route_estimate",
      metadata: {
        estimatePublicId: publicId,
        shopId: context.shopId,
        servicePublicId: context.servicePublicId,
        policyVersionPublicId: context.policyVersionPublicId,
        providerCode: route.providerCode,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        fareAmountJpy: matchedBand.fareAmountJpy
      }
    }));
    const created = await this.repository.createEstimate({
      publicId, customerUserId: actor.userId, shopId: context.shopId, serviceId: context.serviceId,
      scheduleSlotId: context.scheduleSlotId,
      policyVersionId: context.policyVersionId, matchedBandId: matchedBand.id,
      providerCode: route.providerCode, providerRequestId: route.providerRequestId,
      originAddressHash, destinationAddressHash, distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds, fareAmountJpy: matchedBand.fareAmountJpy, expiresAt, audit
    });
    return { ...created, cached: false };
  }

  private assertCustomerIdentity(actor: AuthenticatedAccessContext): void {
    if (!actor.currentIdentityType || !CUSTOMER_IDENTITIES.has(actor.currentIdentityType)) {
      throw new AppError({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.identity.forbidden", statusCode: 403 });
    }
  }

  private auditRecord(actor: AuthenticatedAccessContext, context: AuthRequestContext, input: Omit<AuditLogRecordInput, "actor" | "context">): AuditLogRecordInput {
    return { ...input, actor, context };
  }
}

const normalizePart = (value: string | undefined): string | undefined => {
  const normalized = value?.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized || undefined;
};
export const normalizeJapaneseRouteAddress = (address: JapaneseRouteAddress): JapaneseRouteAddress => ({
  countryCode: "JP",
  postalCode: (normalizePart(address.postalCode) ?? "").replace(/[^0-9]/gu, ""),
  prefecture: normalizePart(address.prefecture) ?? "",
  city: normalizePart(address.city) ?? "",
  addressLine1: normalizePart(address.addressLine1) ?? "",
  ...(normalizePart(address.addressLine2) ? { addressLine2: normalizePart(address.addressLine2) } : {}),
  ...(normalizePart(address.building) ? { building: normalizePart(address.building) } : {})
});
export const hashRouteAddress = (address: JapaneseRouteAddress): string =>
  createHash("sha256").update(JSON.stringify(normalizeJapaneseRouteAddress(address))).digest("hex");

export const shopAddressToJapaneseRouteAddress = (shop: { city: string; address: string }): JapaneseRouteAddress => {
  const postalCode = /(?:〒\s*)?(\d{3})-?(\d{4})/u.exec(shop.address);
  const prefecture = /(東京都|北海道|大阪府|京都府|.{2,3}県)/u.exec(shop.address)?.[1] ?? shop.city;
  return normalizeJapaneseRouteAddress({
    countryCode: "JP",
    postalCode: postalCode ? `${postalCode[1]}${postalCode[2]}` : "",
    prefecture,
    city: shop.city,
    addressLine1: shop.address.replace(/(?:〒\s*)?\d{3}-?\d{4}/u, "").trim()
  });
};
