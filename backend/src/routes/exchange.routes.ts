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
import { ExchangeClaimRepository } from "../repositories/exchange-claim.repository";
import { TechnicianAutomationRepository } from "../repositories/technician-automation.repository";
import { ExchangeRequestFeeRepository } from "../repositories/exchange-request-fee.repository";
import { LedgerRepository } from "../repositories/ledger.repository";
import { ExchangeRequestFeeService } from "../services/exchange-request-fee.service";
import { ExchangeService } from "../services/exchange.service";
import { ExchangeClaimService } from "../services/exchange-claim.service";
import { TechnicianAutomationProcessor } from "../services/technician-automation-processor";
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

const requireIntelligenceServiceRef: RequestHandler = (request, _response, next) => {
  if (
    request.body?.type === "intelligence" &&
    (typeof request.body.serviceRef !== "string" || request.body.serviceRef.trim().length === 0)
  ) {
    next(
      new AppError({
        code: ERROR_CODES.EXCHANGE_INTELLIGENCE_SERVICE_REQUIRED,
        message: "error.exchange.intelligence_service_required",
        statusCode: 422
      })
    );
    return;
  }
  next();
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
      dependencies.userPolicyEnforcementService,
        dependencies.platformMembershipResolverService
      );
  const actorRepository = new ExchangePostRepository();
  const claimService =
    dependencies.exchangeClaimService ??
    new ExchangeClaimService(new ExchangeClaimRepository(), actorRepository);
  const automationProcessor =
    dependencies.technicianAutomationProcessor ??
    (dependencies.exchangeService ? undefined : new TechnicianAutomationProcessor(
      new TechnicianAutomationRepository(),
      {
        confirmBooking: async () => {
          throw new Error("booking automation authority is unavailable on exchange routes");
        }
      },
      {
        applyRequest: async (input) => {
          await claimService.createClaim(
            {
              userId: input.technicianUserId,
              email: "",
              accessTokenJti: "technician-automation",
              accessTokenExpiresAt: 0,
              currentIdentityId: input.technicianIdentityId,
              currentPublicId: input.technicianPublicId,
              currentIdentityType: "technician",
              currentIdentityScopeType: "technician_profile",
              currentIdentityScopeId: input.technicianProfileId,
              roles: ["technician"],
              permissions: [EXCHANGE_PERMISSIONS.claimCreate]
            },
            input.postId,
            {
              scheduleSlotId: input.scheduleSlotId,
              quoteAmountJpy: input.quoteAmountJpy,
              message: input.message
            },
            input.idempotencyKey,
            { ip: "127.0.0.1", userAgent: "technician-automation" },
            { suppressQuickMatching: true }
          );
        }
      }
    ));
  const controller = new ExchangeController(service, automationProcessor);

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
    requireIntelligenceServiceRef,
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
