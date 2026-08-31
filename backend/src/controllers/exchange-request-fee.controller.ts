import type { NextFunction, Request, Response } from "express";
import type {
  ExchangeRequestFeeService,
  ExchangeRequestFeeSnapshot
} from "../services/exchange-request-fee.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  type CreateExchangeRequestFeeVersionBody,
  exchangeRequestFeeHistoryQuerySchema
} from "../validators/exchange-request-fee.validator";

const publicFee = (fee: ExchangeRequestFeeSnapshot) => ({
  amountNdp: fee.amountNdp,
  ruleSetVersion: fee.ruleSetVersion,
  effectiveFrom: fee.effectiveFrom?.toISOString() ?? null,
  effectiveTo: fee.effectiveTo?.toISOString() ?? null
});

export class ExchangeRequestFeeController {
  public constructor(private readonly service: ExchangeRequestFeeService) {}

  public getCurrent = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(successResponse(publicFee(await this.service.resolveCurrent(new Date()))));
  });

  public listVersions = this.handle(async (request, response) => {
    const query = exchangeRequestFeeHistoryQuerySchema.parse(request.query);
    const page = await this.service.listVersions({ page: query.page, pageSize: query.page_size });
    response.status(200).json(
      successResponse({
        ...page,
        list: page.list.map(publicFee)
      })
    );
  });

  public createVersion = this.handle(async (request, response) => {
    const body = request.body as CreateExchangeRequestFeeVersionBody;
    const access = getAuthenticatedAccess(response);
    const context = getRequestContext(request);
    response.status(201).json(
      successResponse(
        publicFee(
          await this.service.createVersion({
            ...body,
            actorUserId: access.userId,
            audit: {
              actorId: access.userId,
              action: "exchange.request_fee.version.create",
              targetType: "platform_fee_rule_set",
              ip: context.ip,
              userAgent: context.userAgent,
              metadata: {
                amountNdp: body.amountNdp,
                expectedCurrentVersion: body.expectedCurrentVersion,
                effectiveFrom: body.effectiveFrom.toISOString()
              }
            }
          })
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
