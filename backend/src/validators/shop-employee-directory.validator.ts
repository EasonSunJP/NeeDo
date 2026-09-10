import { z } from "zod";

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
