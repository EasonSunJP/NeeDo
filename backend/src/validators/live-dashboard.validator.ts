import { z } from "zod";

export const liveDashboardQuerySchema = z
  .object({
    country: z.literal("JP"),
    admin1: z
      .string()
      .regex(/^\d{2}$/)
      .optional(),
    admin2: z
      .string()
      .regex(/^\d{5}$/)
      .optional(),
    period: z.enum(["today", "last7days", "last30days"]).default("today")
  })
  .strict()
  .superRefine((value, context) => {
    if (value.admin2 && !value.admin1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["admin1"],
        message: "admin1 is required when admin2 is present"
      });
    }
  });

export type LiveDashboardQuery = z.infer<typeof liveDashboardQuerySchema>;
