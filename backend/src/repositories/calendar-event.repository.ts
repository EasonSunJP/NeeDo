import { createHash } from "node:crypto";
import { BookingOrderStatus } from "@prisma/client";
import type { Prisma, CalendarEvent, PrismaClient } from "@prisma/client";
import {
  projectParticipantBusyRanges,
  type CalendarParticipantBusyRange,
} from "../domain/calendar-participant-availability";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export type CalendarEventVisibility = "private" | "participants";
export type CalendarEventRepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface CalendarEventPayload {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  reminderMinutes: number | null;
  repeatRule: CalendarEventRepeatRule;
  location: string;
  url: string;
  note: string;
  visibility: CalendarEventVisibility;
  participantIdentityIds: number[];
  imageUrls: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventListInput {
  ownerIdentityId: number;
  from: Date;
  to: Date;
  page: number;
  pageSize: number;
}

export interface CalendarParticipantBusyListInput {
  viewerIdentityId: number;
  participantIdentityIds: number[];
  from: Date;
  to: Date;
  page: number;
  pageSize: number;
}

export type CalendarParticipantBusyListResult =
  | {
      outcome: "ok";
      list: CalendarParticipantBusyRange[];
      total: number;
      page: number;
      page_size: number;
    }
  | { outcome: "forbidden" };

export interface CalendarEventCreateInput {
  ownerIdentityId: number;
  idempotencyKey: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  reminderMinutes: number | null;
  repeatRule: CalendarEventRepeatRule;
  location: string;
  url: string;
  note: string;
  visibility: CalendarEventVisibility;
  participantIdentityIds: number[];
  imageUrls: string[];
}

export interface CalendarEventUpdateInput {
  ownerIdentityId: number;
  id: number;
  expectedVersion: number;
  title?: string;
  startsAt?: Date;
  endsAt?: Date;
  allDay?: boolean;
  reminderMinutes?: number | null;
  repeatRule?: CalendarEventRepeatRule;
  location?: string;
  url?: string;
  note?: string;
  visibility?: CalendarEventVisibility;
  participantIdentityIds?: number[];
  imageUrls?: string[];
}

export type CalendarEventMutationResult =
  | { outcome: "ok"; event: CalendarEventPayload }
  | { outcome: "not_found" | "version_conflict" | "idempotency_conflict" };

export interface CalendarEventRepositoryPort {
  list(input: CalendarEventListInput): Promise<{
    list: CalendarEventPayload[];
    total: number;
    page: number;
    page_size: number;
  }>;
  listParticipantBusy(
    input: CalendarParticipantBusyListInput,
  ): Promise<CalendarParticipantBusyListResult>;
  create(
    input: CalendarEventCreateInput,
    audit: AuditLogCreateInput,
  ): Promise<CalendarEventMutationResult>;
  update(
    input: CalendarEventUpdateInput,
    audit: AuditLogCreateInput,
  ): Promise<CalendarEventMutationResult>;
  remove(
    input: { ownerIdentityId: number; id: number; expectedVersion: number },
    audit: AuditLogCreateInput,
  ): Promise<CalendarEventMutationResult>;
}

const jsonNumbers = (value: Prisma.JsonValue): number[] =>
  Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];

