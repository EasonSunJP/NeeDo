import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { TechnicianServiceBody } from "../validators/pricing-mode.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type PricingModePayload = "merchant" | "technician";
export type BookingNavigationEntry = "service_menu" | "technician_list";

export interface ShopPricingModePayload {
  shopId: number;
  pricingMode: PricingModePayload;
  technicianPricingRatePercent: number;
  updatedAt: Date | string | null;
  updatedBy: number | null;
}

export interface TechnicianShopScopePayload {
  technicianId: number;
  shopId: number | null;
}

export interface TechnicianServicePayload {
  id: number;
  shopId: number;
  technicianId: number;
  sourceShopServiceId: number | null;
  name: string;
  description: string | null;
  categoryId: number;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  coverImageUrl: string | null;
  images: string[];
  tags: string[];
  isActive: boolean;
  isBookable: boolean;
  isRecommended: boolean;
  sortOrder: number;
  reviewStatus: string;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingNavigationServicePayload {
  id: number;
  name: string;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
  coverUrl: string | null;
}

export interface BookingNavigationTechnicianPayload {
  id: number;
  displayName: string;
  city: string;
  avatarUrl: string | null;
  reviewSummary: unknown;
}

export interface BookingNavigationPayload {
  shopId: number;
  pricingMode: PricingModePayload;
  technicianPricingRatePercent: number;
  entry: BookingNavigationEntry;
  services?: PaginatedResponse<BookingNavigationServicePayload | TechnicianServicePayload>;
  technicians?: PaginatedResponse<BookingNavigationTechnicianPayload>;
}

export interface TechnicianServiceCreateRepositoryInput extends TechnicianServiceBody {
  shopId: number;
  technicianId: number;
  createdBy: number;
}

export interface TechnicianServiceUpdateRepositoryInput extends Partial<TechnicianServiceBody> {
  shopId: number;
  technicianId: number;
  serviceId: number;
  updatedBy: number;
}

export interface PricingModeRepositoryPort {
  findShopPricingMode: (shopId: number) => Promise<ShopPricingModePayload | null>;
  updateShopPricingMode: (
    shopId: number,
    pricingMode: PricingModePayload,
    technicianPricingRatePercent: number,
    actorUserId: number
  ) => Promise<ShopPricingModePayload>;
  findTechnicianShopScope: (technicianId: number) => Promise<TechnicianShopScopePayload | null>;
  listTechnicianServices: (
    input: PaginationInput & { shopId: number; technicianId: number; activeOnly?: boolean }
  ) => Promise<PaginatedResponse<TechnicianServicePayload>>;
  createTechnicianService: (
    input: TechnicianServiceCreateRepositoryInput
  ) => Promise<TechnicianServicePayload>;
  updateTechnicianService: (
    input: TechnicianServiceUpdateRepositoryInput
  ) => Promise<TechnicianServicePayload | null>;
  deleteTechnicianService: (input: {
    shopId: number;
    technicianId: number;
    serviceId: number;
    updatedBy: number;
  }) => Promise<boolean>;
  listBookingNavigationShopServices: (
    input: PaginationInput & { shopId: number }
  ) => Promise<PaginatedResponse<BookingNavigationServicePayload>>;
  listBookingNavigationTechnicians: (
    input: PaginationInput & { shopId: number }
  ) => Promise<PaginatedResponse<BookingNavigationTechnicianPayload>>;
  listPublicTechnicianServices: (
    input: PaginationInput & { shopId: number; technicianId: number }
  ) => Promise<PaginatedResponse<TechnicianServicePayload>>;
}

type AuditRecorder = Pick<AuditLogService, "record">;

export class PricingModeService {
  public constructor(
    private readonly repository: PricingModeRepositoryPort,
    private readonly auditLogService: AuditRecorder
  ) {}

  public async getShopPricingMode(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number
  ): Promise<ShopPricingModePayload> {
    this.assertMerchantShopScope(actor, shopId);
    await this.record(actor, context, "merchant_admin.shop.pricing_mode.read", shopId);

    return this.getExistingShopPricingMode(shopId);
  }

  public async updateShopPricingMode(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    pricingMode: PricingModePayload,
    technicianPricingRatePercent?: number
  ): Promise<ShopPricingModePayload> {
    this.assertMerchantShopScope(actor, shopId);
    const current = await this.getExistingShopPricingMode(shopId);
    const nextTechnicianPricingRatePercent = this.normalizeTechnicianPricingRatePercent(
      technicianPricingRatePercent ?? current.technicianPricingRatePercent
    );
    const next = await this.repository.updateShopPricingMode(
      shopId,
      pricingMode,
      nextTechnicianPricingRatePercent,
      actor.userId
    );
    await this.record(actor, context, "merchant_admin.shop.pricing_mode.update", shopId, {
      previousPricingMode: current.pricingMode,
      nextPricingMode: pricingMode,
      previousTechnicianPricingRatePercent: current.technicianPricingRatePercent,
      nextTechnicianPricingRatePercent
    });

    return next;
  }

