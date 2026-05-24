import { z } from "zod";

export const roleIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const roleListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  keyword: z.string().trim().max(100).optional()
});

const roleCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z][a-z0-9_:-]*$/);

export const roleCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: roleCodeSchema,
  description: z.string().trim().max(500).nullable().optional()
});

export const roleUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    code: roleCodeSchema.optional(),
    description: z.string().trim().max(500).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const roleAssignPermissionsBodySchema = z.object({
  permissionIds: z.array(z.number().int().positive()).max(500)
});

export type RoleIdParams = z.infer<typeof roleIdParamSchema>;
export type RoleListQuery = z.infer<typeof roleListQuerySchema>;
export type RoleCreateBody = z.infer<typeof roleCreateBodySchema>;
export type RoleUpdateBody = z.infer<typeof roleUpdateBodySchema>;
export type RoleAssignPermissionsBody = z.infer<typeof roleAssignPermissionsBodySchema>;
