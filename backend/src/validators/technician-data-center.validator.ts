import { z } from "zod";

export const technicianDataCenterQuerySchema = z
  .object({
    period: z.enum(["last7days", "last30days", "week", "month", "year"]).default("last7days")
  })
  .strict();

export type TechnicianDataCenterQuery = z.infer<typeof technicianDataCenterQuerySchema>;
