import { Prisma, type PrismaClient } from "@prisma/client";
import { TechnicianAutomationRepository } from "../src/repositories/technician-automation.repository";
import { defaultTechnicianAutomationRules } from "../src/validators/technician-automation.validator";

const asClient = (value: unknown): PrismaClient => value as PrismaClient;

describe("technician automation shop-affiliation gates", () => {
  it.each([
    ["on_duty", 77, true],
    ["in_service", 77, false],
    ["on_duty", 78, null],
    ["off_duty", 77, false]
  ] as const)(
    "projects the formal %s work state for shop %s to Booking automation online=%s",
    async (status, stateShopId, expectedOnline) => {
      const startsAt = new Date("2026-09-10T03:00:00.000Z");
      const endsAt = new Date("2026-09-10T04:00:00.000Z");
      const client = {
        bookingOrder: {
          findFirst: jest.fn(async () => ({
            id: 501,
            status: "PENDING",
            shopId: 77,
            customerUserId: 9,
            technicianProfileId: 31,
            serviceId: 101,
            technicianServiceId: null,
            startsAt,
            endsAt,
            priceAmount: { toString: () => "12000" },
            fulfillmentMode: "store",
            paymentMethod: "ONSITE",
            serviceLocation: null,
            scheduleSlot: {
              availabilityId: 81,
              startsAt,
              endsAt,
              deletedAt: null,
              availability: { startsAt, endsAt, isActive: true, deletedAt: null }
            },
            technicianProfile: {
              id: 31,
              userId: 7,
              status: "published",
              verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
              deletedAt: null,
              workStates: [{ status, shopId: stateShopId, deletedAt: null }],
              user: { isActive: true, deletedAt: null },
              automationSettings: [
                {
                  id: 1,
                  version: 1,
                  rules: { ...defaultTechnicianAutomationRules("booking"), minLeadMinutes: 0 }
                }
              ],
              technicianShopAffiliations: [{ shopId: 77 }]
            }
          })),
          count: jest.fn(async () => 0)
        },
        userIdentity: {
          findFirst: jest.fn(async () => ({
            id: 17,
            publicIdentifier: { publicId: "s0000000031" }
          }))
        },
        availability: { count: jest.fn(async () => 1) },
        customerProfile: { findUnique: jest.fn(async () => null) },
        ekycVerification: { count: jest.fn(async () => 0) },
        contact: { findFirst: jest.fn(async () => null) }
      };

      const repository = new TechnicianAutomationRepository(asClient(client));
      const candidate = await repository.loadBookingCandidate(501);

      expect(candidate?.context.technicianOnline).toBe(expectedOnline);
      expect(candidate?.context.hardBlockReasons).toEqual(
        expectedOnline
          ? expect.not.arrayContaining(["technician_not_on_duty"])
          : expect.arrayContaining(["technician_not_on_duty"])
      );
    }
  );

  it("does not load booking automation when the technician is no longer active in that order's shop", async () => {
    const client = {
      bookingOrder: {
        findFirst: jest.fn(async () => ({
          id: 501,
          status: "PENDING",
          shopId: 77,
          customerUserId: 9,
          technicianProfileId: 31,
          serviceId: 101,
          technicianServiceId: null,
          startsAt: new Date("2026-09-10T03:00:00.000Z"),
          endsAt: new Date("2026-09-10T04:00:00.000Z"),
          priceAmount: { toString: () => "12000" },
          fulfillmentMode: "store",
          paymentMethod: "ONSITE",
          serviceLocation: null,
          scheduleSlot: {
            startsAt: new Date("2026-09-10T03:00:00.000Z"),
            endsAt: new Date("2026-09-10T04:00:00.000Z"),
            deletedAt: null
          },
          technicianProfile: {
            id: 31,
            userId: 7,
            status: "published",
            verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
            deletedAt: null,
            user: { isActive: true, deletedAt: null },
            automationSettings: [{ id: 1, version: 1, rules: {} }],
            technicianShopAffiliations: []
          }
        }))
      },
      userIdentity: { findFirst: jest.fn() }
    };

    const repository = new TechnicianAutomationRepository(asClient(client));
    await expect(repository.loadBookingCandidate(501)).resolves.toBeNull();
    expect(client.userIdentity.findFirst).not.toHaveBeenCalled();
  });

  it("requires an active current shop without discarding offline candidates before rule evaluation", async () => {
    const client = {
      exchangePost: {
        findFirst: jest.fn(async () => ({
          id: 601,
          authorUserId: 9,
          serviceStartAt: new Date("2026-09-10T03:00:00.000Z"),
          serviceEndAt: new Date("2026-09-10T04:00:00.000Z"),
          areaLabel: "JP-13/minato",
          demand: { budgetMaxJpy: 12000, serviceMode: "STORE" }
        }))
      },
      scheduleSlot: {
        findMany: jest.fn(async (input: unknown) => {
          void input;
          return [];
        })
      }
    };

    const repository = new TechnicianAutomationRepository(asClient(client));
    await expect(repository.loadRequestCandidates(601)).resolves.toEqual([]);
    const query = client.scheduleSlot.findMany.mock.calls[0][0] as {
      where: { technicianProfile: { is: Record<string, unknown> } };
    };
    expect(query).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        technicianProfile: {
          is: expect.objectContaining({
            technicianShopAffiliations: {
              some: expect.objectContaining({
                workStatus: "ACTIVE", activeKey: { not: null }, deletedAt: null,
                OR: [{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }]
              })
            }
          })
        }
      })
    }));
    expect(query.where.technicianProfile.is).not.toHaveProperty("workStates");
  });

  it("returns an idempotent replay without issuing a duplicate decision insert", async () => {
    const client = {
      technicianAutomationDecisionLog: {
        findUnique: jest.fn(async () => ({ id: 91 })),
        create: jest.fn()
      }
    };
    const repository = new TechnicianAutomationRepository(asClient(client));
    await expect(repository.reserveDecision({
      settingId: 1,
      technicianProfileId: 31,
      kind: "booking",
      targetType: "booking_order",
      targetId: 501,
      actionType: "accept_booking",
      ruleVersion: 3,
      idempotencyKey: "booking:501:31:accept_booking"
    })).resolves.toBe(false);
    expect(client.technicianAutomationDecisionLog.create).not.toHaveBeenCalled();
  });

  it.each(["NOT_MATCHED", "ACTION_FAILED"] as const)(
    "reopens a %s decision when new evidence or a retry triggers evaluation",
    async (outcome) => {
      const client = {
        technicianAutomationDecisionLog: {
          findUnique: jest.fn(async () => ({ id: 91, outcome })),
          updateMany: jest.fn(async () => ({ count: 1 })),
          create: jest.fn()
        }
      };
      const repository = new TechnicianAutomationRepository(asClient(client));
      await expect(repository.reserveDecision({
        settingId: 1,
        technicianProfileId: 31,
        kind: "booking",
        targetType: "booking_order",
        targetId: 501,
        actionType: "accept_booking",
        ruleVersion: 3,
        idempotencyKey: "booking:501:31:accept_booking"
      })).resolves.toBe(true);
      expect(client.technicianAutomationDecisionLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 91, outcome },
        data: expect.objectContaining({ outcome: "MATCHED", failedReasons: [] })
      }));
    }
  );

  it("lets the decision unique key serialize concurrent reservations", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate decision", {
      code: "P2002",
      clientVersion: "7.10.0",
      meta: { modelName: "TechnicianAutomationDecisionLog" }
    });
    const client = {
      technicianAutomationDecisionLog: {
        findUnique: jest.fn(async () => null),
        create: jest.fn()
          .mockResolvedValueOnce({ id: 91 })
          .mockRejectedValueOnce(duplicate)
      }
    };
    const repository = new TechnicianAutomationRepository(asClient(client));
    const input = {
      settingId: 1,
      technicianProfileId: 31,
      kind: "booking" as const,
      targetType: "booking_order" as const,
      targetId: 501,
      actionType: "accept_booking" as const,
      ruleVersion: 3,
      idempotencyKey: "booking:501:31:accept_booking"
    };

    await expect(Promise.all([
      repository.reserveDecision(input),
      repository.reserveDecision(input)
    ])).resolves.toEqual([true, false]);
  });
});
