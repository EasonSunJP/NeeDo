import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AgentSettlementController } from "../controllers/agent-settlement.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AgentSettlementRepository } from "../repositories/agent-settlement.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AgentSettlementService } from "../services/agent-settlement.service";
import { AuditLogService } from "../services/audit-log.service";
import {
  agentSettlementAgentParamSchema,
  agentSettlementConfirmBodySchema,
  agentSettlementListQuerySchema,
  agentSettlementParamSchema,
  agentSettlementPaymentBodySchema,
  agentSettlementPreviewBodySchema
} from "../validators/agent-settlement.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const AGENT_SETTLEMENT_PERMISSIONS = {
  read: "backoffice:agent-settlement:read",
  write: "backoffice:agent-settlement:write",
  pay: "backoffice:agent-settlement:pay"
} as const;

export const createAgentSettlementRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new AgentSettlementService(
    dependencies.agentSettlementRepository ?? new AgentSettlementRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new AgentSettlementController(service);

  router.post(
    "/backoffice/agents/:agentPublicId/settlements/preview",
    authenticate(),
    createAuthorizeMiddleware(AGENT_SETTLEMENT_PERMISSIONS.write),
    validateRequest({
      params: agentSettlementAgentParamSchema,
      body: agentSettlementPreviewBodySchema
    }),
    controller.preview
  );
  router.post(
    "/backoffice/agents/:agentPublicId/settlements",
    authenticate(),
    createAuthorizeMiddleware(AGENT_SETTLEMENT_PERMISSIONS.write),
    validateRequest({
      params: agentSettlementAgentParamSchema,
      body: agentSettlementConfirmBodySchema
    }),
    controller.confirm
  );
  router.get(
    "/backoffice/agents/:agentPublicId/settlements",
    authenticate(),
    createAuthorizeMiddleware(AGENT_SETTLEMENT_PERMISSIONS.read),
    validateRequest({
      params: agentSettlementAgentParamSchema,
      query: agentSettlementListQuerySchema
    }),
    controller.list
  );
  router.post(
    "/backoffice/agents/:agentPublicId/settlements/:settlementPublicId/payment",
    authenticate(),
    createAuthorizeMiddleware(AGENT_SETTLEMENT_PERMISSIONS.pay),
    validateRequest({
      params: agentSettlementParamSchema,
      body: agentSettlementPaymentBodySchema
    }),
    controller.markPaid
  );

  return router;
};
