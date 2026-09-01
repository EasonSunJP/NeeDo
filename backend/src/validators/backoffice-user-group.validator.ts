import { z } from "zod";

export const backofficeUserGroupListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export const backofficeUserGroupParamSchema = z.object({
  groupCode: z
    .string()
    .min(1)
    .max(80)
    .regex(/^(?:system:(?:free|silver|gold|black_diamond|operations)|custom:[A-Za-z0-9-]+)$/)
});

export const backofficeUserGroupCreateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable().optional()
  })
  .strict();

export const backofficeUserGroupUpdateBodySchema = backofficeUserGroupCreateBodySchema;

export const backofficeUserGroupArchiveBodySchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const backofficeUserGroupMembersBodySchema = z
  .object({
    userIds: z.array(z.string().trim().min(2).max(32)).max(500),
    reason: z.string().trim().min(1).max(500)
  })
  .strict();
