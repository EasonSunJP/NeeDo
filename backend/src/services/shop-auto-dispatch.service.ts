import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import {
  ShopAutoDispatchRuleValidationError,
  type ShopAutoDispatchRepositoryPort
} from "../repositories/shop-auto-dispatch.repository";
import type { ShopAutoDispatchRuleBody } from "../validators/shop-auto-dispatch.validator";
import { requireMerchantShopId } from "./merchant-shop-scope";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";

export class ShopAutoDispatchService {
  public constructor(
    private readonly repository: ShopAutoDispatchRepositoryPort,
    private readonly audit: Pick<AuditLogService, "record">
  ) {}

  public read(actor: AuthenticatedAccessContext) {
    return this.repository.read(requireMerchantShopId(actor));
  }

  public async update(actor: AuthenticatedAccessContext, context: AuthRequestContext, input: ShopAutoDispatchRuleBody) {
    const shopId = requireMerchantShopId(actor);
    const result = await this.repository.replace(shopId, actor.userId, input).catch((error: unknown) => {
      if (error instanceof ShopAutoDispatchRuleValidationError) {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: error.message,
          statusCode: 400
        });
      }
      throw error;
    });
    await this.audit.record({
      actor,
      context,
      action: "merchant_admin.auto_dispatch_rule.update",
      targetType: "shop",
      targetId: shopId,
      metadata: { enabled: result.enabled, strategy: result.strategy, preferredTechnicianIds: result.preferredTechnicianIds }
    });
    return result;
  }
}
