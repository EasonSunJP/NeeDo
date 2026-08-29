import type { NextFunction, Request, Response } from "express";
import type { ExchangeService } from "../services/exchange.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  createExchangeCommentSchema,
  exchangeCommentListQuerySchema,
  exchangeListQuerySchema,
  exchangePostIdParamSchema,
  publishExchangePostSchema
} from "../validators/exchange.validators";

export class ExchangeController {
  public constructor(private readonly service: ExchangeService) {}

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
    response
      .status(201)
      .json(
        successResponse(
          await this.service.publish(
            getAuthenticatedAccess(response),
            publishExchangePostSchema.parse(request.body),
            this.idempotencyKey(response)
          )
        )
      );
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
