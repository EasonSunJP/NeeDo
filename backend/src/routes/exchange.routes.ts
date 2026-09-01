import { Router, type RequestHandler } from "express";
import { ZodError } from "zod";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { EXCHANGE_PERMISSIONS } from "../constants/permissions.constants";
import { ExchangeController } from "../controllers/exchange.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ExchangePostRepository } from "../repositories/exchange.repository";
import { ExchangeRequestFeeRepository } from "../repositories/exchange-request-fee.repository";
import { LedgerRepository } from "../repositories/ledger.repository";
import { ExchangeRequestFeeService } from "../services/exchange-request-fee.service";
import { ExchangeService } from "../services/exchange.service";
import { LedgerService } from "../services/ledger.service";
import { AppError } from "../utils/app-error";
import {
  createExchangeCommentSchema,
  exchangeCommentListQuerySchema,
  exchangeIdempotencyKeySchema,
  exchangeListQuerySchema,
  exchangePostIdParamSchema,
  publishExchangePostSchema
} from "../validators/exchange.validators";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const validateIdempotencyKey: RequestHandler = (request, response, next) => {
  try {
    response.locals.exchangeIdempotencyKey = exchangeIdempotencyKeySchema.parse(
      request.get("Idempotency-Key")
    );
    next();
  } catch (error) {
    next(
      error instanceof ZodError
        ? new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.validation",
            statusCode: 400,
            cause: error
          })
        : error
    );
  }
};

const authorizePublish: RequestHandler = (request, response, next) => {
  const permission =
    request.body.type === "demand"
      ? EXCHANGE_PERMISSIONS.createDemand
      : EXCHANGE_PERMISSIONS.createIntelligence;
  createAuthorizeMiddleware(permission)(request, response, next);
};

export const createExchangeRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.exchangeService ??
    new ExchangeService(
      new ExchangePostRepository(),
      undefined,
      dependencies.personalIdentityScopeService,
      dependencies.exchangeRequestFeeService ??
        new ExchangeRequestFeeService(new ExchangeRequestFeeRepository()),
      dependencies.ledgerService ??
        new LedgerService(dependencies.ledgerRepository ?? new LedgerRepository()),
      dependencies.userPolicyEnforcementService
    );
  const controller = new ExchangeController(service);

  router.get(
    "/exchange/posts",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.postList),
    validateRequest({ query: exchangeListQuerySchema }),
    controller.listPosts
  );
  router.get(
    "/exchange/request-publication-context",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.createDemand),
    controller.getRequestPublicationContext
  );
  router.get(
    "/exchange/posts/:id",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.postDetail),
    validateRequest({ params: exchangePostIdParamSchema }),
    controller.getPost
  );
  router.post(
    "/exchange/posts",
    authenticate(),
    validateRequest({ body: publishExchangePostSchema }),
    authorizePublish,
    validateIdempotencyKey,
    controller.publish
  );
  router.post(
    "/exchange/posts/:id/withdraw",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.withdrawOwn),
    validateRequest({ params: exchangePostIdParamSchema }),
    validateIdempotencyKey,
    controller.withdraw
  );
  router.get(
    "/exchange/posts/:id/comments",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.commentList),
    validateRequest({ params: exchangePostIdParamSchema, query: exchangeCommentListQuerySchema }),
    controller.listComments
  );
  router.post(
    "/exchange/posts/:id/comments",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.commentCreate),
    validateRequest({ params: exchangePostIdParamSchema, body: createExchangeCommentSchema }),
    validateIdempotencyKey,
    controller.comment
  );
  router.put(
    "/exchange/posts/:id/like",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.likeWrite),
    validateRequest({ params: exchangePostIdParamSchema }),
    validateIdempotencyKey,
    controller.like
  );
  router.delete(
    "/exchange/posts/:id/like",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.likeWrite),
    validateRequest({ params: exchangePostIdParamSchema }),
    validateIdempotencyKey,
    controller.unlike
  );
  router.post(
    "/exchange/posts/:id/shares",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.shareCreate),
    validateRequest({ params: exchangePostIdParamSchema }),
    validateIdempotencyKey,
    controller.share
  );

  return router;
};
