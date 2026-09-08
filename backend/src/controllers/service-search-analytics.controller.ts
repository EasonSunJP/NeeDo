import type { NextFunction, Request, Response } from "express";
import type { ServiceSearchAnalyticsService } from "../services/service-search-analytics.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  aliasCreateBodySchema,
  aliasUpdateBodySchema,
  categoryCreateBodySchema,
  categoryUpdateBodySchema,
  keywordCreateBodySchema,
  keywordUpdateBodySchema,
  searchAnalyticsTopQuerySchema,
  searchAnalyticsTrendQuerySchema,
  taxonomyCategoryIdParamSchema,
  taxonomyIdParamSchema,
  taxonomyKeywordIdParamSchema,
  taxonomyListQuerySchema
} from "../validators/service-search-analytics.validator";

export class ServiceSearchAnalyticsController {
  public constructor(private readonly service: ServiceSearchAnalyticsService) {}

  public listCategories = this.handle(async (request, response) => {
    response.json(
      successResponse(
        await this.service.listCategories(
          getAuthenticatedAccess(response),
          taxonomyListQuerySchema.parse(request.query)
        )
      )
    );
  });

  public listKeywords = this.handle(async (request, response) => {
    const { categoryId } = taxonomyCategoryIdParamSchema.parse(request.params);
    response.json(
      successResponse(
        await this.service.listKeywords(
          getAuthenticatedAccess(response),
          categoryId,
          taxonomyListQuerySchema.parse(request.query)
        )
      )
    );
  });

  public listAliases = this.handle(async (request, response) => {
    const { keywordId } = taxonomyKeywordIdParamSchema.parse(request.params);
    response.json(
      successResponse(
        await this.service.listAliases(
          getAuthenticatedAccess(response),
          keywordId,
          taxonomyListQuerySchema.parse(request.query)
        )
      )
    );
  });

  public createCategory = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createCategory(
            getAuthenticatedAccess(response),
            categoryCreateBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
  });

  public updateCategory = this.handle(async (request, response) => {
    const { id } = taxonomyIdParamSchema.parse(request.params);
    response.json(
      successResponse(
        await this.service.updateCategory(
          getAuthenticatedAccess(response),
          id,
          categoryUpdateBodySchema.parse(request.body),
          getRequestContext(request)
        )
      )
    );
  });

  public createKeyword = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createKeyword(
            getAuthenticatedAccess(response),
            keywordCreateBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
  });

  public updateKeyword = this.handle(async (request, response) => {
    const { id } = taxonomyIdParamSchema.parse(request.params);
    response.json(
      successResponse(
        await this.service.updateKeyword(
          getAuthenticatedAccess(response),
          id,
          keywordUpdateBodySchema.parse(request.body),
          getRequestContext(request)
        )
      )
    );
  });

  public createAlias = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createAlias(
            getAuthenticatedAccess(response),
            aliasCreateBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
  });

  public updateAlias = this.handle(async (request, response) => {
    const { id } = taxonomyIdParamSchema.parse(request.params);
    response.json(
      successResponse(
        await this.service.updateAlias(
          getAuthenticatedAccess(response),
          id,
          aliasUpdateBodySchema.parse(request.body),
          getRequestContext(request)
        )
      )
    );
  });

  public topKeywords = this.handle(async (request, response) => {
    const query = searchAnalyticsTopQuerySchema.parse(request.query);
    response.json(
      successResponse(await this.service.topKeywords(getAuthenticatedAccess(response), query))
    );
  });

  public keywordTrend = this.handle(async (request, response) => {
    const { keywords, ...filter } = searchAnalyticsTrendQuerySchema.parse(request.query);
    response.json(
      successResponse(
        await this.service.keywordTrend(getAuthenticatedAccess(response), filter, keywords)
      )
    );
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
