import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
const kana = z
  .string()
  .trim()
  .max(100)
  .transform((value) => value.normalize("NFKC"))
  .pipe(
    z
      .string()
      .min(1)
      .max(100)
      .regex(/^[\u30A1-\u30FA\u30FC\u30FD\u30FE\u30FB\s]+$/u)
  );
export const ekycProfileSchema = z
  .object({
    familyName: text(100),
    givenName: text(100),
    familyNameKana: kana,
    givenNameKana: kana,
    birthYear: z.string().regex(/^\d{4}$/),
    birthMonth: z.string().regex(/^\d{1,2}$/),
    birthDay: z.string().regex(/^\d{1,2}$/),
    sex: z.enum(["male", "female"]),
    postalCode: z
      .string()
      .max(20)
      .transform((value) => value.trim().normalize("NFKC").replace(/[\s-]/gu, ""))
      .pipe(z.string().regex(/^\d{7}$/)),
    city: text(200),
    street: text(500),
    building: z.string().trim().max(200),
    occupation: z.enum([
      "employee",
      "executive",
      "civil_servant",
      "self_employed",
      "part_time",
      "contract",
      "homemaker",
      "student",
      "retired",
      "other"
    ]),
    otherOccupation: z.string().trim().max(200)
  })
  .strict()
  .superRefine((p, ctx) => {
    const now = new Date(),
      y = Number(p.birthYear),
      m = Number(p.birthMonth),
      d = Number(p.birthDay),
      date = new Date(Date.UTC(y, m - 1, d));
    if (
      y < now.getUTCFullYear() - 120 ||
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d ||
      date > now
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthDay"],
        message: "error.ekyc_application.invalid_birth_date"
      });
    if (p.occupation === "other" && !p.otherOccupation)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["otherOccupation"],
        message: "error.ekyc_application.other_occupation_required"
      });
  })
  .transform((p) => ({ ...p, otherOccupation: p.occupation === "other" ? p.otherOccupation : "" }));
export type EkycProfile = z.infer<typeof ekycProfileSchema>;
export const createEkycBodySchema = z.object({ profile: ekycProfileSchema }).strict();
export const ekycIdSchema = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const ekycVersionSchema = z
  .object({ expectedVersion: z.number().int().positive().max(2147483647) })
  .strict();
export const approveEkycBodySchema = ekycVersionSchema.extend({
  reviewNote: text(1000),
  identityConfirmed: z.literal(true)
});
export const rejectEkycBodySchema = ekycVersionSchema.extend({ rejectionReason: text(1000) });
export const ekycListSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["submitted", "approved", "rejected", "withdrawn"]).optional()
});
