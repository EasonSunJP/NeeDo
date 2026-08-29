import { z } from "zod";

export const socialMediaUploadQuerySchema = z
  .object({
    fileName: z
      .string({ message: "error.social.media_invalid" })
      .trim()
      .min(1, "error.social.media_invalid")
      .max(255, "error.social.media_invalid")
  })
  .strict("error.social.media_invalid");

export type SocialMediaUploadQuery = z.infer<typeof socialMediaUploadQuerySchema>;
