import type { NextFunction, Request, Response } from "express";
import type { AgentCommissionRuleService } from "../services/agent-commission-rule.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  agentCommissionRuleListQuerySchema,
  agentCommissionRulePublishBodySchema
} from "../validators/agent-commission-rule.validator";
import { agentParamSchema } from "../validators/platform-partner.validator";

export class AgentCommissionRuleController {
  public constructor(private readonly service: AgentCommissionRuleService) {}

  public list = this.handle(async (request, response) => {
    const { agentPublicId } = agentParamSchema.parse(request.params);
    const query = agentCommissionRuleListQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.service.listRules(getAuthenticatedAccess(response), agentPublicId, {
          ...query,
          at: query.at ?? new Date()
        })
      )
    );
  });

  public publish = this.handle(async (request, response) => {
    const { agentPublicId } = agentParamSchema.parse(request.params);
    response
      .status(201)
      .json(
        successResponse(
          await this.service.publishRule(
            getAuthenticatedAccess(response),
            agentPublicId,
            agentCommissionRulePublishBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
  });

  private handle(
    handler: (request: Request, response: Response) => Promise<void>
  ): (request: Request, response: Response, next: NextFunction) => Promise<void> {
    return async (request, response, next) => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
