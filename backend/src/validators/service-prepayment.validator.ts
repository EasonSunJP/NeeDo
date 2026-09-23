import { z } from "zod";

export const servicePrepaymentPercentSchema = z.union([
  z.literal(0),
  z.number().int().min(10).max(100)
]);

export const servicePrepaymentSubjectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("booking"), id: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("exchange"), id: z.number().int().positive() }).strict()
]);

export const servicePrepaymentMethodSchema = z.enum([
  "onsite",
  "cash",
  "ndp",
  "other"
]);

export const servicePrepaymentCreateBodySchema = z.object({
  percent: z.number().int().min(10).max(100)
}).strict();

export const servicePrepaymentSubjectParamsSchema = z.object({
  id: z.coerce.number().int().positive()
}).strict();

export const servicePrepaymentIdempotencyKeySchema = z.string().trim().min(8).max(191).regex(/^[A-Za-z0-9:_-]+$/);

export type ServicePrepaymentSubject = z.infer<typeof servicePrepaymentSubjectSchema>;
export type ServicePrepaymentMethod = z.infer<typeof servicePrepaymentMethodSchema>;
export type ServicePrepaymentCreateBody = z.infer<typeof servicePrepaymentCreateBodySchema>;
