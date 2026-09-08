import { z } from "zod";
import { PRISMA_INT_MAX } from "../constants/database";
const id = z.coerce.number().int().positive().max(PRISMA_INT_MAX);
export const sosOrderParams = z.object({ orderId: id });
export const sosAlertParams = z.object({ alertId: id });
export const sosSendBody = z
  .object({
    idempotencyKey: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9:_-]+$/)
  })
  .strict();
export const sosResolveBody = z.object({}).strict();
export const sosListQuery = z
  .object({
    status: z.enum(["pending", "resolved"]).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();
