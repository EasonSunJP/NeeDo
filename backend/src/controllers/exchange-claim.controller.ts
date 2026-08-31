import type { NextFunction, Request, Response } from "express";
import type { ExchangeClaimService } from "../services/exchange-claim.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  createExchangeClaimSchema,
  exchangeClaimIdParamSchema,
  exchangeClaimListQuerySchema,
  exchangeClaimOptionListQuerySchema,
  exchangeClaimPostIdParamSchema
} from "../validators/exchange-claim.validators";

export class ExchangeClaimController {
  public constructor(private readonly service: ExchangeClaimService) {}

  public listOptions = this.handle(async (request, response) => {
    const { id } = exchangeClaimPostIdParamSchema.parse(request.params);
    const query = exchangeClaimOptionListQuerySchema.parse(request.query);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listOptions(getAuthenticatedAccess(response), id, query)
        )
      );
  });

  public create = this.handle(async (request, response) => {
    const { id } = exchangeClaimPostIdParamSchema.parse(request.params);
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createClaim(
            getAuthenticatedAccess(response),
            id,
            createExchangeClaimSchema.parse(request.body),
            this.idempotencyKey(response),
            getRequestContext(request)
          )
        )
      );
  });

  public listReceived = this.handle(async (request, response) => {
    const { id } = exchangeClaimPostIdParamSchema.parse(request.params);
    const query = exchangeClaimListQuerySchema.parse(request.query);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listReceived(getAuthenticatedAccess(response), id, query)
        )
      );
  });

  public getMine = this.handle(async (request, response) => {
    const { id } = exchangeClaimPostIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(successResponse(await this.service.getMine(getAuthenticatedAccess(response), id)));
  });

  public withdraw = this.handle(async (request, response) => {
    const { claimId } = exchangeClaimIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.withdrawClaim(
            getAuthenticatedAccess(response),
            claimId,
            this.idempotencyKey(response),
            getRequestContext(request)
          )
        )
      );
  });

  private idempotencyKey(response: Response): string {
    return response.locals.exchangeClaimIdempotencyKey as string;
  }

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
