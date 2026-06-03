import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { FeeRuleController } from "../controllers/fee-rule.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { FeeRuleRepository } from "../repositories/fee-rule.repository";
import { FeeCalculationService } from "../services/fee-calculation.service";
import {
  feeCalculationLogListQuerySchema,
  feeRulePreviewBodySchema,
  feeRuleSetCreateBodySchema,
  feeRuleSetIdParamSchema,
  feeRuleSetListQuerySchema,
  feeRuleSetUpdateBodySchema
} from "../validators/fee-rule.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const FEE_RULE_ROUTE_PERMISSIONS = {
  list: "finance:fee-rule:list",
  write: "finance:fee-rule:write",
  activate: "finance:fee-rule:activate",
  preview: "finance:fee-rule:preview",
  calculationLogList: "finance:calculation-log:list"
} as const;

export const createFeeRuleRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const service = new FeeCalculationService(
    dependencies.feeRuleRepository ?? new FeeRuleRepository()
  );
  const controller = new FeeRuleController(service);

  router.get(
    "/finance/fee-rule-sets",
    authenticate(),
    authorize(FEE_RULE_ROUTE_PERMISSIONS.list),
    validateRequest({ query: feeRuleSetListQuerySchema }),
    controller.listRuleSets
  );
  router.post(
    "/finance/fee-rule-sets",
    authenticate(),
    authorize(FEE_RULE_ROUTE_PERMISSIONS.write),
    validateRequest({ body: feeRuleSetCreateBodySchema }),
    controller.createRuleSet
  );
  router.put(
    "/finance/fee-rule-sets/:id",
    authenticate(),
    authorize(FEE_RULE_ROUTE_PERMISSIONS.write),
    validateRequest({ params: feeRuleSetIdParamSchema, body: feeRuleSetUpdateBodySchema }),
    controller.updateRuleSet
  );
  router.post(
    "/finance/fee-rule-sets/:id/activate",
    authenticate(),
    authorize(FEE_RULE_ROUTE_PERMISSIONS.activate),
    validateRequest({ params: feeRuleSetIdParamSchema }),
    controller.activateRuleSet
  );
  router.post(
    "/finance/fee-rule-sets/:id/pause",
    authenticate(),
    authorize(FEE_RULE_ROUTE_PERMISSIONS.activate),
    validateRequest({ params: feeRuleSetIdParamSchema }),
    controller.pauseRuleSet
  );
  router.post(
    "/finance/fee-rules/preview",
    authenticate(),
    authorize(FEE_RULE_ROUTE_PERMISSIONS.preview),
    validateRequest({ body: feeRulePreviewBodySchema }),
    controller.previewFee
  );
  router.get(
    "/finance/fee-calculation-logs",
    authenticate(),
    authorize(FEE_RULE_ROUTE_PERMISSIONS.calculationLogList),
    validateRequest({ query: feeCalculationLogListQuerySchema }),
    controller.listCalculationLogs
  );

  return router;
};
