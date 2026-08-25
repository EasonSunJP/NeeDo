import type { PrismaClient } from "@prisma/client";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";

const date = (value: string) => new Date(value);
const money = (value: number) => ({ toString: () => String(value) });

const booking = (id: number, status: string, shopId = 11) => ({
  id,
  orderNo: `ND20260825${id}`,
  status,
  paymentStatus: "CONFIRMED",
  customerUserId: 51,
  customer: { username: "Customer", email: "customer@example.com" },
  serviceId: 71,
  serviceNameSnapshot: "Formal care",
  service: { name: "Formal care" },
  shopId,
  shop: { name: "Aoyama Care Studio" },
  technicianProfileId: 31,
  technicianProfile: { displayName: "Technician" },
  fulfillmentMode: "store",
  priceAmount: money(9000),
  currency: "JPY",
  startsAt: date("2026-08-26T01:00:00.000Z"),
  endsAt: date("2026-08-26T02:00:00.000Z"),
  note: null,
  cancelReason: null,
  createdAt: date("2026-08-25T01:00:00.000Z"),
  updatedAt: date("2026-08-25T01:00:00.000Z")
});

function createClient(withTechnicianReview = true) {
  const technician = {
    id: 31,
    userId: 61,
    displayName: "Technician",
    bio: "Formal technician profile",
    city: "Tokyo",
    serviceArea: "Minato",
    yearsExperience: 8,
    status: "published",
    isRecommended: true,
    verifiedAt: date("2026-08-01T00:00:00.000Z"),
    createdAt: date("2026-08-01T00:00:00.000Z"),
    updatedAt: date("2026-08-24T00:00:00.000Z"),
    shopId: 11,
    shop: { name: "Aoyama Care Studio" },
    reviewSummary: withTechnicianReview
      ? {
          ratingAverage: money(4.8),
          reviewCount: 12,
          latestReviewAt: date("2026-08-20T00:00:00.000Z"),
          highlights: ["Careful"],
          deletedAt: null
        }
      : null,
    user: {
      username: "Technician account",
      email: "technician@example.com",
      phone: null,
      avatarUrl: null,
      isActive: true,
      lastLoginAt: date("2026-08-20T00:00:00.000Z"),
      userRoles: [
        {
          scopeType: "shop",
          scopeId: 11,
          role: { name: "Technician", code: "technician" }
        }
      ],
      identities: [
        { type: "technician", scopeType: "shop", scopeId: 11, displayName: "Technician" }
      ]
    }
  };
  const customer = {
    id: 41,
    userId: 51,
    displayName: "Customer",
    bio: "Formal customer profile",
    city: "Tokyo",
    membershipLevel: "standard",
    isPublic: true,
    createdAt: date("2026-08-01T00:00:00.000Z"),
    updatedAt: date("2026-08-24T00:00:00.000Z"),
    reviewSummary: null,
    user: {
      username: "Customer account",
      email: "customer@example.com",
      phone: null,
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      userRoles: [
        { scopeType: "shop", scopeId: 11, role: { name: "Customer", code: "customer" } },
        { scopeType: "shop", scopeId: 22, role: { name: "Other shop", code: "other" } }
      ],
      identities: [
        { type: "customer", scopeType: "global", scopeId: null, displayName: "Customer" }
      ]
    }
  };
  const client = {
    technicianProfile: { findFirst: jest.fn(async () => technician) },
    customerProfile: { findFirst: jest.fn(async () => customer) },
    bookingOrder: {
      groupBy: jest.fn(async () => [
        { status: "COMPLETED", _count: { _all: 2 } },
        { status: "CANCELLED", _count: { _all: 1 } }
      ]),
      aggregate: jest.fn(async () => ({ _sum: { priceAmount: money(18000) } })),
      findMany: jest.fn(async () => [booking(1, "COMPLETED"), booking(2, "CONFIRMED")])
    },
    scheduleSlot: { findMany: jest.fn(async () => []) },
    technicianService: { findMany: jest.fn(async () => []) },
    service: { findMany: jest.fn(async () => []) },
    technicianCompensationProfile: { findFirst: jest.fn(async () => null) },
    auditLog: { findMany: jest.fn(async () => []) }
  };

  return { client: client as unknown as Pick<PrismaClient, keyof typeof client> };
}

describe("BackofficeRepository profile details", () => {
  it("maps only formal technician detail records inside merchant scope", async () => {
    const { client } = createClient();
    const repository = new BackofficeRepository(client as PrismaClient);

    const detail = await repository.getTechnicianDetail({ scope: "merchant", shopId: 11, id: 31 });

    expect(client.technicianProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 31, shopId: 11, deletedAt: null } })
    );
    expect(detail).toMatchObject({
      id: 31,
      account: { email: "technician@example.com", isActive: true },
      statistics: { bookingCount: 3, completedCount: 2, completedRevenueJpy: 18000 },
      reviewSummary: { ratingAverage: 4.8, reviewCount: 12 },
      unavailableMetrics: ["acceptanceRate", "lateness", "shiftPreferences"]
    });
  });

  it("limits merchant customer bookings, totals, roles, identities, and timeline to its shop", async () => {
    const { client } = createClient();
    const repository = new BackofficeRepository(client as PrismaClient);

    const detail = await repository.getCustomerDetail({ scope: "merchant", shopId: 11, id: 41 });

    expect(client.bookingOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerUserId: 51, shopId: 11 }) })
    );
    expect(detail?.recentBookings).toHaveLength(2);
    expect(detail?.account.roles).toEqual([
      expect.objectContaining({ scopeType: "shop", scopeId: 11 })
    ]);
  });

  it("returns null formal sections without inventing compensation, reviews, or schedule", async () => {
    const { client } = createClient(false);
    const repository = new BackofficeRepository(client as PrismaClient);

    const detail = await repository.getTechnicianDetail({ scope: "merchant", shopId: 11, id: 31 });

    expect(detail).toMatchObject({
      compensationProfile: null,
      reviewSummary: null,
      upcomingSchedule: []
    });
  });
});
