import type { NextFunction, Request, Response } from "express";
import type { BookingService } from "../services/booking.service";
import { successResponse } from "../utils/api-response";
import {
  availabilityListQuerySchema,
  bookingCreateBodySchema,
  createOrderAddOnBodySchema,
  confirmReceiptBodySchema,
  endServiceBodySchema,
  manualPaymentConfirmBodySchema,
  manualPaymentRefundBodySchema,
  orderCancelBodySchema,
  orderConfirmBodySchema,
  orderAddOnDecisionBodySchema,
  orderAddOnIdParamsSchema,
  orderIdParamSchema,
  orderListQuerySchema,
  orderReviewCreateBodySchema,
  payWithNdpBodySchema,
  selectPaymentMethodBodySchema,
  startServiceBodySchema,
  scheduleSlotCreateBodySchema,
  scheduleSlotListQuerySchema,
  scheduleSlotUpdateBodySchema
} from "../validators/booking.validator";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";

export class BookingController {
  public constructor(private readonly bookingService: BookingService) {}

  public listAvailableSlots = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.listAvailableSlots(
              availabilityListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public createBooking = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(201)
        .json(
          successResponse(
            await this.bookingService.createBooking(
              this.getActor(response),
              bookingCreateBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listOrders = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.listOrders(
              this.getActor(response),
              orderListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public getOrder = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.getOrder(this.getActor(response), this.getOrderId(request))
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public confirmOrder = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = orderConfirmBodySchema.parse(request.body);
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.transitionOrder(
              this.getActor(response),
              this.getOrderId(request),
              "confirm",
              undefined,
              body
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public cancelOrder = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = orderCancelBodySchema.parse(request.body);

      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.transitionOrder(
              this.getActor(response),
              this.getOrderId(request),
              "cancel",
              body.reason
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public startService = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.startService(
              this.getActor(response),
              this.getOrderId(request),
              startServiceBodySchema.parse(request.body),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public createOrderAddOn = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.createOrderAddOn(
              this.getActor(response),
              this.getOrderId(request),
              createOrderAddOnBodySchema.parse(request.body),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public acceptOrderAddOn = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const params = orderAddOnIdParamsSchema.parse(request.params);
      response.status(200).json(
        successResponse(
          await this.bookingService.acceptOrderAddOn(
            this.getActor(response),
            params.id,
            params.addOnId,
            orderAddOnDecisionBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public rejectOrderAddOn = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const params = orderAddOnIdParamsSchema.parse(request.params);
      response.status(200).json(
        successResponse(
          await this.bookingService.rejectOrderAddOn(
            this.getActor(response),
            params.id,
            params.addOnId,
            orderAddOnDecisionBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public endService = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.endService(
            this.getActor(response),
            this.getOrderId(request),
            endServiceBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public getCheckout = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.getCheckout(this.getActor(response), this.getOrderId(request))
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public createOrderReview = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.createOrderReview(
            this.getActor(response),
            this.getOrderId(request),
            orderReviewCreateBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public getOwnOrderReview = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.getOwnOrderReview(
            this.getActor(response),
            this.getOrderId(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public selectCheckoutPaymentMethod = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.selectCheckoutPaymentMethod(
            this.getActor(response),
            this.getOrderId(request),
            selectPaymentMethodBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public payCheckoutWithNdp = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.payCheckoutWithNdp(
            this.getActor(response),
            this.getOrderId(request),
            payWithNdpBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public confirmCheckoutReceipt = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.confirmCheckoutReceipt(
            getAuthenticatedAccess(response),
            this.getOrderId(request),
            confirmReceiptBodySchema.parse(request.body),
            getRequestContext(request),
            false
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public overrideCheckoutReceipt = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.confirmCheckoutReceipt(
            getAuthenticatedAccess(response),
            this.getOrderId(request),
            confirmReceiptBodySchema.parse(request.body),
            getRequestContext(request),
            true
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public confirmManualPayment = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.confirmManualPayment(
            getAuthenticatedAccess(response),
            this.getOrderId(request),
            manualPaymentConfirmBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public refundManualPayment = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.refundManualPayment(
            getAuthenticatedAccess(response),
            this.getOrderId(request),
            manualPaymentRefundBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public listScheduleSlots = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.bookingService.listScheduleSlots(getAuthenticatedAccess(response), scheduleSlotListQuerySchema.parse(request.query))));
    } catch (error) { next(error); }
  };

  public getScheduleSlot = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.getScheduleSlot(
            getAuthenticatedAccess(response),
            this.getOrderId(request)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public createScheduleSlot = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(201).json(successResponse(await this.bookingService.createScheduleSlot(getAuthenticatedAccess(response), scheduleSlotCreateBodySchema.parse(request.body), getRequestContext(request))));
    } catch (error) { next(error); }
  };

  public updateScheduleSlot = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.bookingService.updateScheduleSlot(getAuthenticatedAccess(response), this.getOrderId(request), scheduleSlotUpdateBodySchema.parse(request.body), getRequestContext(request))));
    } catch (error) { next(error); }
  };

  public deleteScheduleSlot = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.bookingService.deleteScheduleSlot(getAuthenticatedAccess(response), this.getOrderId(request), getRequestContext(request))));
    } catch (error) { next(error); }
  };

  private getActor(response: Response) {
    return getAuthenticatedAccess(response);
  }

  private getOrderId(request: Request): number {
    return orderIdParamSchema.parse(request.params).id;
  }
}
