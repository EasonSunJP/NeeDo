import { z } from "zod";

const paginationShape = {
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20)
};

const nullableTrimmedString = (max: number) => z.string().trim().max(max).nullable();
const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .nullable();

export const identityApplicationIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const identityApplicationListQuerySchema = z
  .object({
    ...paginationShape,
    type: z.enum(["technician", "merchant"]).optional(),
    status: z
      .enum(["draft", "submitted", "under_review", "approved", "rejected", "withdrawn"])
      .optional()
  })
  .strict();

export const eligibleMerchantSearchQuerySchema = z
  .object({
    ...paginationShape,
    query: z.string().trim().min(1).max(160)
  })
  .strict();

export const createTechnicianApplicationBodySchema = z
  .object({
    targetShopId: z.number().int().positive(),
    applicantName: z.string().trim().min(1).max(120)
  })
  .strict();

export const updateTechnicianApplicationBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    targetShopId: z.number().int().positive(),
    applicantName: z.string().trim().min(1).max(120),
    phone: nullableTrimmedString(32),
    city: nullableTrimmedString(100),
    serviceAreas: z.array(z.string().trim().min(1).max(100)).max(30),
    skills: z.array(z.string().trim().min(1).max(100)).max(50),
    yearsExperience: z.number().int().min(0).max(80).nullable(),
    bio: nullableTrimmedString(2000),
    gender: z.enum(["male", "female", "other", "undisclosed"]).nullable(),
    birthDate: birthDateSchema
  })
  .strict();

const merchantShowcaseShape = {
  applicantKind: z.enum(["corporate", "individual"]),
  corporateLegalName: nullableTrimmedString(191),
  corporateLegalNameKana: nullableTrimmedString(191),
  representativeName: z.string().trim().min(1).max(120),
  representativeNameKana: z.string().trim().min(1).max(191),
  shopName: z.string().trim().min(1).max(160),
  businessAddress: z.string().trim().min(1).max(255),
  contactPhone: z.string().trim().min(1).max(32),
  responsiblePersonName: z.string().trim().min(1).max(120),
  showcaseDraft: z.object({
    nearestStation: z.string().trim().max(160).optional(),
    stationTravelMinutes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    stationAccess: z.string().trim().max(255).optional()
  }).passthrough(),
  serviceCategoryIds: z.array(z.number().int().positive()).min(1).max(5),
  businessKeywordIds: z.array(z.number().int().positive()).max(5)
};

export const createMerchantApplicationBodySchema = z.object(merchantShowcaseShape).strict();

export const updateMerchantShowcaseBodySchema = z
  .object({ expectedVersion: z.number().int().positive(), ...merchantShowcaseShape })
  .strict();

export const identityApplicationVersionBodySchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const bindMerchantBankAccountBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    bankCode: z
      .string()
      .trim()
      .regex(/^\d{4}$/u),
    bankName: z.string().trim().min(1).max(120),
    branchCode: z
      .string()
      .trim()
      .regex(/^\d{3}$/u),
    branchName: z.string().trim().min(1).max(120),
    accountType: z.enum(["ordinary", "current", "savings", "other"]),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{4,12}$/u),
    accountHolderName: z.string().trim().min(1).max(191)
  })
  .strict();
