import { z } from "zod";

const isoDate = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const participantIds = z.array(z.number().int().positive()).max(100).refine(
  (items) => new Set(items).size === items.length,
  "Participant identities must be unique",
);
const imageUrls = z.array(z.string().url().max(2_000)).max(20);

export const calendarEventListQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
}).strict().refine((value) => value.to > value.from, { path: ["to"], message: "to must be after from" });

export const calendarEventIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
}).strict();

const fields = {
  title: z.string().trim().min(1).max(200),
  startsAt: isoDate,
  endsAt: isoDate,
  allDay: z.boolean(),
  reminderMinutes: z.number().int().min(0).max(525_600).nullable(),
  repeatRule: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
  location: z.string().trim().max(300),
  url: z.union([z.literal(""), z.string().url().max(1_000)]),
  note: z.string().max(10_000),
  visibility: z.enum(["private", "participants"]),
  participantIdentityIds: participantIds,
  imageUrls,
};

export const calendarEventCreateBodySchema = z.object(fields).strict().refine(
  (value) => value.endsAt > value.startsAt,
  { path: ["endsAt"], message: "endsAt must be after startsAt" },
);

export const calendarEventUpdateBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: fields.title.optional(),
  startsAt: fields.startsAt.optional(),
  endsAt: fields.endsAt.optional(),
  allDay: fields.allDay.optional(),
  reminderMinutes: fields.reminderMinutes.optional(),
  repeatRule: fields.repeatRule.optional(),
  location: fields.location.optional(),
  url: fields.url.optional(),
  note: fields.note.optional(),
  visibility: fields.visibility.optional(),
  participantIdentityIds: fields.participantIdentityIds.optional(),
  imageUrls: fields.imageUrls.optional(),
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== "expectedVersion"),
  "At least one event field is required",
).refine(
  (value) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt,
  { path: ["endsAt"], message: "endsAt must be after startsAt" },
);

export const calendarEventDeleteQuerySchema = z.object({
  expected_version: z.coerce.number().int().positive(),
}).strict();

export const calendarEventIdempotencyHeaderSchema = z.object({
  "idempotency-key": z.string().trim().min(1).max(191),
}).passthrough();

export type CalendarEventCreateBody = z.infer<typeof calendarEventCreateBodySchema>;
export type CalendarEventUpdateBody = z.infer<typeof calendarEventUpdateBodySchema>;
