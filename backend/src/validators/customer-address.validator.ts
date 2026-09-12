import { z } from "zod";

const optionalAddressLine = z.string().trim().max(255).optional();
const postalCodeSchema = z.preprocess(
  (value) => typeof value === "string" ? value.normalize("NFKC") : value,
  z.string().trim().regex(/^\d{3}-?\d{4}$/u)
);
const customerAddressFields = {
  label: z.string().trim().min(1).max(50),
  countryCode: z.literal("JP"),
  postalCode: postalCodeSchema,
  admin1Code: z.string().trim().regex(/^\d{2}$/u),
  prefecture: z.string().trim().min(1).max(32),
  admin2Code: z.string().trim().regex(/^\d{5}$/u),
  city: z.string().trim().min(1).max(100),
  addressLine1: z.string().trim().min(1).max(255),
  addressLine2: optionalAddressLine,
  building: optionalAddressLine
};

export const customerAddressListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export const customerAddressPublicIdParamSchema = z
  .object({ publicId: z.string().uuid() })
  .strict();

export const customerAddressCreateBodySchema = z
  .object({
    ...customerAddressFields,
    isDefault: z.boolean().optional()
  })
  .strict();

export const customerAddressUpdateBodySchema = z
  .object({
    label: customerAddressFields.label.optional(),
    countryCode: customerAddressFields.countryCode.optional(),
    postalCode: customerAddressFields.postalCode.optional(),
    admin1Code: customerAddressFields.admin1Code.optional(),
    prefecture: customerAddressFields.prefecture.optional(),
    admin2Code: customerAddressFields.admin2Code.optional(),
    city: customerAddressFields.city.optional(),
    addressLine1: customerAddressFields.addressLine1.optional(),
    addressLine2: optionalAddressLine.nullable(),
    building: optionalAddressLine.nullable(),
    isDefault: z.literal(true).optional()
  })
  .strict()
  .superRefine((value, context) => {
    const locationFields = ["countryCode", "admin1Code", "prefecture", "admin2Code", "city"] as const;
    const suppliedFields = locationFields.filter((field) => value[field] !== undefined);
    if (suppliedFields.length > 0 && suppliedFields.length !== locationFields.length) {
      for (const field of locationFields) {
        if (value[field] === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Location fields must be updated together",
            path: [field]
          });
        }
      }
    }
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export type CustomerAddressListQuery = z.infer<typeof customerAddressListQuerySchema>;
export type CustomerAddressCreateBody = z.infer<typeof customerAddressCreateBodySchema>;
export type CustomerAddressUpdateBody = z.infer<typeof customerAddressUpdateBodySchema>;
