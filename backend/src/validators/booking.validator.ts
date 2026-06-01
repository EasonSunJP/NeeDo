import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const isoDateSchema = z.coerce.date();

export const availabilityListQuerySchema = z
  .object({
    ...paginationQuerySchema,
    serviceId: z.coerce.number().int().positive().optional(),
    technicianServiceId: z.coerce.number().int().positive().optional(),
    shopId: z.coerce.number().int().positive().optional(),
    technicianId: z.coerce.number().int().positive().optional(),
    from: isoDateSchema,
    to: isoDateSchema
  })
  .refine((value) => Boolean(value.serviceId) !== Boolean(value.technicianServiceId), {
    message: "Exactly one of serviceId or technicianServiceId is required",
    path: ["serviceId"]
  })
  .refine((value) => value.from.getTime() < value.to.getTime(), {
    message: "from must be earlier than to",
    path: ["to"]
  });

export const bookingCreateBodySchema = z
  .object({
    serviceId: z.coerce.number().int().positive().optional(),
    technicianServiceId: z.coerce.number().int().positive().optional(),
    scheduleSlotId: z.coerce.number().int().positive(),
    orderType: z.literal("booking").optional(),
    fulfillmentMode: z.enum(["home", "store"]),
    note: z.string().trim().max(500).optional()
  })
  .refine((value) => Boolean(value.serviceId) !== Boolean(value.technicianServiceId), {
    message: "Exactly one of serviceId or technicianServiceId is required",
    path: ["serviceId"]
  });

export const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const orderListQuerySchema = z.object({
  ...paginationQuerySchema,
  customerUserId: z.coerce.number().int().positive().optional(),
  status: z.enum(["pending", "confirmed", "inService", "completed", "cancelled"]).optional()
});

export const orderCancelBodySchema = z.object({
  reason: z.string().trim().max(500).optional()
});

export type AvailabilityListQuery = z.infer<typeof availabilityListQuerySchema>;
export type BookingCreateBody = z.infer<typeof bookingCreateBodySchema>;
export type OrderIdParams = z.infer<typeof orderIdParamSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type OrderCancelBody = z.infer<typeof orderCancelBodySchema>;
