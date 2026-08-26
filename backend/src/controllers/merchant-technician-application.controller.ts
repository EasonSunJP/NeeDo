import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { TechnicianApplicationReviewService } from "../services/technician-application-review.service";
import type { TechnicianResumeExportService } from "../services/technician-resume-export.service";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import {
  merchantTechnicianApplicationIdParamSchema,
  merchantTechnicianApplicationListQuerySchema,
  merchantTechnicianApplicationRejectBodySchema,
  merchantTechnicianApplicationReviewBodySchema
} from "../validators/merchant-technician-application.validator";

export class MerchantTechnicianApplicationController {
  public constructor(
    private readonly review: TechnicianApplicationReviewService,
    private readonly resumes: TechnicianResumeExportService
  ) {}

  public list = this.handle(async (request, response) => {
    const query = merchantTechnicianApplicationListQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.review.list(this.shopId(response), {
          page: query.page,
          pageSize: query.page_size,
          status: query.status
        })
      )
    );
  });

  public get = this.handle(async (request, response) => {
    const { id } = merchantTechnicianApplicationIdParamSchema.parse(request.params);
    response.status(200).json(successResponse(await this.review.get(id, this.shopId(response))));
  });

  public approve = this.handle(async (request, response) => {
    const { id } = merchantTechnicianApplicationIdParamSchema.parse(request.params);
    const body = merchantTechnicianApplicationReviewBodySchema.parse(request.body);
    const auth = this.auth(response);
    response.status(200).json(
      successResponse(
        await this.review.approve({
          applicationId: id,
          reviewerUserId: auth.userId,
          reviewerShopId: this.shopId(response),
          expectedVersion: body.expectedVersion,
          now: new Date()
        })
      )
    );
  });

  public reject = this.handle(async (request, response) => {
    const { id } = merchantTechnicianApplicationIdParamSchema.parse(request.params);
    const body = merchantTechnicianApplicationRejectBodySchema.parse(request.body);
    const auth = this.auth(response);
    response.status(200).json(
      successResponse(
        await this.review.reject({
          applicationId: id,
          reviewerUserId: auth.userId,
          reviewerShopId: this.shopId(response),
          expectedVersion: body.expectedVersion,
          rejectionReason: body.rejectionReason,
          now: new Date()
        })
      )
    );
  });

  public contact = this.handle(async (_request, response) => {
    const { id } = merchantTechnicianApplicationIdParamSchema.parse(_request.params);
    const auth = this.auth(response);
    response.status(200).json(
      successResponse(
        await this.review.contact({
          applicationId: id,
          reviewerUserId: auth.userId,
          reviewerShopId: this.shopId(response),
          now: new Date()
        })
      )
    );
  });

  public exportResume = this.handle(async (request, response) => {
    const { id } = merchantTechnicianApplicationIdParamSchema.parse(request.params);
    const auth = this.auth(response);
    const result = await this.resumes.export({
      applicationId: id,
      reviewerUserId: auth.userId,
      reviewerShopId: this.shopId(response),
      exportedAt: new Date()
    });
    response.setHeader("Content-Type", result.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="needo-technician-application.xlsx"; filename*=UTF-8''${encodeURIComponent(
        result.filename
      )}`
    );
    response.status(200).send(result.buffer);
  });

  private auth(response: Response): AuthenticatedAccessContext {
    return response.locals.auth as AuthenticatedAccessContext;
  }

  private shopId(response: Response): number {
    const auth = this.auth(response);
    if (auth.currentIdentityScopeType !== "shop" || !auth.currentIdentityScopeId) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.forbidden",
        statusCode: 403
      });
    }
    return auth.currentIdentityScopeId;
  }

  private handle(
    handler: (request: Request, response: Response) => Promise<void>
  ): (request: Request, response: Response, next: NextFunction) => Promise<void> {
    return async (request, response, next) => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
