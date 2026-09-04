import { z } from "zod";

export const contractLanguageQuerySchema = z
  .object({ language: z.enum(["zh-CN", "ja", "en"]).default("zh-CN") })
  .strict();

export const activateAffiliateIdentityBodySchema = z
  .object({
    contractVersion: z.string().trim().min(1).max(80),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/iu),
    language: z.enum(["zh-CN", "ja", "en"]),
    hasRead: z.literal(true),
    hasAgreed: z.literal(true)
  })
  .strict();

export const bindAffiliateWithdrawalBankAccountBodySchema = z
  .object({
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
    accountType: z.enum(["ordinary", "current"]),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{4,12}$/u),
    accountHolderName: z.string().trim().min(1).max(191)
  })
  .strict();

export const merchantContractApplicationIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const contractReceiptIdParamSchema = z
  .object({ receiptId: z.string().trim().min(1).max(191) })
  .strict();

export const acceptMerchantContractBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    contractVersion: z.string().trim().min(1).max(80),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/iu),
    language: z.enum(["zh-CN", "ja", "en"]),
    hasRead: z.literal(true),
    hasAgreed: z.literal(true)
  })
  .strict();
