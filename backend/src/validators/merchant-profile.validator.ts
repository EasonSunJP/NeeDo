import { z } from "zod";

const avatarDataUrlSchema = z
  .string()
  .max(900_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);

export const merchantProfileVisibilitySchema = z.enum([
  "public",
  "privateAll",
  "limited",
  "network"
]);

export const merchantProfileUpdateBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    avatarDataUrl: avatarDataUrlSchema.optional(),
    gender: z.enum(["female", "male", "private"]).optional(),
    age: z.number().int().min(18).max(150).nullable().optional(),
    heightCm: z.number().min(30).max(250).nullable().optional(),
    languages: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    bio: z.string().trim().max(2_000).nullable().optional(),
    visibility: merchantProfileVisibilitySchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required"
  });

export type MerchantProfileUpdateBody = z.infer<typeof merchantProfileUpdateBodySchema>;
