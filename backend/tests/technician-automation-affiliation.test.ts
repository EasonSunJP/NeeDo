import { Prisma, type PrismaClient } from "@prisma/client";
import { TechnicianAutomationRepository } from "../src/repositories/technician-automation.repository";
import { defaultTechnicianAutomationRules } from "../src/validators/technician-automation.validator";
import { ExchangeClaimRepository } from "../src/repositories/exchange-claim.repository";

const asClient = (value: unknown): PrismaClient => value as PrismaClient;

describe("technician automation shop-affiliation gates", () => {
  it("finds a dynamic Request candidate when no persisted schedule slot exists", async () => {
    const now = new Date();
    const startsAt = new Date(now.getTime() + 3_600_000);
    const endsAt = new Date(now.getTime() + 7_200_000);
    const postEndAt = new Date(now.getTime() + 4 * 3_600_000);
    const profiles = Array.from({ length: 26 }, (_, index) => ({
      id: 31 + index,
      gender: index % 2 === 0 ? "female" : "male",
      userId: 100 + index,
      workStates: [{ shopId: 11, status: "on_duty" }],
      technicianShopAffiliations: [{ shopId: 11 }],
      automationSettings: [{ id: 1 + index, version: 1, rules: defaultTechnicianAutomationRules("request") }]
    }));
    const listDynamic = jest.spyOn(ExchangeClaimRepository.prototype, "listDynamicOptions")
      .mockImplementation(async (_input, _take, _technicianIds, visit) => {
        for (const profile of profiles) visit?.({
          scheduleSlotId: -1048578 - profile.id,
          shop: { id: 11, name: "Shop" },
          technician: { profileId: profile.id, publicId: `s${profile.id}`, displayName: "Technician" },
          service: { ref: "technician:701", name: "Service", durationMinutes: 60 },
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString()
        });
        return { list: [], total: profiles.length };
      });
    const noConflict = jest.spyOn(ExchangeClaimRepository.prototype, "hasConflictingBooking")
      .mockResolvedValue(false);
    const noClaim = jest.spyOn(ExchangeClaimRepository.prototype, "hasOverlappingActiveClaim")
      .mockResolvedValue(false);
    const noMatch = jest.spyOn(ExchangeClaimRepository.prototype, "hasOverlappingMatchParticipant")
      .mockResolvedValue(false);
    const client = {
      exchangePost: { findFirst: jest.fn(async () => ({
        id: 601, authorUserId: 9, serviceStartAt: startsAt, serviceEndAt: postEndAt,
        areaLabel: "Tokyo", servicePrepayment: null,
        demand: { budgetMode: "TOTAL", targetProviderCount: 1, budgetMaxJpy: 12000,
          serviceMode: "STORE", preferredTechnicianGender: "any" }
      })) },
      scheduleSlot: { findMany: jest.fn(async () => []) },
      availability: { findMany: jest.fn(async (args?: { where?: { technicianProfileId?: number } }) =>
        profiles.filter((profile) => typeof args?.where?.technicianProfileId !== "number"
          || profile.id === args.where.technicianProfileId).map((profile) => ({
          id: profile.id, technicianProfileId: profile.id, shopId: 11,
          startsAt: now, endsAt: postEndAt
        }))) },
      technicianProfile: { findMany: jest.fn(async (args?: { where?: { id?: number; gender?: string } }) =>
        profiles.filter((profile) => (typeof args?.where?.id !== "number" || profile.id === args.where.id)
          && (!args?.where?.gender || profile.gender === args.where.gender))) },
      userIdentity: { findMany: jest.fn(async () => profiles.map((profile) => ({
        id: profile.id + 100, scopeId: profile.id,
        publicIdentifier: { publicId: `s${profile.id}` }
      }))) },
      customerProfile: { findUnique: jest.fn(async () => null) },
      bookingOrder: { count: jest.fn(async () => 0) },
      technicianAutomationSetting: { findMany: jest.fn(async (): Promise<Array<{ technicianProfileId: number; rules: ReturnType<typeof defaultTechnicianAutomationRules> }>> => []) },
      technicianService: { findMany: jest.fn(async () => Array.from({ length: 52 }, (_, index) => ({ id: 701 + index, priceAmount: 8_800 }))) },
      service: { findMany: jest.fn(async () => []) },
      ekycVerification: { count: jest.fn(async () => 0) },
      contact: { findMany: jest.fn(async () => []) }
    };
    try {
      const repository = new TechnicianAutomationRepository(asClient(client));
      const candidates = await repository.loadRequestCandidates(601);
      expect(candidates).toHaveLength(26);
      expect(candidates).toEqual(expect.arrayContaining([expect.objectContaining({
        scheduleSlotId: -1048578 - 31,
        serviceRef: "technician:701",
        technicianProfileId: 31,
        quoteAmountJpy: 8_800
      })]));
      expect(listDynamic).toHaveBeenCalledTimes(1);
      expect(listDynamic).toHaveBeenCalledWith(expect.objectContaining({
        scope: { kind: "merchant", shopId: 11 }
      }), 0, profiles.map((profile) => profile.id), expect.any(Function));
      client.exchangePost.findFirst.mockResolvedValueOnce({
        id: 601, authorUserId: 9, serviceStartAt: startsAt, serviceEndAt: postEndAt,
        areaLabel: "Tokyo", servicePrepayment: null,
        demand: { budgetMode: "TOTAL", targetProviderCount: 1, budgetMaxJpy: 12000,
          serviceMode: "STORE", preferredTechnicianGender: "female" }
      });
      const femaleCandidates = await repository.loadRequestCandidates(601);
      expect(femaleCandidates).toHaveLength(13);
      expect(femaleCandidates.every((candidate) => profiles.find((profile) => profile.id === candidate.technicianProfileId)?.gender === "female")).toBe(true);
      expect(client.technicianProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ gender: "female" })
      }));
      listDynamic.mockClear();
      client.technicianAutomationSetting.findMany.mockResolvedValueOnce([{
        technicianProfileId: 31,
        rules: { ...defaultTechnicianAutomationRules("booking"), minLeadMinutes: 60 }
      }]);
      const insufficientLead = await repository.loadRequestCandidates(601);
      expect(insufficientLead).toHaveLength(25);
      expect(insufficientLead.some((candidate) => candidate.technicianProfileId === 31)).toBe(false);
      listDynamic.mockClear();
      const selected = await repository.loadRequestCandidates(601, {
        technicianProfileId: 31,
        scheduleSlotId: -1048578 - 31,
        serviceRef: "technician:701"
      });
      expect(selected).toHaveLength(1);
      expect(listDynamic).toHaveBeenCalledTimes(1);
      expect(listDynamic).toHaveBeenCalledWith(expect.objectContaining({
        shopId: 11,
        scope: { kind: "technician", technicianProfileId: 31 },
        serviceRef: "technician:701"
      }), 0, [31], expect.any(Function));
      client.scheduleSlot.findMany.mockImplementationOnce(async () => ([{
        id: 91, shopId: 11, technicianProfileId: 31, startsAt, endsAt,
        availabilityId: 31, bookedCount: 0, capacity: 1,
        service: null,
        technicianService: { id: 701, shopId: 11, technicianId: 31 },
        technicianProfile: profiles[0]
      }] as never));
      const withMaterializedSlot = await repository.loadRequestCandidates(601);
      expect(withMaterializedSlot).toHaveLength(26);
      expect(withMaterializedSlot).toEqual(expect.arrayContaining([expect.objectContaining({
        scheduleSlotId: 91, technicianProfileId: 31
      })]));
      profiles[0].automationSettings[0].rules = {
        ...profiles[0].automationSettings[0].rules, serviceIds: [752]
      };
      listDynamic.mockImplementationOnce(async (_input, _take, _technicianIds, visit) => {
        for (const profile of profiles) {
          for (let service = 0; service < 52; service += 1) {
            for (let offset = 0; offset < 25; offset += 1) {
              const start = new Date(startsAt.getTime() + offset * 5 * 60_000);
              visit?.({
                scheduleSlotId: -1048578 - profile.id - offset * 1000,
                shop: { id: 11, name: "Shop" },
                technician: { profileId: profile.id, publicId: `s${profile.id}`, displayName: "Technician" },
                service: { ref: `technician:${701 + service}`, name: "Service", durationMinutes: 60 },
                startsAt: start.toISOString(),
                endsAt: new Date(start.getTime() + 60 * 60_000).toISOString()
              });
            }
          }
        }
        return { list: [], total: 33_800 };
      });
      const streamedCandidates = await repository.loadRequestCandidates(601);
      expect(streamedCandidates).toHaveLength(26);
      expect(streamedCandidates).toEqual(expect.arrayContaining([expect.objectContaining({
        scheduleSlotId: -1048578 - 31, serviceRef: "technician:752",
        technicianProfileId: 31
      })]));
    } finally {
      listDynamic.mockRestore();
      noConflict.mockRestore();
      noClaim.mockRestore();
      noMatch.mockRestore();
    }
  });

  it("does not evaluate a Request after its service window has passed", async () => {
    const past = new Date(Date.now() - 60_000);
    const findMany = jest.fn(async () => []);
    const repository = new TechnicianAutomationRepository(asClient({
      exchangePost: { findFirst: jest.fn(async () => ({
        id: 601, authorUserId: 9, serviceStartAt: new Date(past.getTime() - 3_600_000),
        serviceEndAt: past, servicePrepayment: null,
        demand: { budgetMode: "TOTAL", budgetMaxJpy: 12000, targetProviderCount: 1 }
      })) },
      scheduleSlot: { findMany }
    }));
    await expect(repository.loadRequestCandidates(601)).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
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
          serviceStartAt: new Date(Date.now() + 3_600_000),
          serviceEndAt: new Date(Date.now() + 7_200_000),
          areaLabel: "JP-13/minato",
          demand: { budgetMaxJpy: 12000, serviceMode: "STORE" }
        }))
      },
      scheduleSlot: {
        findMany: jest.fn(async (input: unknown) => {
          void input;
          return [];
        })
      },
      availability: { findMany: jest.fn(async () => []) }
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
