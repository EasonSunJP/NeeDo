import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { EkycApplicationService } from "../services/ekyc-application.service";
import { ekycIdSchema, ekycListSchema } from "../validators/ekyc-application.validator";
import { successResponse } from "../utils/api-response";
export class EkycApplicationController {
  public constructor(private readonly service: EkycApplicationService) {}
  public listMine = this.handle(async (req, res) => {
    res.json(
      successResponse(await this.service.list(this.userId(res), ekycListSchema.parse(req.query)))
    );
  });
  public listOps = this.handle(async (req, res) => {
    res.json(successResponse(await this.service.list(undefined, ekycListSchema.parse(req.query))));
  });
  public detailMine = this.handle(async (req, res) => {
    res.json(
      successResponse(
        await this.service.detail(ekycIdSchema.parse(req.params).id, this.userId(res))
      )
    );
  });
  public detailOps = this.handle(async (req, res) => {
    res.json(successResponse(await this.service.detail(ekycIdSchema.parse(req.params).id)));
  });
  public create = this.handle(async (req, res) => {
    res.status(201).json(successResponse(await this.service.create(this.userId(res), req.body)));
  });
  public withdraw = this.decision("withdrawn");
  public approve = this.decision("approved");
  public reject = this.decision("rejected");
  private decision(status: "withdrawn" | "approved" | "rejected") {
    return this.handle(async (req, res) => {
      res.json(
        successResponse(
          await this.service.decide(
            ekycIdSchema.parse(req.params).id,
            this.userId(res),
            status,
            req.body
          )
        )
      );
    });
  }
  private userId(res: Response) {
    return (res.locals.auth as AuthenticatedAccessContext).userId;
  }
  private handle(handler: (req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        await handler(req, res);
      } catch (error) {
        next(error);
      }
    };
  }
}
