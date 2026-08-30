import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("backoffice dashboard named activity summary", () => {
  it("delegates to the formal aggregate without loading preview rows", async () => {
    const window = resolveDashboardWindow(
      { period: "last7days" },
      new Date("2026-08-31T03:00:00.000Z")
    );
    const client = {
      bookingOrder: {
        count: jest.fn(async () => 7),
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { priceAmount: 15_000 } })
          .mockResolvedValueOnce({ _sum: { priceAmount: 12_000 } })
      },
      scheduleSlot: {
        count: jest.fn().mockResolvedValueOnce(30).mockResolvedValueOnce(24)
      },
      customerProfile: {
        count: jest.fn().mockResolvedValueOnce(9).mockResolvedValueOnce(6)
      },
      shop: {
        count: jest.fn().mockResolvedValueOnce(11).mockResolvedValueOnce(10)
      },
      $queryRaw: jest.fn(async (query: { sql?: string }) => {
        if (query.sql?.includes("dashboard_registered_technicians")) {
          return [
            { periodKey: "current", aggregateValue: 106n },
            { periodKey: "previous", aggregateValue: 100n }
          ];
        }
        return [];
      })
    };
    const repository = new BackofficeRepository(client as never);

    const dashboard = await repository.getDashboard({
      scope: { kind: "platform" },
      city: null,
      window
    });

    expect(dashboard.current).toMatchObject({
      availableScheduleSlots: 30,
      registeredTechnicians: 106,
      shopCount: 11,
      newCustomers: 9,
      pendingOrders: 7,
      serviceGmvJpy: 15_000
    });
    expect(dashboard.previous).toMatchObject({
      availableScheduleSlots: 24,
      registeredTechnicians: 100,
      shopCount: 10,
      newCustomers: 6,
      serviceGmvJpy: 12_000
    });
    expect(client.bookingOrder).not.toHaveProperty("findMany");
    expect(client.shop).not.toHaveProperty("findMany");
    expect(client.scheduleSlot.count).toHaveBeenCalledTimes(2);
  });
});
