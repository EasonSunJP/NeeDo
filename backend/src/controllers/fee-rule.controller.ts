import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { FeeCalculationService } from "../services/fee-calculation.service";
import { successResponse } from "../utils/api-response";
import {
  feeCalculationLogListQuerySchema,
  feeRulePreviewBodySchema,
  feeRuleSetCreateBodySchema,
  feeRuleSetIdParamSchema,
  feeRuleSetListQuerySchema,
  feeRuleSetUpdateBodySchema
} from "../validators/fee-rule.validator";

export class FeeRuleController {
  public constructor(private readonly service: FeeCalculationService) {}

  public listRuleSets = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listRuleSets(feeRuleSetListQuerySchema.parse(request.query))
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public createRuleSet = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(201)
        .json(
          successResponse(
            await this.service.createRuleSet(
              feeRuleSetCreateBodySchema.parse(request.body),
              this.getActor(response).userId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public updateRuleSet = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.updateRuleSet(
              feeRuleSetIdParamSchema.parse(request.params).id,
              feeRuleSetUpdateBodySchema.parse(request.body),
              this.getActor(response).userId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public activateRuleSet = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.setRuleSetStatus(
              feeRuleSetIdParamSchema.parse(request.params).id,
              "active",
              this.getActor(response).userId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public pauseRuleSet = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.setRuleSetStatus(
              feeRuleSetIdParamSchema.parse(request.params).id,
              "paused",
              this.getActor(response).userId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public previewFee = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.calculateFee(feeRulePreviewBodySchema.parse(request.body))
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listCalculationLogs = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listCalculationLogs(
              feeCalculationLogListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private getActor(response: Response): AuthenticatedAccessContext {
    return response.locals.auth as AuthenticatedAccessContext;
  }
}
