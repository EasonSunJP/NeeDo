import { describe, expect, it, jest } from "@jest/globals";
import type { AuditLogCreateInput } from "../src/repositories/audit-log.repository";
import type {
  CalendarEventPayload,
  CalendarEventRepositoryPort,
} from "../src/repositories/calendar-event.repository";
import type { AuditLogRecordInput } from "../src/services/audit-log.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { CalendarEventService } from "../src/services/calendar-event.service";

const actor = (type: "customer" | "technician" | "merchant") =>
  ({
    userId: 11,
    currentIdentityId: type === "customer" ? 17 : type === "technician" ? 21 : 31,
    currentIdentityType: type,
    currentIdentityScopeType:
      type === "customer"
        ? "customer_profile"
        : type === "technician"
          ? "technician_profile"
          : "shop",
    currentIdentityScopeId: type === "merchant" ? 8 : 41,
  }) as AuthenticatedAccessContext;

const payload: CalendarEventPayload = {
  id: 91,
  title: "私人安排",
  startsAt: "2026-09-09T09:00:00.000Z",
  endsAt: "2026-09-09T10:00:00.000Z",
  allDay: false,
  reminderMinutes: 30,
  repeatRule: "none",
  location: "",
  url: "",
  note: "",
  visibility: "private",
  participantIdentityIds: [],
  imageUrls: [],
  version: 1,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

const repository = (): jest.Mocked<CalendarEventRepositoryPort> => ({
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

const audit = {
  createInput: jest.fn(
    (input: AuditLogRecordInput): AuditLogCreateInput => ({
      action: input.action,
      actorId: input.actor.userId,
      metadata: input.metadata,
      targetId: input.targetId,
      targetType: input.targetType,
    }),
  ),
};

const requestContext = { ip: "127.0.0.1", userAgent: "jest" };

describe("CalendarEventService", () => {
  it("creates a formal event for the current customer identity and audits it", async () => {
    const calendarRepository = repository();
    calendarRepository.create.mockResolvedValue({ outcome: "ok", event: payload });
    const service = new CalendarEventService(calendarRepository, audit);

    await expect(
      service.create(
        actor("customer"),
        {
          title: "私人安排",
          startsAt: new Date("2026-09-09T09:00:00.000Z"),
          endsAt: new Date("2026-09-09T10:00:00.000Z"),
          allDay: false,
          reminderMinutes: 30,
          repeatRule: "none",
          location: "",
          url: "",
          note: "",
          visibility: "private",
          participantIdentityIds: [],
          imageUrls: [],
        },
        "calendar-create-1",
        requestContext,
      ),
    ).resolves.toBe(payload);

    expect(calendarRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerIdentityId: 17, idempotencyKey: "calendar-create-1" }),
      expect.objectContaining({ action: "calendar_event.create" }),
    );
  });

  it("keeps technician events isolated to the active technician identity", async () => {
    const calendarRepository = repository();
    calendarRepository.list.mockResolvedValue({ list: [payload], total: 1, page: 1, page_size: 20 });
    const service = new CalendarEventService(calendarRepository, audit);

    await expect(
      service.list(actor("technician"), {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-10-01T00:00:00.000Z"),
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ total: 1 });

    expect(calendarRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({ ownerIdentityId: 21 }),
    );
  });

  it("shares the customer calendar with the affiliate identity through the personal scope resolver", async () => {
    const calendarRepository = repository();
    calendarRepository.list.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
    const personalScope = {
      resolve: jest.fn(async () => ({
        identityId: 17,
        userId: 11,
        identityType: "customer",
        scopeType: "customer_profile",
        scopeId: 41,
      })),
    };
    const service = new CalendarEventService(calendarRepository, audit, personalScope);
    const affiliateActor = {
      ...actor("customer"),
      currentIdentityId: 71,
      currentIdentityType: "scout",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null,
    } as AuthenticatedAccessContext;

    await service.list(affiliateActor, {
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-10-01T00:00:00.000Z"),
      page: 1,
      pageSize: 20,
    });

    expect(personalScope.resolve).toHaveBeenCalledWith(affiliateActor);
    expect(calendarRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({ ownerIdentityId: 17 }),
    );
  });

  it("rejects merchant identities instead of creating a parallel merchant calendar", async () => {
    const calendarRepository = repository();
    const service = new CalendarEventService(calendarRepository, audit);

    await expect(
      service.list(actor("merchant"), {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-10-01T00:00:00.000Z"),
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(calendarRepository.list).not.toHaveBeenCalled();
  });

  it("maps stale updates to a version conflict without overwriting server data", async () => {
    const calendarRepository = repository();
    calendarRepository.update.mockResolvedValue({ outcome: "version_conflict" });
    const service = new CalendarEventService(calendarRepository, audit);

    await expect(
      service.update(
        actor("customer"),
        91,
        { expectedVersion: 1, title: "改名" },
        requestContext,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

