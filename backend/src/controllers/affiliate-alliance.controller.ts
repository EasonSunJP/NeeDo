import type { NextFunction, Request, Response } from "express";
import type { AffiliateAllianceService } from "../services/affiliate-alliance.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  affiliateAllianceCreateBodySchema,
  affiliateAllianceInvitationCreateBodySchema,
  affiliateAllianceInvitationIdParamSchema,
  affiliateAllianceInvitationListQuerySchema,
  affiliateAllianceListQuerySchema
} from "../validators/affiliate-alliance.validator";

export class AffiliateAllianceController {
  public constructor(private readonly service: AffiliateAllianceService) {}

  public getMine = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(successResponse(await this.service.getMine(getAuthenticatedAccess(response))));
  });

  public createMine = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createMine(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            affiliateAllianceCreateBodySchema.parse(request.body)
          )
        )
      );
  });

  public listMembers = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listMembers(
            getAuthenticatedAccess(response),
            affiliateAllianceListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public listEligibleContacts = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listEligibleContacts(
            getAuthenticatedAccess(response),
            affiliateAllianceListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public listSentInvitations = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listSentInvitations(
            getAuthenticatedAccess(response),
            affiliateAllianceInvitationListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public createInvitation = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createInvitation(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            affiliateAllianceInvitationCreateBodySchema.parse(request.body)
          )
        )
      );
  });

  public listReceivedInvitations = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listReceivedInvitations(
            getAuthenticatedAccess(response),
            affiliateAllianceInvitationListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public acceptInvitation = this.handle(async (request, response) => {
    const { id } = affiliateAllianceInvitationIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.acceptInvitation(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            id
          )
        )
      );
  });

  public rejectInvitation = this.handle(async (request, response) => {
    const { id } = affiliateAllianceInvitationIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.rejectInvitation(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            id
          )
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
