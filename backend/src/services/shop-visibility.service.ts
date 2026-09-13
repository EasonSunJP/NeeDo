import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import type {
  ShopVisibility,
  ShopVisibilityViewer
} from "../repositories/shop-visibility.repository";
import { AppError } from "../utils/app-error";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { assertMerchantShopId } from "./merchant-shop-scope";

export interface ShopVisibilityPayload {
  shopId: number;
  visibility: ShopVisibility;
  updatedAt: Date | string | null;
  updatedBy: number | null;
}

export interface ShopVisibilityUpdateInput {
  shopId: number;
  visibility: ShopVisibility;
  actorUserId: number;
  updatedAt: Date;
  auditLog: AuditLogCreateInput;
}

export interface ShopVisibilityRepositoryPort {
  buildVisibilityWhere(viewer?: ShopVisibilityViewer): Promise<Record<string, unknown>>;
  canView(shopId: number, viewer?: ShopVisibilityViewer): Promise<boolean>;
  canViewTarget(
    target: { id: number; ownerUserId: number | null; visibility: string },
    viewer?: ShopVisibilityViewer
  ): Promise<boolean>;
  findVisibility(shopId: number): Promise<ShopVisibilityPayload | null>;
  updateVisibility(input: ShopVisibilityUpdateInput): Promise<ShopVisibilityPayload | null>;
}

export class ShopVisibilityService {
  public constructor(
    private readonly repository: ShopVisibilityRepositoryPort,
    private readonly clock: () => Date = () => new Date()
  ) {}

  public async get(
    actor: AuthenticatedAccessContext,
    shopId: number
  ): Promise<ShopVisibilityPayload> {
    this.assertWritableMerchantScope(actor, shopId);
    const visibility = await this.repository.findVisibility(shopId);
    if (!visibility) throw this.notFound();
    return visibility;
  }

  public async update(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    visibility: ShopVisibility
  ): Promise<ShopVisibilityPayload> {
    this.assertWritableMerchantScope(actor, shopId);
    const current = await this.repository.findVisibility(shopId);
    if (!current) throw this.notFound();
    const updatedAt = this.clock();
    const updated = await this.repository.updateVisibility({
      shopId,
      visibility,
      actorUserId: actor.userId,
      updatedAt,
      auditLog: {
        actorId: actor.userId,
        action: "merchant_admin.shop.visibility.update",
        targetType: "shop",
        targetId: shopId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: {
          previousVisibility: current.visibility,
          nextVisibility: visibility
        }
      }
    });
    if (!updated) throw this.notFound();
    return updated;
  }

  private assertWritableMerchantScope(
    actor: AuthenticatedAccessContext,
    shopId: number
  ): void {
    if (actor.isReadOnlyMerchantPreview) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
    assertMerchantShopId(actor, shopId);
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.shop.not_found",
      statusCode: 404
    });
  }
}
