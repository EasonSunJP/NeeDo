import type { PrismaClient } from "@prisma/client";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";
import { resolveTechnicianRankingWindow } from "../src/services/backoffice.service";

const createRepository = (rows: unknown[]) => {
  const queryRaw = jest.fn(async (...args: unknown[]) => {
    void args;
    return rows;
  });
  const client = { $queryRaw: queryRaw } as unknown as PrismaClient;
  const repository = new BackofficeRepository(client);
  const listTechnicianRankings = (
    repository as unknown as {
      listTechnicianRankings?: (input: unknown) => Promise<unknown>;
    }
  ).listTechnicianRankings?.bind(repository);

  return { listTechnicianRankings, queryRaw };
};

describe("BackofficeRepository technician rankings", () => {
  it("maps final service amounts, unique orders, and unique Tokyo working days", async () => {
    const { listTechnicianRankings, queryRaw } = createRepository([
      {
        technician_profile_id: 31,
        user_id: 61,
        display_name: "Mika Tanaka",
        email: "mika@example.com",
        avatar_url: "https://example.com/mika.png",
        shop_id: 11,
        shop_name: "Aoyama Care Studio",
        city: "Tokyo",
        service_area: "Minato",
        status: "published",
        verified_at: new Date("2026-08-01T00:00:00.000Z"),
        revenue_jpy: 15_000n,
        completed_orders: 2n,
        working_days: 1n,
        ranking_position: 1n,
        total_technicians: 1n,
        total_revenue_jpy: 15_000n,
        total_completed_orders: 2n,
        total_working_days: 1n
      }
    ]);
    expect(listTechnicianRankings).toEqual(expect.any(Function));
    if (!listTechnicianRankings) return;

    const result = await listTechnicianRankings({
      scope: "platform",
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      sortBy: "revenue",
      sortOrder: "desc",
      keyword: "Mika",
      shopId: 11,
      city: "Tokyo",
      page: 1,
      pageSize: 20,
      window: resolveTechnicianRankingWindow({
        period: "custom",
        from: "2026-08-01",
        to: "2026-08-31"
      })
    });

    expect(result).toEqual({
      list: [
        {
          rank: 1,
          technicianProfileId: 31,
          userId: 61,
          displayName: "Mika Tanaka",
          email: "mika@example.com",
          avatarUrl: "https://example.com/mika.png",
          shopId: 11,
          shopName: "Aoyama Care Studio",
          city: "Tokyo",
          serviceArea: "Minato",
          status: "published",
          verifiedAt: "2026-08-01T00:00:00.000Z",
          completedServiceAmountJpy: 15_000,
          completedOrderCount: 2,
          workingDayCount: 1
        }
      ],
      summary: {
        technicianCount: 1,
        completedServiceAmountJpy: 15_000,
        completedOrderCount: 2,
        workingDayCount: 1
      },
      total: 1,
      page: 1,
      page_size: 20
    });

    const query = queryRaw.mock.calls[0]?.[0] as { sql?: string; values?: unknown[] };
    expect(query.sql).toContain("SUM(financial.service_amount_jpy)");
    expect(query.sql).toContain("COUNT(DISTINCT booking.id)");
    expect(query.sql).toContain("DATE_ADD(booking.ends_at, INTERVAL 9 HOUR)");
    expect(query.sql).toContain("booking.status =");
    expect(query.sql).toContain("booking.payment_status <>");
    expect(query.values).toEqual(
      expect.arrayContaining([
        "completed",
        "refunded",
        new Date("2026-07-31T15:00:00.000Z"),
        new Date("2026-08-31T15:00:00.000Z"),
        "%Mika%",
        11,
        "Tokyo",
        20,
        0
      ])
    );
  });

  it("returns an empty, paginated summary when no technician completed an order", async () => {
    const { listTechnicianRankings } = createRepository([]);
    expect(listTechnicianRankings).toEqual(expect.any(Function));
    if (!listTechnicianRankings) return;

    await expect(
      listTechnicianRankings({
        scope: "platform",
        period: "all",
        sortBy: "revenue",
        sortOrder: "desc",
        page: 2,
        pageSize: 10,
        window: resolveTechnicianRankingWindow({ period: "all" })
      })
    ).resolves.toEqual({
      list: [],
      summary: {
        technicianCount: 0,
        completedServiceAmountJpy: 0,
        completedOrderCount: 0,
        workingDayCount: 0
      },
      total: 0,
      page: 2,
      page_size: 10
    });
  });
});
