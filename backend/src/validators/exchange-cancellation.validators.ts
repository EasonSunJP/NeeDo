import { z } from "zod";
import {
  EXCHANGE_CANCELLATION_MAX_EXPECTED_VERSION,
  EXCHANGE_CANCELLATION_MAX_REQUEST_VERSION
} from "../domain/exchange-cancellation";

const expectedVersion = z.number().int().min(0).max(EXCHANGE_CANCELLATION_MAX_EXPECTED_VERSION);

export const exchangeCancellationOrderIdParamSchema = z
  .object({ id: z.coerce.number().int().positive().max(2_147_483_647) })
  .strict();

export const exchangeCancellationRequestBodySchema = z
  .object({
    expectedVersion: expectedVersion.max(EXCHANGE_CANCELLATION_MAX_REQUEST_VERSION),
    reason: z.string().trim().min(1).max(500)
  })
  .strict();

export const exchangeCancellationDecisionBodySchema = z
  .object({ expectedVersion: expectedVersion.min(1) })
  .strict();

export const exchangeCancellationPayloadSchema = z
  .object({
    orderId: z.number().int().positive(),
    orderStatus: z.enum([
      "pending",
      "confirmed",
      "in_service",
      "awaiting_checkout",
      "awaiting_payment_confirmation",
      "completed",
      "cancelled"
    ]),
    viewerParty: z.enum(["customer", "provider"]),
    allowedActions: z.array(z.enum(["request", "accept", "reject", "withdraw"])),
    cancellation: z
      .object({
        id: z.number().int().positive(),
        status: z.enum(["pending", "accepted", "rejected", "withdrawn"]),
        reason: z.string(),
        initiatorParty: z.enum(["customer", "provider"]),
        version: z.number().int().positive(),
        requestedAt: z.string().datetime(),
        resolvedAt: z.string().datetime().nullable()
      })
      .strict()
      .nullable()
  })
  .strict();

export type ExchangeCancellationRequestBody = z.infer<typeof exchangeCancellationRequestBodySchema>;
export type ExchangeCancellationDecisionBody = z.infer<
  typeof exchangeCancellationDecisionBodySchema
>;
