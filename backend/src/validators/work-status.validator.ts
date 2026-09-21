import { PRISMA_INT_MAX } from "../constants/database";
import { z } from "zod";
const key = z.string().trim().min(1).max(100);
export const workStatusIdSchema = z.object({
  id: z.coerce.number().int().positive().max(PRISMA_INT_MAX)
});
export const workStatusChangeSchema = z
  .object({
    status: z.enum(["on_duty", "traveling", "resting", "off_duty"]),
    expectedVersion: z.number().int().min(0).max(PRISMA_INT_MAX),
    idempotencyKey: key,
    reason: z.string().trim().min(1).max(1000).optional(),
    confirmEarlyLeave: z.boolean().optional(),
    orderId: z.number().int().positive().max(PRISMA_INT_MAX).optional(),
    shopId: z.number().int().positive().max(PRISMA_INT_MAX).optional()
  })
  .strict();
export const workStatusCommentSchema = z
  .object({ message: z.string().trim().min(1).max(1000), idempotencyKey: key })
  .strict();
export const workStatusShopSwitchSchema = z
  .object({
    shopId: z.number().int().positive().max(PRISMA_INT_MAX),
    idempotencyKey: key
  })
  .strict();
export const workStatusQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    incidentsOnly: z
      .preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean())
      .optional(),
    kind: z.enum(["late", "early_leave"]).optional()
  })
  .strict()
  .refine((q) => !q.from || !q.to || new Date(q.from) < new Date(q.to), {
    message: "Invalid time interval"
  });
export type WorkStatusChange = z.infer<typeof workStatusChangeSchema>;
export type WorkStatusShopSwitch = z.infer<typeof workStatusShopSwitchSchema>;
export type WorkStatusQuery = z.infer<typeof workStatusQuerySchema>;
