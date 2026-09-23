import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { EXCHANGE_PERMISSIONS } from "../constants/permissions.constants";
import { ExchangeCancellationController } from "../controllers/exchange-cancellation.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateExchangeIdempotencyKey } from "../middlewares/exchange-idempotency-key.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ExchangeCancellationRepository } from "../repositories/exchange-cancellation.repository";
import { ExchangePostRepository } from "../repositories/exchange.repository";
import { FeeRuleRepository } from "../repositories/fee-rule.repository";
import { LedgerRepository } from "../repositories/ledger.repository";
import { NdpExchangeRateRepository } from "../repositories/ndp-exchange-rate.repository";
import { PlatformFeePolicyRepository } from "../repositories/platform-fee-policy.repository";
import { ServicePrepaymentRepository } from "../repositories/service-prepayment.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ExchangeCancellationService } from "../services/exchange-cancellation.service";
import { FeeCalculationService } from "../services/fee-calculation.service";
import { LedgerService } from "../services/ledger.service";
import { NdpExchangeRateService } from "../services/ndp-exchange-rate.service";
import { PlatformFeePolicyService } from "../services/platform-fee-policy.service";
import { ServicePrepaymentService } from "../services/service-prepayment.service";
import {
  exchangeCancellationDecisionBodySchema,
  exchangeCancellationOrderIdParamSchema,
  exchangeCancellationRequestBodySchema
} from "../validators/exchange-cancellation.validators";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createExchangeCancellationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const audit = new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository());
  const ledger =
    dependencies.ledgerService ??
    new LedgerService(
      dependencies.ledgerRepository ?? new LedgerRepository(),
      new FeeCalculationService(dependencies.feeRuleRepository ?? new FeeRuleRepository()),
      undefined,
      undefined,
      new PlatformFeePolicyService(
        dependencies.platformFeePolicyRepository ?? new PlatformFeePolicyRepository(),
        audit
      )
    );
  const prepayments = new ServicePrepaymentService(
    new ServicePrepaymentRepository(),
    ledger,
    dependencies.ndpExchangeRateService ?? new NdpExchangeRateService(
      dependencies.ndpExchangeRateRepository ?? new NdpExchangeRateRepository(),
      audit
    )
  );
  const service =
    dependencies.exchangeCancellationService ??
    new ExchangeCancellationService(
      new ExchangeCancellationRepository(),
      new ExchangePostRepository(),
      audit,
      ledger,
      prepayments,
      dependencies.realtimeService
    );
  const controller = new ExchangeCancellationController(service);

  router.get(
    "/exchange/orders/:id/cancellation",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.cancellationReadOwn),
    validateRequest({ params: exchangeCancellationOrderIdParamSchema }),
    controller.get
  );
  router.post(
    "/exchange/orders/:id/cancellation/requests",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.cancellationWriteOwn),
    validateRequest({
      params: exchangeCancellationOrderIdParamSchema,
      body: exchangeCancellationRequestBodySchema
    }),
    validateExchangeIdempotencyKey,
    controller.request
  );
  for (const [path, handler] of [
    ["accept", controller.accept],
    ["reject", controller.reject],
    ["withdraw", controller.withdraw]
  ] as const) {
    router.post(
      `/exchange/orders/:id/cancellation/${path}`,
      authenticate(),
      createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.cancellationWriteOwn),
      validateRequest({
        params: exchangeCancellationOrderIdParamSchema,
        body: exchangeCancellationDecisionBodySchema
      }),
      validateExchangeIdempotencyKey,
      handler
    );
  }

  return router;
};
