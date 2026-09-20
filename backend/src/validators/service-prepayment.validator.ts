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
  "bank_transfer",
  "cash",
  "ndp",
  "other"
]);

export type ServicePrepaymentSubject = z.infer<typeof servicePrepaymentSubjectSchema>;
export type ServicePrepaymentMethod = z.infer<typeof servicePrepaymentMethodSchema>;
