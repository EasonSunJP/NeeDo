import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { ContentMediaMimeType } from "../services/content-media.storage";
import type { ExchangeService } from "../services/exchange.service";
import type { TechnicianAutomationProcessor } from "../services/technician-automation-processor";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  createExchangeCommentSchema,
  exchangeDemandCoverQuerySchema,
  exchangeCommentListQuerySchema,
  exchangeListQuerySchema,
  exchangePostIdParamSchema,
  publishExchangePostSchema
} from "../validators/exchange.validators";

export class ExchangeController {
  public constructor(
    private readonly service: ExchangeService,
    private readonly automationProcessor?: Pick<TechnicianAutomationProcessor, "processRequest">
  ) {}

  public uploadDemandCover = this.handle(async (request, response) => {
    const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
    if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp") {
      throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.exchange.demand_cover_invalid", statusCode: 415 });
    }
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.exchange.demand_cover_invalid", statusCode: 400 });
    }
    const query = exchangeDemandCoverQuerySchema.parse(request.query);
    response.status(201).json(successResponse(await this.service.uploadDemandCover(
      getAuthenticatedAccess(response), getRequestContext(request), {
        bytes: request.body,
        mimeType: mimeType as ContentMediaMimeType,
        altText: query.alt_text ?? null
      }
    )));
  });

  public getRequestPublicationContext = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getRequestPublicationContext(getAuthenticatedAccess(response))
        )
      );
  });

  public listPosts = this.handle(async (request, response) => {
    const query = exchangeListQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.service.listPosts(getAuthenticatedAccess(response), {
          type: query.type,
          page: query.page,
          pageSize: query.page_size
        })
      )
    );
  });

  public getPost = this.handle(async (request, response) => {
    const { id } = exchangePostIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(successResponse(await this.service.getPost(getAuthenticatedAccess(response), id)));
  });

  public publish = this.handle(async (request, response) => {
    const input = publishExchangePostSchema.parse(request.body);
    const created = await this.service.publish(
      getAuthenticatedAccess(response),
      input,
      this.idempotencyKey(response)
    );
    if (input.type === "demand") {
      await this.automationProcessor?.processRequest(created.id).catch(() => undefined);
    }
    response.status(201).json(successResponse(created));
  });

  public withdraw = this.handle(async (request, response) => {
    const { id } = exchangePostIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.withdraw(
            getAuthenticatedAccess(response),
            id,
            this.idempotencyKey(response)
          )
        )
      );
  });

  public listComments = this.handle(async (request, response) => {
    const { id } = exchangePostIdParamSchema.parse(request.params);
    const query = exchangeCommentListQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.service.listComments(getAuthenticatedAccess(response), id, {
          page: query.page,
          pageSize: query.page_size
        })
      )
    );
  });

  public comment = this.handle(async (request, response) => {
    const { id } = exchangePostIdParamSchema.parse(request.params);
    response
      .status(201)
      .json(
        successResponse(
          await this.service.comment(
            getAuthenticatedAccess(response),
            id,
            createExchangeCommentSchema.parse(request.body),
            this.idempotencyKey(response)
          )
        )
      );
  });

  public like = this.handle(async (request, response) => {
    const { id } = exchangePostIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.like(
            getAuthenticatedAccess(response),
            id,
            this.idempotencyKey(response)
          )
        )
      );
  });

  public unlike = this.handle(async (request, response) => {
    const { id } = exchangePostIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.unlike(
            getAuthenticatedAccess(response),
            id,
            this.idempotencyKey(response)
          )
        )
      );
  });

  public share = this.handle(async (request, response) => {
    const { id } = exchangePostIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.share(
            getAuthenticatedAccess(response),
            id,
            this.idempotencyKey(response)
          )
        )
      );
  });

  private idempotencyKey(response: Response): string {
    return response.locals.exchangeIdempotencyKey as string;
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
