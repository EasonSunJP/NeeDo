import { z } from "zod";

const idempotencyKeySchema = z.string().trim().min(8).max(160);
const createEnvelopeSchema = z
  .object({ idempotencyKey: idempotencyKeySchema, expectedVersion: z.literal(0) })
  .strict();
const updateEnvelopeSchema = z
  .object({ idempotencyKey: idempotencyKeySchema, expectedVersion: z.number().int().positive() })
  .strict();

const reasonSchema = z.string().trim().min(2).max(500);
const noteSchema = z.string().trim().min(2).max(500);

export const orderRefundCaseRequestBodySchema = createEnvelopeSchema
  .extend({ reason: reasonSchema })
  .strict();

export const orderRefundCaseComplaintBodySchema = updateEnvelopeSchema
  .extend({ reason: reasonSchema })
  .strict();

export const orderRefundCaseApproveBodySchema = updateEnvelopeSchema
  .extend({ note: noteSchema })
  .strict();

export const orderRefundCaseRejectBodySchema = updateEnvelopeSchema
  .extend({ note: noteSchema })
  .strict();

export const orderRefundCaseEvidenceBodySchema = updateEnvelopeSchema
  .extend({ reference: z.string().trim().min(2).max(120) })
  .strict();

export const orderRefundCaseReceiptConfirmationBodySchema = updateEnvelopeSchema;

export const orderRefundCaseDisputeResolutionBodySchema = updateEnvelopeSchema
  .extend({
    resolution: z.enum(["refund", "reject"]),
    publicReason: reasonSchema,
    internalNote: z.string().trim().min(2).max(1000).nullable().optional()
  })
  .strict();

const scalarNumberSchema = z.union([z.string(), z.number()]);
const positiveScalarNumberSchema = scalarNumberSchema.pipe(z.coerce.number().int().positive());

export const orderRefundCaseOrderIdParamSchema = z
  .object({ orderId: positiveScalarNumberSchema })
  .strict();
export const orderRefundCaseIdParamSchema = z.object({ caseId: z.string().trim().uuid() }).strict();
export const orderRefundCaseDisputeParamSchema = z
  .object({ disputeId: z.string().trim().uuid() })
  .strict();

export const orderRefundCaseListQuerySchema = z
  .object({
    page: positiveScalarNumberSchema.default(1),
    page_size: scalarNumberSchema.pipe(z.coerce.number().int().positive().max(100)).default(20),
    status: z.enum(["open", "resolved"]).optional(),
    search: z.string().trim().max(100).optional()
  })
  .strict();

export type OrderRefundCaseRequestBody = z.infer<typeof orderRefundCaseRequestBodySchema>;
export type OrderRefundCaseComplaintBody = z.infer<typeof orderRefundCaseComplaintBodySchema>;
export type OrderRefundCaseApproveBody = z.infer<typeof orderRefundCaseApproveBodySchema>;
export type OrderRefundCaseRejectBody = z.infer<typeof orderRefundCaseRejectBodySchema>;
export type OrderRefundCaseEvidenceBody = z.infer<typeof orderRefundCaseEvidenceBodySchema>;
export type OrderRefundCaseReceiptConfirmationBody = z.infer<
  typeof orderRefundCaseReceiptConfirmationBodySchema
>;
export type OrderRefundCaseDisputeResolutionBody = z.infer<
  typeof orderRefundCaseDisputeResolutionBodySchema
>;
export type OrderRefundCaseOrderIdParam = z.infer<typeof orderRefundCaseOrderIdParamSchema>;
export type OrderRefundCaseIdParam = z.infer<typeof orderRefundCaseIdParamSchema>;
export type OrderRefundCaseDisputeParam = z.infer<typeof orderRefundCaseDisputeParamSchema>;
export type OrderRefundCaseListQuery = z.infer<typeof orderRefundCaseListQuerySchema>;

// Descriptive aliases keep the contract easy to consume from route-specific modules.
export const createOrderRefundCaseBodySchema = orderRefundCaseRequestBodySchema;
export const orderRefundCaseCreateBodySchema = orderRefundCaseRequestBodySchema;
export const orderRefundCaseComplaintSchema = orderRefundCaseComplaintBodySchema;
export const orderRefundCaseApproveSchema = orderRefundCaseApproveBodySchema;
export const orderRefundCaseRejectSchema = orderRefundCaseRejectBodySchema;
export const orderRefundCaseEvidenceSchema = orderRefundCaseEvidenceBodySchema;
export const orderRefundCaseReceiptConfirmationSchema =
  orderRefundCaseReceiptConfirmationBodySchema;
export const orderRefundCaseDisputeResolutionSchema = orderRefundCaseDisputeResolutionBodySchema;
