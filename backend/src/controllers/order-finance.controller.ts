import type { NextFunction, Request, Response } from "express";
import type { OrderFinanceService } from "../services/order-finance.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  orderFinanceBookingOrderIdParamSchema,
  serviceIncomeReportBodySchema
} from "../validators/order-finance.validator";

export class OrderFinanceController {
  public constructor(private readonly service: OrderFinanceService) {}

  public getMerchantOrderFinance = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { bookingOrderId } = orderFinanceBookingOrderIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getMerchantOrderFinance(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              bookingOrderId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public getBackofficeOrderFinance = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { bookingOrderId } = orderFinanceBookingOrderIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getBackofficeOrderFinance(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              bookingOrderId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public reportMerchantServiceIncome = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { bookingOrderId } = orderFinanceBookingOrderIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.reportMerchantServiceIncome(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              bookingOrderId,
              serviceIncomeReportBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
