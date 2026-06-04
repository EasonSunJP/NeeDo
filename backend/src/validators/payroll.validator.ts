import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
};

export const payrollListQuerySchema = z.object({
  ...paginationQuerySchema,
  shopId: z.coerce.number().int().positive().optional(),
  status: z.string().trim().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export const payrollAdjustmentListQuerySchema = payrollListQuerySchema;

export const payRunIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const payslipIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const payoutRecordConfirmParamSchema = z.object({
  payslipId: z.coerce.number().int().positive(),
  payoutRecordId: z.coerce.number().int().positive()
});

export const payrollAdjustmentIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const payrollManualLineSchema = z.object({
  technicianProfileId: z.number().int().positive(),
  lineType: z.enum([
    "base_salary",
    "bonus",
    "allowance",
    "deduction",
    "adjustment",
    "guarantee_topup"
  ]),
  title: z.string().trim().min(1).max(180),
  amountJpy: z.number().int().min(-100_000_000).max(100_000_000),
  explanation: z.string().trim().max(500).nullable().optional()
});

export const payRunCreateBodySchema = z
  .object({
    shopId: z.number().int().positive(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    manualLines: z.array(payrollManualLineSchema).max(100).default([])
  })
  .refine((value) => value.periodEnd > value.periodStart, {
    message: "periodEnd must be after periodStart",
    path: ["periodEnd"]
  });

export const payslipDisputeBodySchema = z.object({
  reason: z.string().trim().min(1).max(500)
});

export const payslipDisputeResolveBodySchema = z.object({
  resolutionNote: z.string().trim().min(1).max(500)
});

export const payoutRecordBodySchema = z.object({
  amountJpy: z.number().int().positive().max(100_000_000),
  payoutMethod: z.enum(["bank_transfer", "cash", "ndp", "external", "mixed", "other"]),
  payoutDate: z.coerce.date(),
  referenceNo: z.string().trim().max(120).nullable().optional(),
  proofUrl: z.string().trim().url().max(500).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional()
});

export const payrollAdjustmentBodySchema = z
  .object({
    shopId: z.number().int().positive(),
    technicianProfileId: z.number().int().positive(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    adjustmentType: z.enum(["bonus", "allowance", "deduction", "adjustment"]),
    title: z.string().trim().min(1).max(180),
    amountJpy: z.number().int().min(-100_000_000).max(100_000_000),
    reason: z.string().trim().min(1).max(500),
    proofUrl: z.string().trim().url().max(500).nullable().optional()
  })
  .refine((value) => value.periodEnd > value.periodStart, {
    message: "periodEnd must be after periodStart",
    path: ["periodEnd"]
  });

export const payrollAdjustmentRejectBodySchema = z.object({
  reason: z.string().trim().min(1).max(500)
});

export type ParsedPayrollListQuery = z.output<typeof payrollListQuerySchema>;
export type ParsedPayrollAdjustmentListQuery = z.output<typeof payrollAdjustmentListQuerySchema>;
export type ParsedPayRunCreateBody = z.output<typeof payRunCreateBodySchema>;
export type ParsedPayslipDisputeBody = z.output<typeof payslipDisputeBodySchema>;
export type ParsedPayslipDisputeResolveBody = z.output<typeof payslipDisputeResolveBodySchema>;
export type ParsedPayoutRecordBody = z.output<typeof payoutRecordBodySchema>;
export type ParsedPayrollAdjustmentBody = z.output<typeof payrollAdjustmentBodySchema>;
export type ParsedPayrollAdjustmentRejectBody = z.output<typeof payrollAdjustmentRejectBodySchema>;
