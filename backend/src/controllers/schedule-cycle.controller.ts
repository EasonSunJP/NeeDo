import type { NextFunction, Request, Response } from "express";
import type { ScheduleCycleService } from "../services/schedule-cycle.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  scheduleCycleCommandBodySchema,
  scheduleCycleCreateBodySchema,
  scheduleCycleFeedbackBodySchema,
  scheduleCycleListQuerySchema,
  scheduleCycleOperationsListQuerySchema,
  scheduleCycleParamsSchema,
  scheduleCycleUpdateBodySchema
} from "../validators/schedule-cycle.validator";

export class ScheduleCycleController {
  public constructor(private readonly service: ScheduleCycleService) {}

  public listForMerchant = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.service.listForMerchant(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        scheduleCycleListQuerySchema.parse(request.query)
      )));
    } catch (error) {
      next(error);
    }
  };

  public createDraft = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const body = scheduleCycleCreateBodySchema.parse(request.body);
      response.status(201).json(successResponse(await this.service.createDraft(
        getAuthenticatedAccess(response), getRequestContext(request), body.targetTechnicianIds
      )));
    } catch (error) { next(error); }
  };

  public listForTechnician = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.service.listForTechnician(
        getAuthenticatedAccess(response), getRequestContext(request), scheduleCycleListQuerySchema.parse(request.query)
      )));
    } catch (error) { next(error); }
  };

  public listForOperations = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.service.listForOperations(
        scheduleCycleOperationsListQuerySchema.parse(request.query)
      )));
    } catch (error) { next(error); }
  };

  public submitTechnicianFeedback = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { cycleId } = scheduleCycleParamsSchema.parse(request.params);
      response.status(200).json(successResponse(await this.service.submitTechnicianFeedback(
        getAuthenticatedAccess(response), getRequestContext(request), cycleId,
        scheduleCycleFeedbackBodySchema.parse(request.body)
      )));
    } catch (error) { next(error); }
  };

  public updateDraft = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { cycleId } = scheduleCycleParamsSchema.parse(request.params);
      response.status(200).json(successResponse(await this.service.updateDraft(
        getAuthenticatedAccess(response), getRequestContext(request), cycleId,
        scheduleCycleUpdateBodySchema.parse(request.body)
      )));
    } catch (error) { next(error); }
  };

  public launch = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { cycleId } = scheduleCycleParamsSchema.parse(request.params);
      const { idempotencyKey } = scheduleCycleCommandBodySchema.parse(request.body);
      response.status(200).json(successResponse(await this.service.launch(
        getAuthenticatedAccess(response), getRequestContext(request), cycleId, idempotencyKey
      )));
    } catch (error) { next(error); }
  };

  public autoConfirm = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { cycleId } = scheduleCycleParamsSchema.parse(request.params);
      const { idempotencyKey } = scheduleCycleCommandBodySchema.parse(request.body);
      response.status(200).json(successResponse(await this.service.autoConfirm(
        getAuthenticatedAccess(response), getRequestContext(request), cycleId, idempotencyKey
      )));
    } catch (error) { next(error); }
  };

  public closeFeedback = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { cycleId } = scheduleCycleParamsSchema.parse(request.params);
      response.status(200).json(successResponse(await this.service.closeFeedback(
        getAuthenticatedAccess(response), getRequestContext(request), cycleId
      )));
    } catch (error) { next(error); }
  };

  public finalize = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { cycleId } = scheduleCycleParamsSchema.parse(request.params);
      const { idempotencyKey } = scheduleCycleCommandBodySchema.parse(request.body);
      response.status(200).json(successResponse(await this.service.finalize(
        getAuthenticatedAccess(response), getRequestContext(request), cycleId, idempotencyKey
      )));
    } catch (error) { next(error); }
  };

  public cancel = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { cycleId } = scheduleCycleParamsSchema.parse(request.params);
      response.status(200).json(successResponse(await this.service.cancel(
        getAuthenticatedAccess(response), getRequestContext(request), cycleId
      )));
    } catch (error) { next(error); }
  };
}
