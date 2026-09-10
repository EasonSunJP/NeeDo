import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AgentCommissionRuleController } from "../controllers/agent-commission-rule.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AgentCommissionRuleRepository } from "../repositories/agent-commission-rule.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AgentCommissionRuleService } from "../services/agent-commission-rule.service";
import { AuditLogService } from "../services/audit-log.service";
import {
  agentCommissionRuleListQuerySchema,
  agentCommissionRulePublishBodySchema
} from "../validators/agent-commission-rule.validator";
import { agentParamSchema } from "../validators/platform-partner.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const AGENT_COMMISSION_RULE_PERMISSIONS = {
  read: "backoffice:agent:read",
  write: "backoffice:agent:write"
} as const;

export const createAgentCommissionRuleRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new AgentCommissionRuleService(
    dependencies.agentCommissionRuleRepository ?? new AgentCommissionRuleRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new AgentCommissionRuleController(service);

  router.get(
    "/backoffice/agents/:agentPublicId/commission-rules",
    authenticate(),
    createAuthorizeMiddleware(AGENT_COMMISSION_RULE_PERMISSIONS.read),
    validateRequest({ params: agentParamSchema, query: agentCommissionRuleListQuerySchema }),
    controller.list
  );
  router.post(
    "/backoffice/agents/:agentPublicId/commission-rules",
    authenticate(),
    createAuthorizeMiddleware(AGENT_COMMISSION_RULE_PERMISSIONS.write),
    validateRequest({ params: agentParamSchema, body: agentCommissionRulePublishBodySchema }),
    controller.publish
  );

  return router;
};
