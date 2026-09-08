import type { NextFunction, Request, Response } from "express";
import type { LegalDocumentService } from "../services/legal-document.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  legalDocumentCreateBodySchema,
  legalDocumentDraftBodySchema,
  legalDocumentListQuerySchema,
  legalDocumentLocaleParamSchema,
  legalDocumentMetadataBodySchema,
  legalDocumentPublicIdParamSchema,
  legalDocumentPublishBodySchema,
  publicLegalDocumentParamSchema,
  publicLegalDocumentQuerySchema
} from "../validators/legal-document.validator";

export type LegalDocumentControllerService = Pick<
  LegalDocumentService,
  | "list"
  | "create"
  | "updateMetadata"
  | "getLocale"
  | "saveDraft"
  | "publish"
  | "listReleases"
  | "getPublicCurrent"
>;

export class LegalDocumentController {
  public constructor(private readonly service: LegalDocumentControllerService) {}

  public list = this.handle(async (request, response) => {
    const query = legalDocumentListQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.service.list(getAuthenticatedAccess(response), {
          page: query.page,
          pageSize: query.page_size
        })
      )
    );
  });

  public create = this.handle(async (request, response) => {
    response.status(201).json(
      successResponse(
        await this.service.create(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          legalDocumentCreateBodySchema.parse(request.body)
        )
      )
    );
  });

  public updateMetadata = this.handle(async (request, response) => {
    const { publicId } = legalDocumentPublicIdParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.updateMetadata(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          publicId,
          legalDocumentMetadataBodySchema.parse(request.body)
        )
      )
    );
  });

  public getLocale = this.handle(async (request, response) => {
    const { publicId, locale } = legalDocumentLocaleParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(await this.service.getLocale(getAuthenticatedAccess(response), publicId, locale))
    );
  });

  public saveDraft = this.handle(async (request, response) => {
    const { publicId, locale } = legalDocumentLocaleParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.saveDraft(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          publicId,
          locale,
          legalDocumentDraftBodySchema.parse(request.body)
        )
      )
    );
  });

  public publish = this.handle(async (request, response) => {
    const { publicId, locale } = legalDocumentLocaleParamSchema.parse(request.params);
    response.status(201).json(
      successResponse(
        await this.service.publish(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          publicId,
          locale,
          legalDocumentPublishBodySchema.parse(request.body)
        )
      )
    );
  });

  public listReleases = this.handle(async (request, response) => {
    const { publicId, locale } = legalDocumentLocaleParamSchema.parse(request.params);
    const query = legalDocumentListQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.service.listReleases(
          getAuthenticatedAccess(response),
          publicId,
          locale,
          { page: query.page, pageSize: query.page_size }
        )
      )
    );
  });

  public getPublicCurrent = this.handle(async (request, response) => {
    const { slug } = publicLegalDocumentParamSchema.parse(request.params);
    const { locale } = publicLegalDocumentQuerySchema.parse(request.query);
    response.status(200).json(successResponse(await this.service.getPublicCurrent(slug, locale)));
  });

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
