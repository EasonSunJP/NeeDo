import type { NextFunction, Request, Response } from "express";
import type { AffiliateMarketplaceService } from "../services/affiliate-marketplace.service";
import type { AffiliateCheckoutService } from "../services/affiliate-checkout.service";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import { successResponse } from "../utils/api-response";
import {
  affiliateClaimListQuerySchema,
  affiliateCodeValidateBodySchema,
  affiliateMarketplaceClaimIdParamSchema,
  affiliateMarketplaceListQuerySchema,
  affiliateMarketplaceTaskIdParamSchema,
  affiliatePublicTokenParamSchema
} from "../validators/affiliate-marketplace.validator";

export class AffiliateMarketplaceController {
  public constructor(
    private readonly service: AffiliateMarketplaceService,
    private readonly checkoutService: Pick<AffiliateCheckoutService, "validateCode">
  ) {}

  public listTasks = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.listTasks(
          this.actor(response),
          affiliateMarketplaceListQuerySchema.parse(request.query)
        )
      )
    );
  });

  public getTask = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.getTask(
          this.actor(response),
          affiliateMarketplaceTaskIdParamSchema.parse(request.params).taskId
        )
      )
    );
  });

  public claimTask = this.handle(async (request, response) => {
    const result = await this.service.claimTask(
      this.actor(response),
      affiliateMarketplaceTaskIdParamSchema.parse(request.params).taskId
    );
    response.status(result.created ? 201 : 200).json(successResponse(result.claim));
  });

  public listMyClaims = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.listMyClaims(
          this.actor(response),
          affiliateClaimListQuerySchema.parse(request.query)
        )
      )
    );
  });

  public getMyClaim = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.getMyClaim(
          this.actor(response),
          affiliateMarketplaceClaimIdParamSchema.parse(request.params).claimId
        )
      )
    );
  });

  public resolveLink = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.resolveLink(
          affiliatePublicTokenParamSchema.parse(request.params).publicToken
        )
      )
    );
  });

  public validateCode = this.handle(async (request, response) => {
    const body = affiliateCodeValidateBodySchema.parse(request.body);
    response.status(200).json(
      successResponse(
        await this.checkoutService.validateCode({
          customerUserId: this.actor(response).userId,
          publicCode: body.publicCode,
          scheduleSlotId: body.scheduleSlotId
        })
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
