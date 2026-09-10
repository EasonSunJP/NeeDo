import { z } from "zod";

const evidence = (max: number) => z.string().trim().min(1).max(max).nullable();

export const shopMembershipCardTopUpPublicIdParamSchema = z
  .object({
    publicId: z.string().trim().uuid()
  })
  .strict();

export const shopMembershipCardTopUpCreateBodySchema = z
  .object({
    amountJpy: z.number().int().min(1).max(10_000_000),
    paymentMethod: z.enum(["cash", "card", "paypay", "bank_transfer", "other"]),
    paymentReference: evidence(160),
    note: evidence(500),
    idempotencyKey: z.string().trim().min(8).max(160)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.paymentReference === null && value.note === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "payment reference or note is required",
        path: ["paymentReference"]
      });
    }
  });

export const shopMembershipCardTopUpListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    cardPublicId: z.string().trim().uuid().optional()
  })
  .strict();

export type ShopMembershipCardTopUpCreateBody = z.output<
  typeof shopMembershipCardTopUpCreateBodySchema
>;
export type ShopMembershipCardTopUpListQuery = z.output<
  typeof shopMembershipCardTopUpListQuerySchema
>;
