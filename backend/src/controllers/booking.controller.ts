import { toShopVisibilityViewer } from "../services/shop-visibility.service";
import type { NextFunction, Request, Response } from "express";
import type { BookingService } from "../services/booking.service";
import type { SchedulePreloadService } from "../services/schedule-preload.service";
import type { TechnicianAutomationProcessor } from "../services/technician-automation-processor";
import { successResponse } from "../utils/api-response";
import {
  availabilityWindowCreateBodySchema,
  availabilityWindowListQuerySchema,
  availabilityWindowUpdateBodySchema,
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
  orderTimelineCommentBodySchema,
  payWithNdpBodySchema,
  selectPaymentMethodBodySchema,
  startServiceBodySchema,
  overdueAppointmentResolutionBodySchema,
  scheduleSlotCreateBodySchema,
  scheduleSlotDeleteQuerySchema,
  scheduleSlotListQuerySchema,
  schedulePreloadQuerySchema,
  scheduleSlotUpdateBodySchema,
  technicianManualBookingBodySchema,
  technicianManualBookingIdempotencySchema
} from "../validators/booking.validator";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import type { AuthenticatedAccessContext } from "../services/auth.service";

export class BookingController {
  public constructor(
    private readonly bookingService: BookingService,
    private readonly automationProcessor?: Pick<TechnicianAutomationProcessor, "processBooking">,
    private readonly schedulePreloadService?: SchedulePreloadService
  ) {}

  public preloadSchedule = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.schedulePreloadService) throw new Error("schedule preload service is unavailable");
      response.status(200).json(
        successResponse(
          await this.schedulePreloadService.preload(
            getAuthenticatedAccess(response),
            schedulePreloadQuerySchema.parse(request.query)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

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
              availabilityListQuerySchema.parse(request.query),
              this.shopVisibilityViewer(response)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private shopVisibilityViewer(response: Response) {
    const auth = response.locals.auth as AuthenticatedAccessContext | undefined;
    if (!auth) return undefined;
    return toShopVisibilityViewer(auth);
  }

  public listAvailabilityWindows = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.bookingService.listAvailabilityWindows(
        getAuthenticatedAccess(response),
        availabilityWindowListQuerySchema.parse(request.query)
      )));
    } catch (error) { next(error); }
  };

  public createAvailabilityWindow = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(201).json(successResponse(await this.bookingService.createAvailabilityWindow(
        getAuthenticatedAccess(response),
        availabilityWindowCreateBodySchema.parse(request.body),
        getRequestContext(request)
      )));
    } catch (error) { next(error); }
  };

  public updateAvailabilityWindow = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.bookingService.updateAvailabilityWindow(
        getAuthenticatedAccess(response),
        this.getOrderId(request),
        availabilityWindowUpdateBodySchema.parse(request.body),
        getRequestContext(request)
      )));
    } catch (error) { next(error); }
  };

  public deleteAvailabilityWindow = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.bookingService.deleteAvailabilityWindow(
        getAuthenticatedAccess(response),
        this.getOrderId(request),
        getRequestContext(request)
      )));
    } catch (error) { next(error); }
  };

  public createBooking = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = bookingCreateBodySchema.parse(request.body);
      const rawIdempotencyKey = request.get("Idempotency-Key");
      const created = await this.bookingService.createBooking(
        this.getActor(response),
        body,
        ...(rawIdempotencyKey === undefined ? [] : [rawIdempotencyKey])
      );
      await this.automationProcessor?.processBooking(created.id).catch(() => undefined);
      response.status(201).json(successResponse(created));
    } catch (error) {
      next(error);
    }
  };

  public createTechnicianManualBooking = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = technicianManualBookingBodySchema.parse(request.body);
      const idempotencyKey = technicianManualBookingIdempotencySchema.parse(
        request.get("Idempotency-Key")
      );
      const created = await this.bookingService.createTechnicianManualBooking(
        this.getActor(response),
        body,
        idempotencyKey,
        getRequestContext(request)
      );
      response.status(201).json(successResponse(created));
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

  public resolveOverdueAppointment = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.bookingService.resolveOverdueAppointment(
            this.getActor(response),
            this.getOrderId(request),
            overdueAppointmentResolutionBodySchema.parse(request.body),
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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

  public createOrderTimelineComment = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { body } = orderTimelineCommentBodySchema.parse(request.body);
      response
        .status(201)
        .json(
          successResponse(
            await this.bookingService.createOrderTimelineComment(
              this.getActor(response),
              this.getOrderId(request),
              body
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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
      response
        .status(200)
        .json(
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

  public listScheduleSlots = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.listScheduleSlots(
              getAuthenticatedAccess(response),
              scheduleSlotListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public getScheduleSlot = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
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

  public createScheduleSlot = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(201)
        .json(
          successResponse(
            await this.bookingService.createScheduleSlot(
              getAuthenticatedAccess(response),
              scheduleSlotCreateBodySchema.parse(request.body),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public updateScheduleSlot = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.updateScheduleSlot(
              getAuthenticatedAccess(response),
              this.getOrderId(request),
              scheduleSlotUpdateBodySchema.parse(request.body),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public deleteScheduleSlot = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.deleteScheduleSlot(
              getAuthenticatedAccess(response),
              this.getOrderId(request),
              getRequestContext(request),
              scheduleSlotDeleteQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private getActor(response: Response) {
    return getAuthenticatedAccess(response);
  }

  private getOrderId(request: Request): number {
    return orderIdParamSchema.parse(request.params).id;
  }
}
