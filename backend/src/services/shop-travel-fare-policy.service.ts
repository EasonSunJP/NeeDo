import { randomUUID } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import {
  TravelFareRuleError,
  validateTravelFareBands,
  type ValidatedTravelFareBand
} from "../domain/shop-travel-fare";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { AuditLogRecordInput, AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

export interface TravelFarePolicyVersionPayload {
  publicId: string;
  version: number;
  effectiveFrom: string;
  publishedByUserId: number;
  reason: string;
  bands: ValidatedTravelFareBand[];
  createdAt: string;
}

export interface TravelFarePolicySummaryPayload {
  current: TravelFarePolicyVersionPayload | null;
  next: TravelFarePolicyVersionPayload | null;
}

export interface PublishTravelFarePolicyInput {
  shopId: number;
  publicId: string;
  expectedVersion: number;
  effectiveFrom: Date;
  reason: string;
  bands: ValidatedTravelFareBand[];
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export type PublishTravelFarePolicyResult =
  | { kind: "created"; value: TravelFarePolicyVersionPayload }
  | { kind: "version_conflict" }
  | { kind: "effective_time_conflict" }
  | { kind: "shop_not_found" };

export interface ShopTravelFarePolicyRepositoryPort {
  findCurrentAndNext: (shopId: number, at: Date) => Promise<TravelFarePolicySummaryPayload>;
  findLatest: (shopId: number) => Promise<TravelFarePolicyVersionPayload | null>;
  listVersions: (
    shopId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<TravelFarePolicyVersionPayload>>;
  publishVersion: (
    input: PublishTravelFarePolicyInput
  ) => Promise<PublishTravelFarePolicyResult>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export class ShopTravelFarePolicyService {
  public constructor(
    private readonly repository: ShopTravelFarePolicyRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public getPolicy(
    actor: AuthenticatedAccessContext,
    at = new Date()
  ): Promise<TravelFarePolicySummaryPayload> {
    return this.repository.findCurrentAndNext(requireMerchantShopId(actor), at);
  }

  public listVersions(
    actor: AuthenticatedAccessContext,
    input: PaginationInput
  ): Promise<PaginatedResponse<TravelFarePolicyVersionPayload>> {
    return this.repository.listVersions(requireMerchantShopId(actor), input);
  }

  public async publishVersion(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: {
      expectedVersion: number;
      effectiveFrom: string;
      reason: string;
      bands: Array<{ maximumDistanceMeters: number; fareAmountJpy: number }>;
    }
  ): Promise<TravelFarePolicyVersionPayload> {
    if (
      actor.currentIdentityType !== "merchant_owner" ||
      !actor.roles.includes("merchant_owner")
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
    const shopId = requireMerchantShopId(actor);
    let bands: ValidatedTravelFareBand[];
    try {
      bands = validateTravelFareBands(input.bands);
    } catch (error) {
      if (error instanceof TravelFareRuleError) {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.travel_fare_policy.invalid_bands",
          statusCode: 400,
          cause: error
        });
      }
      throw error;
    }

    const latest = await this.repository.findLatest(shopId);
    const publicId = randomUUID();
    const effectiveFrom = new Date(input.effectiveFrom);
    const audit = this.auditInputFactory.createInput(
      this.auditRecord(actor, context, {
        action: "merchant_admin.travel_fare_policy.publish",
        targetType: "shop_travel_fare_policy_version",
        metadata: {
          previousVersionPublicId: latest?.publicId ?? null,
          newVersionPublicId: publicId,
          effectiveFrom: effectiveFrom.toISOString(),
          reason: input.reason,
          bands
        }
      })
    );
    const result = await this.repository.publishVersion({
      shopId,
      publicId,
      expectedVersion: input.expectedVersion,
      effectiveFrom,
      reason: input.reason,
      bands,
      actorUserId: actor.userId,
      audit
    });
    if (result.kind === "created") return result.value;
    if (result.kind === "version_conflict") {
      throw new AppError({
        code: ERROR_CODES.TRAVEL_FARE_POLICY_VERSION_CONFLICT,
        message: "error.travel_fare_policy.version_conflict",
        statusCode: 409
      });
    }
    if (result.kind === "effective_time_conflict") {
      throw new AppError({
        code: ERROR_CODES.TRAVEL_FARE_POLICY_EFFECTIVE_TIME_CONFLICT,
        message: "error.travel_fare_policy.effective_time_conflict",
        statusCode: 409
      });
    }
    throw new AppError({ code: ERROR_CODES.NOT_FOUND, message: "error.shop.not_found", statusCode: 404 });
  }

  private auditRecord(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: Omit<AuditLogRecordInput, "actor" | "context">
  ): AuditLogRecordInput {
    return { ...input, actor, context };
  }
}
