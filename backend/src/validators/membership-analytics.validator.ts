import { z } from "zod";
import {
  dashboardQueryBaseSchema,
  refineDashboardQuery
} from "./backoffice.validator";
import { MAX_MEMBERSHIP_ANALYTICS_PAGE } from "../domain/membership-analytics";

const needoIdSchema = z.string().trim().regex(/^u\d{10}$/u);
const nicknameSchema = z.string().trim().min(1).max(100);
const paginationShape = {
  page: z.coerce.number().int().min(1).max(MAX_MEMBERSHIP_ANALYTICS_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
};

export const backofficeMembershipTrendQuerySchema =
  dashboardQueryBaseSchema.superRefine(refineDashboardQuery);

export const merchantMembershipTrendQuerySchema = dashboardQueryBaseSchema
  .omit({ city: true })
  .superRefine(refineDashboardQuery);

export const backofficeMembershipListQuerySchema = dashboardQueryBaseSchema
  .extend({
    needoId: needoIdSchema.optional(),
    nickname: nicknameSchema.optional(),
    ...paginationShape
  })
  .superRefine(refineDashboardQuery);

export const merchantMembershipListQuerySchema = dashboardQueryBaseSchema
  .omit({ city: true })
  .extend({
    needoId: needoIdSchema.optional(),
    nickname: nicknameSchema.optional(),
    ...paginationShape
  })
  .superRefine(refineDashboardQuery);

export type BackofficeMembershipTrendQuery = z.infer<
  typeof backofficeMembershipTrendQuerySchema
>;
export type MerchantMembershipTrendQuery = z.infer<
  typeof merchantMembershipTrendQuerySchema
>;
export type BackofficeMembershipListQuery = z.infer<
  typeof backofficeMembershipListQuerySchema
>;
export type MerchantMembershipListQuery = z.infer<typeof merchantMembershipListQuerySchema>;
