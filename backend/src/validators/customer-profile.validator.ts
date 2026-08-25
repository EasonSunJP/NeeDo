import { z } from "zod";

const avatarDataUrl = z
  .string()
  .max(900_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);

export const customerProfileVisibilitySchema = z.enum([
  "public",
  "privateAll",
  "limited",
  "network"
]);

export const customerProfileUpdateBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    avatarDataUrl: avatarDataUrl.optional(),
    gender: z.enum(["female", "male", "private"]).optional(),
    age: z.number().int().min(0).max(150).nullable().optional(),
    heightCm: z.number().min(30).max(250).nullable().optional(),
    languages: z.array(z.string().trim().min(1).max(40)).min(1).max(10).optional(),
    bio: z.string().trim().max(2_000).nullable().optional(),
    visibility: customerProfileVisibilitySchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required"
  });

export type CustomerProfileUpdateBody = z.infer<typeof customerProfileUpdateBodySchema>;
export type CustomerProfileVisibility = z.infer<typeof customerProfileVisibilitySchema>;
