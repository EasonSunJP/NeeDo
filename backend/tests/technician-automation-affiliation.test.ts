import type { PrismaClient } from "@prisma/client";
import { TechnicianAutomationRepository } from "../src/repositories/technician-automation.repository";

const asClient = (value: unknown): PrismaClient => value as PrismaClient;

describe("technician automation shop-affiliation gates", () => {
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

  it("requires an active current shop before selecting request automation candidates", async () => {
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
      scheduleSlot: { findMany: jest.fn(async () => []) }
    };

    const repository = new TechnicianAutomationRepository(asClient(client));
    await expect(repository.loadRequestCandidates(601)).resolves.toEqual([]);
    expect(client.scheduleSlot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        technicianProfile: {
          is: expect.objectContaining({
            technicianShopAffiliations: {
              some: expect.objectContaining({ workStatus: "ACTIVE", endsAt: null, deletedAt: null })
            }
          })
        }
      })
    }));
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
});
