import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import type { TechnicianAutomationProcessor } from "../services/technician-automation-processor";
import type { ServicePrepaymentService } from "../services/service-prepayment.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  servicePrepaymentCreateBodySchema,
  servicePrepaymentIdempotencyKeySchema,
  servicePrepaymentSubjectParamsSchema
} from "../validators/service-prepayment.validator";

export class ServicePrepaymentController {
  public constructor(
    private readonly service: ServicePrepaymentService,
    private readonly automationProcessor?: Pick<TechnicianAutomationProcessor, "processBooking" | "processRequest">
  ) {}

  public createBooking = this.handle("booking");
  public createExchange = this.handle("exchange");

  private handle(subjectType: "booking" | "exchange") {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        const access = getAuthenticatedAccess(response);
        const { id } = servicePrepaymentSubjectParamsSchema.parse(request.params);
        const { percent } = servicePrepaymentCreateBodySchema.parse(request.body);
        const idempotencyKey = servicePrepaymentIdempotencyKeySchema.parse(request.get("Idempotency-Key"));
        const subject = { type: subjectType, id } as const;
        const requestFingerprint = createHash("sha256").update(JSON.stringify({
          subject,
          percent,
          actorIdentityId: access.currentIdentityId
        })).digest("hex");
        const result = await this.service.confirmForSubject({
          subject,
          actorUserId: access.userId,
          actorIdentityId: access.currentIdentityId!,
          percent,
          idempotencyKey,
          requestFingerprint
        });
        if (subjectType === "booking") {
          await this.automationProcessor?.processBooking(id).catch(() => undefined);
        } else {
          await this.automationProcessor?.processRequest(id).catch((error: unknown) => {
            logger.error({ error, exchangePostId: id }, "Request automation failed after prepayment confirmation");
          });
        }
        response.status(201).json(successResponse({
          subject: result.subject,
          baseAmountJpy: result.baseAmountJpy,
          percent: result.percent,
          amountJpy: result.amountJpy,
          confirmedAmountJpy: result.confirmedAmountJpy,
          paymentMethod: result.paymentMethod,
          status: result.status,
          confirmedAt: result.confirmedAt?.toISOString() ?? null
        }));
      } catch (error) {
        next(error);
      }
    };
  }
}
