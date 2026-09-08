import { z } from "zod";

export const technicianServiceBookingContextParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();
