import type { Request, Response, NextFunction } from "express";
import type { WorkStatusPortal } from "../domain/work-status";
import type { WorkStatusService } from "../services/work-status.service";
import { getAuthenticatedAccess } from "../utils/request-context";
import { successResponse } from "../utils/api-response";
import {
  workStatusChangeSchema,
  workStatusCommentSchema,
  workStatusIdSchema,
  workStatusQuerySchema,
  workStatusShopSwitchSchema
} from "../validators/work-status.validator";
export class WorkStatusController {
  constructor(
    private readonly service: WorkStatusService,
    private readonly portal: WorkStatusPortal
  ) {}
  private id(req: Request) {
    return this.portal === "technician" ? undefined : workStatusIdSchema.parse(req.params).id;
  }
  snapshot = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        successResponse(
          await this.service.snapshot(getAuthenticatedAccess(res), this.portal, this.id(req))
        )
      );
    } catch (error) {
      next(error);
    }
  };
  events = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        successResponse(
          await this.service.events(
            getAuthenticatedAccess(res),
            this.portal,
            this.id(req),
            workStatusQuerySchema.parse(req.query)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };
  change = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        successResponse(
          await this.service.change(
            getAuthenticatedAccess(res),
            workStatusChangeSchema.parse(req.body)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };
  switchCurrentShop = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        successResponse(
          await this.service.switchCurrentShop(
            getAuthenticatedAccess(res),
            workStatusShopSwitchSchema.parse(req.body)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };
  comment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        successResponse(
          await this.service.comment(
            getAuthenticatedAccess(res),
            this.portal,
            this.id(req),
            workStatusCommentSchema.parse(req.body)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };
}
