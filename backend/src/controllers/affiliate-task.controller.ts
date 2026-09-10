import type { NextFunction, Request, Response } from "express";
import type { AffiliateTaskService } from "../services/affiliate-task.service";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { MerchantAffiliateTaskContextService } from "../services/merchant-affiliate-task-context.service";
import { successResponse } from "../utils/api-response";
import {
  affiliateTaskIdParamSchema,
  affiliateTaskLocaleParamSchema,
  affiliateTaskListQuerySchema,
  backofficeAffiliateTaskListQuerySchema,
  createAffiliateTaskBodySchema,
  rejectAffiliateTaskBodySchema,
  updateAffiliateTaskBodySchema,
  updateAffiliateTaskTranslationBodySchema
} from "../validators/affiliate-task.validator";

export class AffiliateTaskController {
  public constructor(
    private readonly service: AffiliateTaskService,
    private readonly presenter: MerchantAffiliateTaskContextService
  ) {}

  public listPublisherTasks = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.presenter.presentTaskPage(
          await this.service.listPublisherTasks(
            this.actor(response),
            affiliateTaskListQuerySchema.parse(request.query)
          )
        )
      )
    );
  });

  public createDraft = this.handle(async (request, response) => {
    response.status(201).json(
      successResponse(
        await this.presenter.presentTask(
          await this.service.createDraft(
            this.actor(response),
            createAffiliateTaskBodySchema.parse(request.body)
          )
        )
      )
    );
  });

  public getPublisherTask = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.presenter.presentTask(
          await this.service.getPublisherTask(
            this.actor(response),
            affiliateTaskIdParamSchema.parse(request.params).taskId
          )
        )
      )
    );
  });

  public updateDraft = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.presenter.presentTask(
          await this.service.updateDraft(
            this.actor(response),
            affiliateTaskIdParamSchema.parse(request.params).taskId,
            updateAffiliateTaskBodySchema.parse(request.body)
          )
        )
      )
    );
  });

  public updateDraftLocale = this.handle(async (request, response) => {
    const params = affiliateTaskLocaleParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.presenter.presentTask(
          await this.service.updateDraftLocale(
            this.actor(response),
            params.taskId,
            params.locale,
            updateAffiliateTaskTranslationBodySchema.parse(request.body)
          )
        )
      )
    );
  });

  public submit = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.presenter.presentTask(
          await this.service.submit(
            this.actor(response),
            affiliateTaskIdParamSchema.parse(request.params).taskId
          )
        )
      )
    );
  });

  public listBackofficeTasks = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listBackofficeTasks(
            this.actor(response),
            backofficeAffiliateTaskListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public getBackofficeTask = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getBackofficeTask(
            this.actor(response),
            affiliateTaskIdParamSchema.parse(request.params).taskId
          )
        )
      );
  });

  public approve = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.approve(
            this.actor(response),
            affiliateTaskIdParamSchema.parse(request.params).taskId
          )
        )
      );
  });

  public reject = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.reject(
            this.actor(response),
            affiliateTaskIdParamSchema.parse(request.params).taskId,
            rejectAffiliateTaskBodySchema.parse(request.body).reason
          )
        )
      );
  });

  private actor(response: Response): AuthenticatedAccessContext {
    return response.locals.auth as AuthenticatedAccessContext;
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