  public async listTechnicianServices(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    input: PaginationInput & { activeOnly?: boolean }
  ): Promise<PaginatedResponse<TechnicianServicePayload>> {
    const scope = await this.getTechnicianScope(actor, shopId);
    await this.record(actor, context, "technician.services.list", shopId, {
      technicianId: scope.technicianId
    });

    return this.repository.listTechnicianServices({
      ...input,
      shopId,
      technicianId: scope.technicianId
    });
  }

  public async createTechnicianService(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    input: TechnicianServiceBody
  ): Promise<TechnicianServicePayload> {
    const scope = await this.getTechnicianScope(actor, shopId);
    const service = await this.repository.createTechnicianService({
      ...input,
      shopId,
      technicianId: scope.technicianId,
      createdBy: actor.userId
    });
    await this.record(actor, context, "technician.services.create", shopId, {
      technicianId: scope.technicianId,
      serviceId: service.id
    });

    return service;
  }

  public async updateTechnicianService(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    serviceId: number,
    input: Partial<TechnicianServiceBody>
  ): Promise<TechnicianServicePayload> {
    const scope = await this.getTechnicianScope(actor, shopId);
    const service = await this.repository.updateTechnicianService({
      ...input,
      shopId,
      technicianId: scope.technicianId,
      serviceId,
      updatedBy: actor.userId
    });

    if (!service) {
      throw this.notFound("error.technician_service.not_found");
    }

    await this.record(actor, context, "technician.services.update", shopId, {
      technicianId: scope.technicianId,
      serviceId
    });

    return service;
  }

  public async deleteTechnicianService(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    serviceId: number
  ): Promise<{ deleted: true }> {
    const scope = await this.getTechnicianScope(actor, shopId);
    const deleted = await this.repository.deleteTechnicianService({
      shopId,
      technicianId: scope.technicianId,
      serviceId,
      updatedBy: actor.userId
    });

    if (!deleted) {
      throw this.notFound("error.technician_service.not_found");
    }

    await this.record(actor, context, "technician.services.delete", shopId, {
      technicianId: scope.technicianId,
      serviceId
    });

    return { deleted: true };
  }

  public async getBookingNavigation(
    shopId: number,
    input: PaginationInput
  ): Promise<BookingNavigationPayload> {
    const pricingMode = await this.getExistingShopPricingMode(shopId);

    if (pricingMode.pricingMode === "technician") {
      return {
        shopId,
        pricingMode: "technician",
        technicianPricingRatePercent: pricingMode.technicianPricingRatePercent,
        entry: "technician_list",
        technicians: await this.repository.listBookingNavigationTechnicians({ ...input, shopId })
      };
    }

    return {
      shopId,
      pricingMode: "merchant",
      technicianPricingRatePercent: pricingMode.technicianPricingRatePercent,
      entry: "service_menu",
      services: await this.repository.listBookingNavigationShopServices({ ...input, shopId })
    };
  }

  public async listPublicTechnicianServices(
    shopId: number,
    technicianId: number,
    input: PaginationInput
  ): Promise<PaginatedResponse<TechnicianServicePayload>> {
    const pricingMode = await this.getExistingShopPricingMode(shopId);
    const services = await this.repository.listPublicTechnicianServices({ ...input, shopId, technicianId });
    const ratePercent = pricingMode.pricingMode === "technician"
      ? this.normalizeTechnicianPricingRatePercent(pricingMode.technicianPricingRatePercent)
      : 100;

    if (ratePercent === 100) {
      return services;
    }

    return {
      ...services,
      list: services.list.map((service) => ({
        ...service,
        priceAmount: Math.round((service.priceAmount * ratePercent) / 100)
      }))
    };
  }

  private normalizeTechnicianPricingRatePercent(value: number): number {
    if (!Number.isFinite(value)) {
      return 100;
    }

    return Math.min(200, Math.max(10, Math.round(value)));
  }

  private async getExistingShopPricingMode(shopId: number): Promise<ShopPricingModePayload> {
    const pricingMode = await this.repository.findShopPricingMode(shopId);

    if (!pricingMode) {
      throw this.notFound("error.shop.not_found");
    }

    return pricingMode;
  }

  private assertMerchantShopScope(actor: AuthenticatedAccessContext, shopId: number): void {
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId === shopId) {
      return;
    }

    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private async getTechnicianScope(
    actor: AuthenticatedAccessContext,
    shopId: number
  ): Promise<{ technicianId: number }> {
    if (
      actor.currentIdentityScopeType !== "technician_profile" ||
      !actor.currentIdentityScopeId
    ) {
      throw this.identityForbidden();
    }

    const scope = await this.repository.findTechnicianShopScope(actor.currentIdentityScopeId);

    if (!scope || scope.shopId !== shopId) {
      throw this.identityForbidden();
    }

    return { technicianId: scope.technicianId };
  }

  private identityForbidden(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private notFound(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message,
      statusCode: 404
    });
  }

  private record(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    shopId: number,
    metadata?: unknown
  ): Promise<void> {
    return this.auditLogService.record({
      actor,
      action,
      targetType: "shop",
      targetId: shopId,
      context,
      metadata
    });
  }
}
