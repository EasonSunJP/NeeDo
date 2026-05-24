import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((email) => email.toLowerCase());

const phoneSchema = z.string().trim().min(5).max(32).nullable();

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  keyword: z.string().trim().max(100).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
});

export const userCreateBodySchema = z.object({
  email: emailSchema,
  phone: phoneSchema.optional(),
  username: z.string().trim().min(1).max(100),
  avatarUrl: z.string().trim().url().max(500).nullable().optional(),
  password: z.string().min(8).max(128),
  isActive: z.boolean().optional()
});

export const userUpdateBodySchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    username: z.string().trim().min(1).max(100).optional(),
    avatarUrl: z.string().trim().url().max(500).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const userAssignRolesBodySchema = z.object({
  roles: z
    .array(
      z.object({
        roleId: z.number().int().positive(),
        scopeType: z.string().trim().min(1).max(50).nullable().optional(),
        scopeId: z.number().int().positive().nullable().optional()
      })
    )
    .min(1)
    .max(50)
});

export type UserIdParams = z.infer<typeof userIdParamSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserCreateBody = z.infer<typeof userCreateBodySchema>;
export type UserUpdateBody = z.infer<typeof userUpdateBodySchema>;
export type UserAssignRolesBody = z.infer<typeof userAssignRolesBodySchema>;
