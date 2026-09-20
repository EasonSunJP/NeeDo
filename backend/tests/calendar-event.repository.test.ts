import type { PrismaClient } from "@prisma/client";
import { CalendarEventRepository } from "../src/repositories/calendar-event.repository";

const input = {
  viewerIdentityId: 17,
  participantIdentityIds: [21],
  from: new Date("2026-09-09T00:00:00.000Z"),
  to: new Date("2026-09-10T00:00:00.000Z"),
  page: 1,
  pageSize: 20,
};

describe("CalendarEventRepository recurring event reads", () => {
  it("keeps recurring masters eligible after their anchor interval has passed", async () => {
    const client = {
      calendarEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaClient;
    const from = new Date("2026-09-20T15:00:00.000Z");
    const to = new Date("2026-09-22T15:00:00.000Z");

    await new CalendarEventRepository(client).list({
      ownerIdentityId: 17,
      from,
      to,
      page: 1,
      pageSize: 100,
    });

    expect(client.calendarEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        ownerIdentityId: 17,
        deletedAt: null,
        OR: [
          {
            repeatRule: "none",
            startsAt: { lt: to },
            endsAt: { gt: from },
          },
          {
            repeatRule: { in: ["daily", "weekly", "monthly", "yearly"] },
            startsAt: { lt: to },
          },
        ],
      },
    }));
  });
});

describe("CalendarEventRepository participant busy ranges", () => {
  it("rejects the whole read before querying events when any identity is not an active contact", async () => {
    const client = {
      contact: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn(), count: jest.fn() },
      bookingOrder: { findMany: jest.fn() },
    } as unknown as PrismaClient;

    await expect(new CalendarEventRepository(client).listParticipantBusy(input)).resolves.toEqual({ outcome: "forbidden" });
    expect(client.calendarEvent.findMany).not.toHaveBeenCalled();
    expect(client.calendarEvent.count).not.toHaveBeenCalled();
    expect(client.bookingOrder.findMany).not.toHaveBeenCalled();
  });

  it("queries calendar events and hard-lock bookings, then projects no private fields", async () => {
    const client = {
      contact: { findMany: jest.fn().mockResolvedValue([{
        contactIdentityId: 21,
        contactUserId: 31,
        contactUser: { technicianProfile: { id: 41 } },
      }]) },
      calendarEvent: {
        findMany: jest.fn().mockResolvedValue([{
          ownerIdentityId: 21,
          startsAt: new Date("2026-09-09T09:00:00.000Z"),
          endsAt: new Date("2026-09-09T10:00:00.000Z"),
        }]),
      },
      bookingOrder: { findMany: jest.fn().mockResolvedValue([{
        customerUserId: 31,
        technicianProfileId: null,
        startsAt: new Date("2026-09-09T12:00:00.000Z"),
        endsAt: new Date("2026-09-09T13:00:00.000Z"),
      }]) },
    } as unknown as PrismaClient;

    const result = await new CalendarEventRepository(client).listParticipantBusy(input);

    expect(client.calendarEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { ownerIdentityId: true, startsAt: true, endsAt: true, repeatRule: true },
      where: expect.objectContaining({ ownerIdentityId: { in: [21] }, deletedAt: null }),
    }));
    expect(client.bookingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { customerUserId: true, technicianProfileId: true, startsAt: true, endsAt: true },
      where: expect.objectContaining({
        deletedAt: null,
        status: { in: ["CONFIRMED", "IN_SERVICE"] },
      }),
    }));
    expect(result).toEqual({
      outcome: "ok",
      list: [
        {
          participantIdentityId: 21,
          startsAt: "2026-09-09T09:00:00.000Z",
          endsAt: "2026-09-09T10:00:00.000Z",
          status: "locked",
        },
        {
          participantIdentityId: 21,
          startsAt: "2026-09-09T12:00:00.000Z",
          endsAt: "2026-09-09T13:00:00.000Z",
          status: "locked",
        },
      ],
      total: 2,
      page: 1,
      page_size: 20,
    });
  });

  it("requires both the target identity and user to be active", async () => {
    const client = {
      contact: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn() },
      bookingOrder: { findMany: jest.fn() },
    } as unknown as PrismaClient;

    await new CalendarEventRepository(client).listParticipantBusy(input);

    expect(client.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contactIdentity: { isActive: true, deletedAt: null },
        contactUser: { isActive: true, deletedAt: null },
      }),
    }));
  });

  it("projects a recurring participant event into a later requested day", async () => {
    const client = {
      contact: { findMany: jest.fn().mockResolvedValue([{
        contactIdentityId: 21,
        contactUserId: 31,
        contactUser: { technicianProfile: null },
      }]) },
      calendarEvent: {
        findMany: jest.fn().mockResolvedValue([{
          ownerIdentityId: 21,
          startsAt: new Date("2026-09-08T01:00:00.000Z"),
          endsAt: new Date("2026-09-08T02:00:00.000Z"),
          repeatRule: "daily",
        }]),
      },
      bookingOrder: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const result = await new CalendarEventRepository(client).listParticipantBusy(input);

    expect(result).toEqual({
      outcome: "ok",
      list: [{
        participantIdentityId: 21,
        startsAt: "2026-09-09T01:00:00.000Z",
        endsAt: "2026-09-09T02:00:00.000Z",
        status: "locked",
      }],
      total: 1,
      page: 1,
      page_size: 20,
    });
  });
});
