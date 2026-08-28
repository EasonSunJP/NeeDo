import type { NextFunction, Request, Response } from "express";
import type { ContentLocaleCode } from "../constants/content-locales";
import type {
  CarouselPublicationService,
  CarouselSceneCode
} from "../services/carousel-publication.service";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import { successResponse } from "../utils/api-response";
import { getRequestContext } from "../utils/request-context";
import type {
  CarouselCopyAllBody,
  CarouselLocaleUpdateBody,
  CarouselLocaleMutationBody,
  CarouselTargetSearchQuery,
  ContentHistoryQuery,
  DisableBody,
  PublishBody,
  RollbackBody,
  ScheduleBody
} from "../validators/content-publication.validator";

export class CarouselPublicationController {
  public constructor(
    private readonly service: CarouselPublicationService,
    private readonly scene: CarouselSceneCode
  ) {}

  public getScene = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(
        successResponse(await this.service.getBackofficeScene(this.scene, this.actor(response)))
      );
  });

  public createDraft = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createDraft(
            this.scene,
            this.actor(response),
            getRequestContext(request),
            request.body
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
            this.scene,
            this.actor(response),
            request.query as unknown as ContentHistoryQuery
          )
        )
      );
  });

  public searchTargets = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.searchTargets(
            this.scene,
            this.actor(response),
            request.query as unknown as CarouselTargetSearchQuery
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
            this.scene,
            this.actor(response),
            Number(request.params.releaseId)
          )
        )
      );
  });

  public replaceDraft = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.replaceDraft(
            this.scene,
            this.actor(response),
            getRequestContext(request),
            Number(request.params.releaseId),
            request.body
          )
        )
      );
  });

  public updateLocale = this.handle(async (request, response) => {
    const input = request.body as CarouselLocaleMutationBody;
    response.status(200).json(
      successResponse(
        "operation" in input
          ? await this.service.copyLocaleToAll(
              this.scene,
              this.actor(response),
              getRequestContext(request),
              Number(request.params.releaseId),
              request.params.slidePublicId,
              {
                expectedLockVersion: input.expectedLockVersion,
                sourceLocale: input.sourceLocale
              }
            )
          : await this.service.updateLocale(
              this.scene,
              this.actor(response),
              getRequestContext(request),
              Number(request.params.releaseId),
              request.params.slidePublicId,
              {
                ...(input as CarouselLocaleUpdateBody),
                locale: request.params.locale as ContentLocaleCode
              }
            )
      )
    );
  });

  public copyLocaleToAll = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.copyLocaleToAll(
            this.scene,
            this.actor(response),
            getRequestContext(request),
            Number(request.params.releaseId),
            request.params.slidePublicId,
            request.body as CarouselCopyAllBody
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
            this.scene,
            this.actor(response),
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
            this.scene,
            this.actor(response),
            getRequestContext(request),
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
            this.scene,
            this.actor(response),
            getRequestContext(request),
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
            this.scene,
            this.actor(response),
            getRequestContext(request),
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
            this.scene,
            this.actor(response),
            getRequestContext(request),
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
          await this.service.getPublishedScene(
            this.scene,
            request.query.locale as ContentLocaleCode,
            this.actor(response)
          )
        )
      );
  });

  private actor(response: Response): AuthenticatedAccessContext {
    return response.locals.auth as AuthenticatedAccessContext;
  }

  private handle(handler: (request: Request, response: Response) => Promise<void>) {
    return async (request: Request, response: Response, next: NextFunction) => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
