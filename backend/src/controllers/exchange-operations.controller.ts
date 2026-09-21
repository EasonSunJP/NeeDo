import type { NextFunction, Request, Response } from "express";
import type { ExchangeOperationsService } from "../services/exchange-operations.service";
import type { BackofficePreferenceService } from "../services/backoffice-preference.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  type ExchangeOperationsListQuery,
  exchangeOperationsPostIdParamSchema
} from "../validators/exchange-operations.validator";

export class ExchangeOperationsController {
  public constructor(
    private readonly service: ExchangeOperationsService,
    private readonly preference?: Pick<BackofficePreferenceService, "getEffective">
  ) {}

  private async showTestNdpData(response: Response): Promise<boolean> {
    const actor = getAuthenticatedAccess(response);
    return (await this.preference?.getEffective(actor.userId))?.showTestNdpData ?? true;
  }

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.list(
              request.query as unknown as ExchangeOperationsListQuery,
              await this.showTestNdpData(response)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public detail = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = exchangeOperationsPostIdParamSchema.parse(request.params);
      response.status(200).json(successResponse(
        await this.service.detail(id, await this.showTestNdpData(response))
      ));
    } catch (error) {
      next(error);
    }
  };
}
