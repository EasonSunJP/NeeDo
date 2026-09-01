import { z } from "zod";

const avatarDataUrlSchema = z
  .string()
  .max(900_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);

const stringList = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);

const technicianServiceBaseSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })
  .strict();

export const technicianProfileVisibilitySchema = z.enum([
  "public",
  "privateAll",
  "limited",
  "network"
]);

export const technicianProfileUpdateBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    avatarDataUrl: avatarDataUrlSchema.optional(),
    age: z.number().int().min(18).max(150).nullable().optional(),
    heightCm: z.number().min(30).max(250).nullable().optional(),
    languages: stringList(10, 40).optional(),
    bio: z.string().trim().max(2_000).nullable().optional(),
    serviceAreas: stringList(20, 80).optional(),
    profileTags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    canServeForeigners: z.boolean().optional(),
    bidBudgetMinJpy: z.number().int().min(0).max(100_000_000).nullable().optional(),
    bidBudgetMaxJpy: z.number().int().min(0).max(100_000_000).nullable().optional(),
    paymentMethods: z.array(z.enum([
      "platform",
      "offline",
      "prepay",
      "cash",
      "paypay",
      "paypal",
      "wechatpay",
      "alipay"
    ])).max(8).optional(),
    serviceBase: technicianServiceBaseSchema.nullable().optional(),
    visibility: technicianProfileVisibilitySchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required"
  })
  .refine(
    (value) =>
      value.bidBudgetMinJpy === undefined ||
      value.bidBudgetMinJpy === null ||
      value.bidBudgetMaxJpy === undefined ||
      value.bidBudgetMaxJpy === null ||
      value.bidBudgetMinJpy <= value.bidBudgetMaxJpy,
    { path: ["bidBudgetMaxJpy"], message: "Maximum budget must not be below minimum budget" }
  );

export type TechnicianProfileUpdateBody = z.infer<typeof technicianProfileUpdateBodySchema>;
