import { z } from "zod";

export const identityApplicationMediaUploadParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const identityApplicationMediaReadParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    mediaId: z.coerce.number().int().positive()
  })
  .strict();

export const identityApplicationMediaUploadQuerySchema = z
  .object({
    purpose: z.enum([
      "portrait",
      "identity_document",
      "corporate_registration",
      "representative_identity",
      "showcase"
    ]),
    expected_version: z.coerce.number().int().positive()
  })
  .strict();
