import type { Request, Response, NextFunction } from "express";
import type { SosService } from "../services/sos.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  sosAlertParams,
  sosOrderParams,
  sosSendBody,
  sosListQuery
} from "../validators/sos.validator";
export class SosController {
  constructor(private readonly service: SosService) {}
  private handle(work: (request: Request, response: Response) => Promise<unknown>) {
    return async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.status(200).json(successResponse(await work(request, response)));
      } catch (error) {
        next(error);
      }
    };
  }
  availability = this.handle((req, res) =>
    this.service.availability(sosOrderParams.parse(req.params).orderId, getAuthenticatedAccess(res))
  );
  send = this.handle((req, res) =>
    this.service.send(
      sosOrderParams.parse(req.params).orderId,
      sosSendBody.parse(req.body).idempotencyKey,
      getAuthenticatedAccess(res),
      getRequestContext(req)
    )
  );
  list = this.handle((req, res) =>
    this.service.list(sosListQuery.parse(req.query), getAuthenticatedAccess(res))
  );
  count = this.handle((_req, res) => this.service.count(getAuthenticatedAccess(res)));
  resolve = this.handle((req, res) =>
    this.service.resolve(
      sosAlertParams.parse(req.params).alertId,
      getAuthenticatedAccess(res),
      getRequestContext(req)
    )
  );
}
