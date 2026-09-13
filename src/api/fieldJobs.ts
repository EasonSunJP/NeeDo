import { z } from "zod";
import { httpClient } from "./httpClient";

export const fieldJobStatuses = [
  "pending",
  "confirmed",
  "inService",
  "awaitingCheckout",
  "awaitingPaymentConfirmation",
  "completed",
  "cancelled",
] as const;

const nullableDateTime = z.string().datetime().nullable();
const technicianSchema = z
  .object({
    assignment: z.enum(["assigned", "unassigned"]),
    profileId: z.number().int().positive().nullable(),
    needoId: z.string().nullable(),
    name: z.string().nullable(),
  })
  .strict();
const locationSchema = z
  .object({
    disclosure: z.enum(["region_only", "full"]),
    regionLabel: z.string(),
    lines: z.array(z.string()).nullable(),
  })
  .strict();
const credentialSchema = z
  .object({
    state: z.enum(["not_issued", "issued", "verified"]),
    verifiedAt: nullableDateTime,
  })
  .strict();
const evidenceSchema = z
  .object({
    startedAt: nullableDateTime,
    expectedEndsAt: nullableDateTime,
    endedAt: nullableDateTime,
    receiptConfirmedAt: nullableDateTime,
    paymentStatus: z.enum([
      "pending",
      "confirmed",
      "refundPending",
      "refunded",
    ]),
  })
  .strict();
const exceptionsSchema = z
  .object({
    activeSosCount: z.number().int().nonnegative().nullable(),
    activeRefundCaseCount: z.number().int().nonnegative(),
    openDisputeCount: z.number().int().nonnegative(),
    overdueResolution: z.string().nullable(),
    hasPerformanceIssue: z.boolean(),
  })
  .strict();

const fieldJobSummarySchema = z
  .object({
    id: z.number().int().positive(),
    orderNo: z.string().min(1),
    status: z.enum(fieldJobStatuses),
    serviceName: z.string().min(1),
    shop: z
      .object({ id: z.number().int().positive(), name: z.string().min(1) })
      .strict(),
    technician: technicianSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    location: locationSchema,
    credential: credentialSchema,
    evidence: evidenceSchema,
    exceptions: exceptionsSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const fieldJobDetailSchema = fieldJobSummarySchema
  .extend({
    customerPublicId: z.string().min(1),
    timeline: z.array(
      z
        .object({
          id: z.number().int().positive(),
          fromStatus: z.enum(fieldJobStatuses).nullable(),
          toStatus: z.enum(fieldJobStatuses),
          reason: z.string().nullable(),
          createdAt: z.string().datetime(),
        })
        .strict(),
    ),
  })
  .strict();

const fieldJobPageSchema = z
  .object({
    list: z.array(fieldJobSummarySchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    page_size: z.number().int().positive().max(100),
  })
  .strict();

export type FieldJobStatus = (typeof fieldJobStatuses)[number];
export type FieldJobSummary = z.infer<typeof fieldJobSummarySchema>;
export type FieldJobDetail = z.infer<typeof fieldJobDetailSchema>;
export type FieldJobPage = z.infer<typeof fieldJobPageSchema>;
export type FieldJobListQuery = {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: FieldJobStatus;
  assignment?: "assigned" | "unassigned";
};

export const fieldJobApi = {
  async list(query: FieldJobListQuery): Promise<FieldJobPage> {
    const payload = await httpClient.request<unknown>(
      "/backoffice/field-jobs",
      { query },
    );
    return fieldJobPageSchema.parse(payload);
  },
  async get(id: number): Promise<FieldJobDetail> {
    const payload = await httpClient.request<unknown>(
      `/backoffice/field-jobs/${id}`,
    );
    return fieldJobDetailSchema.parse(payload);
  },
};
