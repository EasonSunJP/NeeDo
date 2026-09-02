import { z } from "zod";
import { MAX_ANALYTICS_RANKING_PAGE } from "../domain/analytics-ranking";
import { dashboardQueryBaseSchema, refineDashboardQuery } from "./backoffice.validator";

const canonicalPositiveInteger = (maximum: number) => z.union([
  z.number().int().safe().positive(),
  z.string().regex(/^[1-9]\d*$/u).transform(Number).pipe(z.number().int().safe().positive())
]).pipe(z.number().max(maximum));

export const analyticsRankingParamsSchema = z.object({
  kind: z.enum(["service", "technician", "customer"])
}).strict();

export const analyticsRankingQuerySchema = dashboardQueryBaseSchema.extend({
  metric: z.enum(["gmv", "completedCount"]).default("gmv"),
  categoryId: canonicalPositiveInteger(2_147_483_647).optional(),
  page: canonicalPositiveInteger(MAX_ANALYTICS_RANKING_PAGE).default(1),
  pageSize: canonicalPositiveInteger(10).default(10)
}).strict().superRefine(refineDashboardQuery);

export type AnalyticsRankingParams = z.infer<typeof analyticsRankingParamsSchema>;
export type AnalyticsRankingQuery = z.infer<typeof analyticsRankingQuerySchema>;
