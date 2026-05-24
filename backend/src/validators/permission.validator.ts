import { z } from "zod";

export const permissionTypeSchema = z.enum(["api", "menu", "page", "button"]);

export const permissionIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const permissionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  keyword: z.string().trim().max(100).optional(),
  module: z.string().trim().max(100).optional(),
  type: permissionTypeSchema.optional()
});

const permissionCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(/^[a-z][a-z0-9:-]*$/);

export const permissionCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: permissionCodeSchema,
  type: permissionTypeSchema,
  module: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional()
});

export const permissionUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    code: permissionCodeSchema.optional(),
    type: permissionTypeSchema.optional(),
    module: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type PermissionIdParams = z.infer<typeof permissionIdParamSchema>;
export type PermissionListQuery = z.infer<typeof permissionListQuerySchema>;
export type PermissionCreateBody = z.infer<typeof permissionCreateBodySchema>;
export type PermissionUpdateBody = z.infer<typeof permissionUpdateBodySchema>;
