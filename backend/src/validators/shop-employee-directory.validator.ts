import { z } from "zod";
import { strongPasswordSchema } from "./auth.validator";

export const shopEmployeeDirectoryQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    keyword: z.string().trim().max(100).optional(),
    status: z.enum(["active", "on_leave", "suspended"]).optional(),
    roleCode: z.string().trim().min(1).max(64).optional()
  })
  .strict();

export type ParsedShopEmployeeDirectoryQuery = z.output<typeof shopEmployeeDirectoryQuerySchema>;

export const shopEmployeeCreateBodySchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: strongPasswordSchema,
  roleCode: z.enum(["STAFF", "ACCOUNTANT", "DRIVER", "GENERAL_AFFAIRS", "CHEF"])
}).strict();

export const shopEmployeeShopParamSchema = z.object({ shopId: z.coerce.number().int().positive() });

export type ShopEmployeeCreateBody = z.output<typeof shopEmployeeCreateBodySchema>;
