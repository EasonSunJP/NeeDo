import type { NextFunction, Request, Response } from "express";
import type { OrderRefundCaseService } from "../services/order-refund-case.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  orderRefundCaseApproveBodySchema,
  orderRefundCaseComplaintBodySchema,
  orderRefundCaseDisputeParamSchema,
  orderRefundCaseDisputeResolutionBodySchema,
  orderRefundCaseEvidenceBodySchema,
  orderRefundCaseIdParamSchema,
  orderRefundCaseListQuerySchema,
  orderRefundCaseOrderIdParamSchema,
  orderRefundCaseReceiptConfirmationBodySchema,
  orderRefundCaseRejectBodySchema,
  orderRefundCaseRequestBodySchema
} from "../validators/order-refund-case.validator";

const orderRefundCaseCommandParamSchema = orderRefundCaseOrderIdParamSchema
  .extend({ caseId: orderRefundCaseIdParamSchema.shape.caseId })
  .strict();

export class OrderRefundCaseController {
  public constructor(private readonly service: OrderRefundCaseService) {}

  public request = this.handle(async (request, response) => {
    const { orderId } = orderRefundCaseOrderIdParamSchema.parse(request.params);
    const result = await this.service.request(getAuthenticatedAccess(response), getRequestContext(request), {
      orderId,
      ...orderRefundCaseRequestBodySchema.parse(request.body)
    });
    response.status(result.kind === "replayed" ? 200 : 201).json(successResponse(result.value));
  });

  public confirmReceipt = this.caseCommand(async (request, response, orderId, caseId) =>
    this.service.confirmCustomerReceipt(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      orderId,
      caseId,
      orderRefundCaseReceiptConfirmationBodySchema.parse(request.body)
    )
  );

  public customerComplaint = this.caseCommand(async (request, response, orderId, caseId) =>
    this.service.openComplaint(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      orderId,
      caseId,
      orderRefundCaseComplaintBodySchema.parse(request.body)
    )
  );

  public merchantApprove = this.caseCommand(async (request, response, orderId, caseId) =>
    this.service.merchantApprove(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      orderId,
      caseId,
      orderRefundCaseApproveBodySchema.parse(request.body)
    )
  );

  public merchantReject = this.caseCommand(async (request, response, orderId, caseId) =>
    this.service.merchantReject(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      orderId,
      caseId,
      orderRefundCaseRejectBodySchema.parse(request.body)
    )
  );

  public submitEvidence = this.caseCommand(async (request, response, orderId, caseId) =>
    this.service.submitEvidence(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      orderId,
      caseId,
      orderRefundCaseEvidenceBodySchema.parse(request.body)
    )
  );

  public merchantComplaint = this.caseCommand(async (request, response, orderId, caseId) =>
    this.service.openComplaint(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      orderId,
      caseId,
      orderRefundCaseComplaintBodySchema.parse(request.body)
    )
  );

  public listDisputes = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.listDisputes(
          getAuthenticatedAccess(response),
          orderRefundCaseListQuerySchema.parse(request.query)
        )
      )
    );
  });

  public resolveDispute = this.handle(async (request, response) => {
    const { disputeId } = orderRefundCaseDisputeParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.resolveDispute(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          disputeId,
          orderRefundCaseDisputeResolutionBodySchema.parse(request.body)
        )
      )
    );
  });

  private caseCommand(
    command: (
      request: Request,
      response: Response,
      orderId: number,
      caseId: string
    ) => Promise<unknown>
  ) {
    return this.handle(async (request, response) => {
      const { orderId, caseId } = orderRefundCaseCommandParamSchema.parse(request.params);
      response.status(200).json(successResponse(await command(request, response, orderId, caseId)));
    });
  }

  private handle(handler: (request: Request, response: Response) => Promise<void>) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
