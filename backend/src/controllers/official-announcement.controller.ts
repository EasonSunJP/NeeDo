import type { NextFunction, Request, Response } from "express";
import type { ContentLocaleCode } from "../constants/content-locales";
import type { OfficialAnnouncementService } from "../services/official-announcement.service";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import { successResponse } from "../utils/api-response";
import { getRequestContext } from "../utils/request-context";
import type {
  AnnouncementDraftBody,
  ContentHistoryQuery,
  DisableBody,
  PublishBody,
  RollbackBody,
  ScheduleBody
} from "../validators/content-publication.validator";

type AnnouncementCreateBody = Extract<AnnouncementDraftBody, { idempotencyKey: string }>;
type AnnouncementUpdateBody = Extract<AnnouncementDraftBody, { expectedLockVersion: number }>;

export class OfficialAnnouncementController {
  public constructor(private readonly service: OfficialAnnouncementService) {}

  public list = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.list(
            this.actor(response),
            request.query as unknown as ContentHistoryQuery
          )
        )
      );
  });

  public createDraft = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createDraft(
            this.actor(response),
            getRequestContext(request),
            request.body as AnnouncementCreateBody
          )
        )
      );
  });

  public history = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.history(
            this.actor(response),
            request.params.publicId,
            request.query as unknown as ContentHistoryQuery
          )
        )
      );
  });

  public getRelease = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getRelease(
            this.actor(response),
            request.params.publicId,
            Number(request.params.releaseId)
          )
        )
      );
  });

  public updateLocale = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateLocale(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            Number(request.params.releaseId),
            request.body as AnnouncementUpdateBody
          )
        )
      );
  });

  public preview = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.preview(
            this.actor(response),
            request.params.publicId,
            Number(request.params.releaseId)
          )
        )
      );
  });

  public publish = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.publish(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            Number(request.params.releaseId),
            request.body as PublishBody
          )
        )
      );
  });

  public schedule = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.schedule(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            Number(request.params.releaseId),
            request.body as ScheduleBody
          )
        )
      );
  });

  public disable = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.disable(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            Number(request.params.releaseId),
            request.body as DisableBody
          )
        )
      );
  });

  public rollback = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.rollback(
            this.actor(response),
            getRequestContext(request),
            request.params.publicId,
            Number(request.params.releaseId),
            request.body as RollbackBody
          )
        )
      );
  });

  public getPublished = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getPublishedForAffiliate(
            this.actor(response),
            request.params.publicId,
            request.query.locale as ContentLocaleCode
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
