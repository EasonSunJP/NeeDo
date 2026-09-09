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
      select: { ownerIdentityId: true, startsAt: true, endsAt: true },
      where: {
        ownerIdentityId: { in: [21] },
        startsAt: { lt: input.to },
        endsAt: { gt: input.from },
        deletedAt: null,
      },
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
});
