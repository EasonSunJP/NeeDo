import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { BookingService } from "../services/booking.service";
import { successResponse } from "../utils/api-response";
import {
  availabilityListQuerySchema,
  bookingCreateBodySchema,
  orderCancelBodySchema,
  orderIdParamSchema,
  orderListQuerySchema
} from "../validators/booking.validator";

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
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.transitionOrder(
              this.getActor(response),
              this.getOrderId(request),
              "confirm"
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

  public startOrder = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.transitionOrder(
              this.getActor(response),
              this.getOrderId(request),
              "start"
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public completeOrder = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.bookingService.transitionOrder(
              this.getActor(response),
              this.getOrderId(request),
              "complete"
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private getActor(response: Response) {
    const auth = response.locals.auth as AuthenticatedAccessContext;

    return {
      userId: auth.userId,
      roles: auth.roles
    };
  }

  private getOrderId(request: Request): number {
    return orderIdParamSchema.parse(request.params).id;
  }
}