const jsonStrings = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const toPayload = (row: CalendarEvent): CalendarEventPayload => ({
  id: row.id,
  title: row.title,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  allDay: row.allDay,
  reminderMinutes: row.reminderMinutes,
  repeatRule: row.repeatRule as CalendarEventRepeatRule,
  location: row.location,
  url: row.url,
  note: row.note,
  visibility: row.visibility as CalendarEventVisibility,
  participantIdentityIds: jsonNumbers(row.participantIdentityIds),
  imageUrls: jsonStrings(row.imageUrls),
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const fingerprint = (input: CalendarEventCreateInput): string =>
  createHash("sha256")
    .update(JSON.stringify({
      title: input.title,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
      allDay: input.allDay,
      reminderMinutes: input.reminderMinutes,
      repeatRule: input.repeatRule,
      location: input.location,
      url: input.url,
      note: input.note,
      visibility: input.visibility,
      participantIdentityIds: [...input.participantIdentityIds].sort((a, b) => a - b),
      imageUrls: input.imageUrls,
    }))
    .digest("hex");

export class CalendarEventRepository implements CalendarEventRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async list(input: CalendarEventListInput) {
    const where: Prisma.CalendarEventWhereInput = {
      ownerIdentityId: input.ownerIdentityId,
      startsAt: { lt: input.to },
      endsAt: { gt: input.from },
      deletedAt: null,
    };
    const [rows, total] = await Promise.all([
      this.client.calendarEvent.findMany({
        where,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.client.calendarEvent.count({ where }),
    ]);
    return { list: rows.map(toPayload), total, page: input.page, page_size: input.pageSize };
  }

  public async listParticipantBusy(
    input: CalendarParticipantBusyListInput,
  ): Promise<CalendarParticipantBusyListResult> {
    const participantIdentityIds = Array.from(new Set(input.participantIdentityIds));
    const authorizedContacts = await this.client.contact.findMany({
      where: {
        ownerIdentityId: input.viewerIdentityId,
        contactIdentityId: { in: participantIdentityIds },
        blockedAt: null,
        deletedAt: null,
        contactIdentity: { isActive: true, deletedAt: null },
        contactUser: { isActive: true, deletedAt: null },
      },
      select: {
        contactIdentityId: true,
        contactUserId: true,
        contactUser: { select: { technicianProfile: { select: { id: true } } } },
      },
    });
    const authorizedIds = new Set(authorizedContacts.map((contact) => contact.contactIdentityId));
    if (participantIdentityIds.some((identityId) => !authorizedIds.has(identityId))) {
      return { outcome: "forbidden" };
    }

    const calendarWhere: Prisma.CalendarEventWhereInput = {
      ownerIdentityId: { in: participantIdentityIds },
      startsAt: { lt: input.to },
      endsAt: { gt: input.from },
      deletedAt: null,
    };
    const participantIdentityByUserId = new Map(
      authorizedContacts.map((contact) => [contact.contactUserId, contact.contactIdentityId]),
    );
    const participantIdentityByTechnicianId = new Map(
      authorizedContacts.flatMap((contact) => contact.contactUser.technicianProfile
        ? [[contact.contactUser.technicianProfile.id, contact.contactIdentityId] as const]
        : []),
    );
    const [calendarRows, bookingRows] = await Promise.all([
      this.client.calendarEvent.findMany({
        where: calendarWhere,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: {
          ownerIdentityId: true,
          startsAt: true,
          endsAt: true,
        },
      }),
      this.client.bookingOrder.findMany({
        where: {
          deletedAt: null,
          status: { in: [BookingOrderStatus.CONFIRMED, BookingOrderStatus.IN_SERVICE] },
          startsAt: { lt: input.to },
          endsAt: { gt: input.from },
          OR: [
            { customerUserId: { in: [...participantIdentityByUserId.keys()] } },
            { technicianProfileId: { in: [...participantIdentityByTechnicianId.keys()] } },
          ],
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: {
          customerUserId: true,
          technicianProfileId: true,
          startsAt: true,
          endsAt: true,
        },
      }),
    ]);

    const bookingBusySources = bookingRows.flatMap((row) => {
      const identities = new Set<number>();
      const customerIdentityId = participantIdentityByUserId.get(row.customerUserId);
      if (customerIdentityId) identities.add(customerIdentityId);
      if (row.technicianProfileId) {
        const technicianIdentityId = participantIdentityByTechnicianId.get(row.technicianProfileId);
        if (technicianIdentityId) identities.add(technicianIdentityId);
      }
      return [...identities].map((participantIdentityId) => ({
        participantIdentityId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      }));
    });
    const projected = projectParticipantBusyRanges([
      ...calendarRows.map((row) => ({
        participantIdentityId: row.ownerIdentityId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      })),
      ...bookingBusySources,
    ]);
    const uniqueSorted = Array.from(new Map(projected.map((range) => [
      `${range.participantIdentityId}:${range.startsAt}:${range.endsAt}`,
      range,
    ])).values()).sort((left, right) => (
      left.startsAt.localeCompare(right.startsAt) ||
      left.participantIdentityId - right.participantIdentityId ||
      left.endsAt.localeCompare(right.endsAt)
    ));
    const offset = (input.page - 1) * input.pageSize;

    return {
      outcome: "ok",
      list: uniqueSorted.slice(offset, offset + input.pageSize),
      total: uniqueSorted.length,
      page: input.page,
      page_size: input.pageSize,
    };
  }

  public async create(
    input: CalendarEventCreateInput,
    audit: AuditLogCreateInput,
  ): Promise<CalendarEventMutationResult> {
    const payloadFingerprint = fingerprint(input);
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.calendarEvent.findUnique({
        where: {
          ownerIdentityId_idempotencyKey: {
            ownerIdentityId: input.ownerIdentityId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        return existing.payloadFingerprint === payloadFingerprint && !existing.deletedAt
          ? { outcome: "ok" as const, event: toPayload(existing) }
          : { outcome: "idempotency_conflict" as const };
      }
      const created = await transaction.calendarEvent.create({
        data: {
          ownerIdentityId: input.ownerIdentityId,
          idempotencyKey: input.idempotencyKey,
          payloadFingerprint,
          title: input.title,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          allDay: input.allDay,
          reminderMinutes: input.reminderMinutes,
          repeatRule: input.repeatRule,
          location: input.location,
          url: input.url,
          note: input.note,
          visibility: input.visibility,
          participantIdentityIds: input.participantIdentityIds,
          imageUrls: input.imageUrls,
        },
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({ ...audit, targetId: created.id }),
      });
      return { outcome: "ok" as const, event: toPayload(created) };
    });
  }

  public async update(
    input: CalendarEventUpdateInput,
    audit: AuditLogCreateInput,
  ): Promise<CalendarEventMutationResult> {
    return this.client.$transaction(async (transaction) => {
      const current = await transaction.calendarEvent.findFirst({
        where: { id: input.id, ownerIdentityId: input.ownerIdentityId, deletedAt: null },
      });
      if (!current) return { outcome: "not_found" as const };
      if (current.version !== input.expectedVersion) return { outcome: "version_conflict" as const };
      const startsAt = input.startsAt ?? current.startsAt;
      const endsAt = input.endsAt ?? current.endsAt;
      if (endsAt <= startsAt) return { outcome: "version_conflict" as const };
      const updated = await transaction.calendarEvent.update({
        where: { id: input.id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt }),
          ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt }),
          ...(input.allDay === undefined ? {} : { allDay: input.allDay }),
          ...(input.reminderMinutes === undefined ? {} : { reminderMinutes: input.reminderMinutes }),
          ...(input.repeatRule === undefined ? {} : { repeatRule: input.repeatRule }),
          ...(input.location === undefined ? {} : { location: input.location }),
          ...(input.url === undefined ? {} : { url: input.url }),
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
          ...(input.participantIdentityIds === undefined
            ? {}
            : { participantIdentityIds: input.participantIdentityIds }),
          ...(input.imageUrls === undefined ? {} : { imageUrls: input.imageUrls }),
          version: { increment: 1 },
        },
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData(audit) });
      return { outcome: "ok" as const, event: toPayload(updated) };
    });
  }

  public async remove(
    input: { ownerIdentityId: number; id: number; expectedVersion: number },
    audit: AuditLogCreateInput,
  ): Promise<CalendarEventMutationResult> {
    return this.client.$transaction(async (transaction) => {
      const current = await transaction.calendarEvent.findFirst({
        where: { id: input.id, ownerIdentityId: input.ownerIdentityId, deletedAt: null },
      });
      if (!current) return { outcome: "not_found" as const };
      if (current.version !== input.expectedVersion) return { outcome: "version_conflict" as const };
      const deleted = await transaction.calendarEvent.update({
        where: { id: input.id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData(audit) });
      return { outcome: "ok" as const, event: toPayload(deleted) };
    });
  }
}
