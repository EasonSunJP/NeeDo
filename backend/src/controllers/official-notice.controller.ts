import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { OfficialNoticeService } from "../services/official-notice.service";
import { successResponse } from "../utils/api-response";
import { getRequestContext } from "../utils/request-context";
import type {
  MerchantNoticeDraftCreateBody,
  MerchantNoticeDraftUpdateBody,
  MerchantNoticeCreateBody,
  OfficialNoticeCreateBody,
  OfficialNoticeDraftCreateBody,
  OfficialNoticeDraftUpdateBody,
  OfficialNoticeLifecycleBody,
  OfficialNoticeListQuery,
  OfficialNoticePlanBody,
  OfficialNoticeReadQuery
} from "../validators/official-notice.validator";

export class OfficialNoticeController {
  public constructor(private readonly service: OfficialNoticeService) {}

  public listBackoffice = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listBackoffice(
            this.actor(response),
            request.query as unknown as OfficialNoticeListQuery
          )
        )
      );
  });

  public createAndPlan = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createAndPlan(
            this.actor(response),
            getRequestContext(request),
            request.body as OfficialNoticeCreateBody
          )
        )
      );
  });

  public createDraft = this.handle(async (request, response) => {
    response.status(201).json(successResponse(await this.service.createDraft(
      this.actor(response),
      getRequestContext(request),
      request.body as OfficialNoticeDraftCreateBody
    )));
  });

  public getDraft = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.getDraft(
      this.actor(response),
      request.params.publicId
    )));
  });

  public updateDraft = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.updateDraft(
      this.actor(response),
      getRequestContext(request),
      request.params.publicId,
      request.body as OfficialNoticeDraftUpdateBody
    )));
  });

  public planDraft = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.planDraft(
      this.actor(response),
      getRequestContext(request),
      request.params.publicId,
      request.body as OfficialNoticePlanBody
    )));
  });

  public listMerchant = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listMerchant(
            this.actor(response),
            request.query as unknown as OfficialNoticeListQuery
          )
        )
      );
  });

  public createAndPlanMerchant = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createAndPlanMerchant(
            this.actor(response),
            getRequestContext(request),
            request.body as MerchantNoticeCreateBody
          )
        )
      );
  });

  public createDraftMerchant = this.handle(async (request, response) => {
    response.status(201).json(successResponse(await this.service.createDraftMerchant(
      this.actor(response),
      getRequestContext(request),
      request.body as MerchantNoticeDraftCreateBody
    )));
  });

  public getMerchantDraft = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.getMerchantDraft(
      this.actor(response),
      request.params.publicId
    )));
  });

  public updateDraftMerchant = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.updateDraftMerchant(
      this.actor(response),
      getRequestContext(request),
      request.params.publicId,
      request.body as MerchantNoticeDraftUpdateBody
    )));
  });

  public planDraftMerchant = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.planDraftMerchant(
      this.actor(response),
      getRequestContext(request),
      request.params.publicId,
      request.body as OfficialNoticePlanBody
    )));
  });

  public cancelMerchant = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.cancelMerchant(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            request.body as OfficialNoticeLifecycleBody
          )
        )
      );
  });

  public archiveMerchant = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.archiveMerchant(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            request.body as OfficialNoticeLifecycleBody
          )
        )
      );
  });

  public retryMerchantFailures = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.retryMerchantFailures(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            request.body as OfficialNoticeLifecycleBody
          )
        )
      );
  });

  public cancel = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.cancel(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            request.body as OfficialNoticeLifecycleBody
          )
        )
      );
  });

  public archive = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.archive(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            request.body as OfficialNoticeLifecycleBody
          )
        )
      );
  });

  public retryFailures = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.retryFailures(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            request.body as OfficialNoticeLifecycleBody
          )
        )
      );
  });

  public listMine = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listMine(
            this.actor(response),
            request.query as unknown as OfficialNoticeReadQuery
          )
        )
      );
  });

  public markRead = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.markRead(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId
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
