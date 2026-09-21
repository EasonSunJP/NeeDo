import { z } from "zod";

export const backofficeTestNdpPreferenceBodySchema = z
  .object({ showTestNdpData: z.boolean() })
  .strict();
