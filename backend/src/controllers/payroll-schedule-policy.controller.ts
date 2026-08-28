import type { NextFunction, Request, Response } from "express";
import type { PayrollSchedulePolicyService } from "../services/payroll-schedule-policy.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  employeePayrollSchedulePolicyBodySchema,
  employeePayrollSchedulePolicyParamSchema,
  payrollSchedulePolicyQuerySchema,
  shopPayrollSchedulePolicyBodySchema
} from "../validators/payroll-schedule-policy.validator";

export class PayrollSchedulePolicyController {
  public constructor(private readonly service: PayrollSchedulePolicyService) {}

  public getShopPolicy = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = payrollSchedulePolicyQuerySchema.parse(request.query);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getShopPolicy(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              query.referenceDate
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public updateShopPolicy = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.updateShopPolicy(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopPayrollSchedulePolicyBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public getEmployeePolicy = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { needoId } = employeePayrollSchedulePolicyParamSchema.parse(request.params);
      const query = payrollSchedulePolicyQuerySchema.parse(request.query);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getEmployeePolicy(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              needoId,
              query.referenceDate
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public updateEmployeePolicy = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { needoId } = employeePayrollSchedulePolicyParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.updateEmployeePolicy(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              needoId,
              employeePayrollSchedulePolicyBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
