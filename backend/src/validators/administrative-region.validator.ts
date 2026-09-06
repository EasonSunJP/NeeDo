import { z } from "zod";

export const administrativeRegionListQuerySchema = z
  .object({
    country: z.literal("JP"),
    parent: z
      .string()
      .regex(/^\d{2,5}$/)
      .optional(),
    locale: z.enum(["zh-CN", "zh-TW", "ja", "en", "ko"]).default("ja")
  })
  .strict();

export const verifiedServiceLocationSchema = z
  .object({
    serviceCountryCode: z.literal("JP"),
    serviceAdmin1Code: z.string().regex(/^\d{2}$/),
    serviceAdmin2Code: z.string().regex(/^\d{5}$/)
  })
  .strict();

export interface VerifiedServiceLocationInput {
  countryCode: "JP";
  admin1Code: string;
  admin2Code: string;
}

export type AdministrativeRegionListQuery = z.infer<typeof administrativeRegionListQuerySchema>;

export type VerifiedServiceLocationBody = z.infer<typeof verifiedServiceLocationSchema>;
