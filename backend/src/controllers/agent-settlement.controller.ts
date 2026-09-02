import type { NextFunction, Request, Response } from "express";
import type { AgentSettlementService } from "../services/agent-settlement.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  agentSettlementAgentParamSchema,
  agentSettlementConfirmBodySchema,
  agentSettlementListQuerySchema,
  agentSettlementParamSchema,
  agentSettlementPaymentBodySchema,
  agentSettlementPreviewBodySchema
} from "../validators/agent-settlement.validator";

export class AgentSettlementController {
  public constructor(private readonly service: AgentSettlementService) {}

  public preview = this.handle(async (request, response) => {
    const { agentPublicId } = agentSettlementAgentParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.previewSettlement(
            getAuthenticatedAccess(response),
            agentPublicId,
            agentSettlementPreviewBodySchema.parse(request.body)
          )
        )
      );
  });

  public confirm = this.handle(async (request, response) => {
    const { agentPublicId } = agentSettlementAgentParamSchema.parse(request.params);
    const result = await this.service.confirmSettlement(
      getAuthenticatedAccess(response),
      agentPublicId,
      agentSettlementConfirmBodySchema.parse(request.body),
      getRequestContext(request)
    );
    response.status(result.applied ? 201 : 200).json(successResponse(result.settlement));
  });

  public list = this.handle(async (request, response) => {
    const { agentPublicId } = agentSettlementAgentParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.listSettlements(getAuthenticatedAccess(response), {
          agentPublicId,
          ...agentSettlementListQuerySchema.parse(request.query)
        })
      )
    );
  });

  public markPaid = this.handle(async (request, response) => {
    const { agentPublicId, settlementPublicId } = agentSettlementParamSchema.parse(request.params);
    const result = await this.service.markPaid(
      getAuthenticatedAccess(response),
      agentPublicId,
      settlementPublicId,
      agentSettlementPaymentBodySchema.parse(request.body),
      getRequestContext(request)
    );
    response.status(200).json(successResponse(result.settlement));
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
