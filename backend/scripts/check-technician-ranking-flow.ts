import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const PAGE_SIZE = 100;
const TOKYO_TIME_ZONE = "Asia/Tokyo";

type SortBy = "revenue" | "completedOrders" | "workingDays";

interface IndependentRankingRow {
  technicianProfileId: number;
  completedServiceAmountJpy: number;
  completedOrderCount: number;
  workingDayCount: number;
}

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const sameNumber = (actual: number, expected: number, message: string): void => {
  assert(actual === expected, `${message}: expected ${expected}, received ${actual}`);
};

const tokyoDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TOKYO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const toTokyoCalendarDate = (value: Date): string => {
  const parts = tokyoDateFormatter.formatToParts(value);
  const part = (type: "year" | "month" | "day"): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const compareRankingRows = (sortBy: SortBy) => (left: IndependentRankingRow, right: IndependentRankingRow): number => {
  const selectedMetric = {
    revenue: "completedServiceAmountJpy",
    completedOrders: "completedOrderCount",
    workingDays: "workingDayCount"
  }[sortBy] as keyof IndependentRankingRow;
  const selectedDifference = right[selectedMetric] - left[selectedMetric];
  if (selectedDifference !== 0) return selectedDifference;

  const tieBreakers: Array<keyof Omit<IndependentRankingRow, "technicianProfileId">> = [
    "completedServiceAmountJpy",
    "completedOrderCount",
    "workingDayCount"
  ];
  for (const tieBreaker of tieBreakers) {
    if (tieBreaker === selectedMetric) continue;
    const difference = right[tieBreaker] - left[tieBreaker];
    if (difference !== 0) return difference;
  }

  return left.technicianProfileId - right.technicianProfileId;
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  assert(process.env.NODE_ENV !== "production", "ranking check cannot use NODE_ENV=production");
  const deployEnvironment = process.env.DEPLOY_ENV?.trim().toLowerCase();
  assert(
    deployEnvironment !== "prod" && deployEnvironment !== "production",
    "ranking check cannot use DEPLOY_ENV=prod or DEPLOY_ENV=production"
  );

  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1",
    "ranking check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(!/(^|[-_])prod(uction)?($|[-_])/i.test(databaseName), "ranking check rejects production-like database names");

  const [{ BackofficeRepository }, { resolveTechnicianRankingWindow }, { prisma, disconnectPrisma }] =
    await Promise.all([
      import("../src/repositories/backoffice.repository"),
      import("../src/services/backoffice.service"),
      import("../src/prisma/client")
    ]);

  try {
    const sourceOrders = await prisma.bookingOrder.findMany({
      where: {
        deletedAt: null,
        technicianProfileId: { not: null },
        technicianProfile: {
          is: {
            deletedAt: null,
            user: { is: { deletedAt: null } }
          }
        }
      },
      select: {
        id: true,
        technicianProfileId: true,
        status: true,
        paymentStatus: true,
        endsAt: true,
        financial: {
          select: {
            serviceAmountJpy: true,
            deletedAt: true
          }
        }
      }
    });

    const aggregates = new Map<
      number,
      IndependentRankingRow & { bookingIds: Set<number>; tokyoWorkingDates: Set<string> }
    >();
    for (const order of sourceOrders) {
      if (order.status !== "COMPLETED" || order.paymentStatus === "REFUNDED") continue;
      const technicianProfileId = order.technicianProfileId;
      if (!technicianProfileId) continue;
      const aggregate = aggregates.get(technicianProfileId) ?? {
        technicianProfileId,
        completedServiceAmountJpy: 0,
        completedOrderCount: 0,
        workingDayCount: 0,
        bookingIds: new Set<number>(),
        tokyoWorkingDates: new Set<string>()
      };
      aggregate.bookingIds.add(order.id);
      aggregate.tokyoWorkingDates.add(toTokyoCalendarDate(order.endsAt));
      if (order.financial?.deletedAt === null) {
        aggregate.completedServiceAmountJpy += order.financial.serviceAmountJpy;
      }
      aggregate.completedOrderCount = aggregate.bookingIds.size;
      aggregate.workingDayCount = aggregate.tokyoWorkingDates.size;
      aggregates.set(technicianProfileId, aggregate);
    }

    const expectedRows = [...aggregates.values()].map((aggregate) => ({
      technicianProfileId: aggregate.technicianProfileId,
      completedServiceAmountJpy: aggregate.completedServiceAmountJpy,
      completedOrderCount: aggregate.completedOrderCount,
      workingDayCount: aggregate.workingDayCount
    }));
    const expectedSummary = expectedRows.reduce(
      (summary, row) => ({
        technicianCount: summary.technicianCount + 1,
        completedServiceAmountJpy:
          summary.completedServiceAmountJpy + row.completedServiceAmountJpy,
        completedOrderCount: summary.completedOrderCount + row.completedOrderCount,
        workingDayCount: summary.workingDayCount + row.workingDayCount
      }),
      {
        technicianCount: 0,
        completedServiceAmountJpy: 0,
        completedOrderCount: 0,
        workingDayCount: 0
      }
    );
    const repository = new BackofficeRepository(prisma);
    const window = resolveTechnicianRankingWindow({ period: "all" });
    const sortedChecks: Record<string, { total: number; pages: number }> = {};

    for (const sortBy of ["revenue", "completedOrders", "workingDays"] as const) {
      const expected = [...expectedRows].sort(compareRankingRows(sortBy));
      const pageCount = Math.max(1, Math.ceil(expected.length / PAGE_SIZE));
      const actualRows = [] as Array<{
        rank: number;
        technicianProfileId: number;
        completedServiceAmountJpy: number;
        completedOrderCount: number;
        workingDayCount: number;
      }>;

      for (let page = 1; page <= pageCount; page += 1) {
        const result = await repository.listTechnicianRankings({
          scope: "platform",
          period: "all",
          sortBy,
          sortOrder: "desc",
          page,
          pageSize: PAGE_SIZE,
          window
        });
        sameNumber(result.total, expected.length, `${sortBy} total`);
        sameNumber(result.summary.technicianCount, expectedSummary.technicianCount, `${sortBy} summary technician count`);
        sameNumber(result.summary.completedServiceAmountJpy, expectedSummary.completedServiceAmountJpy, `${sortBy} summary revenue`);
        sameNumber(result.summary.completedOrderCount, expectedSummary.completedOrderCount, `${sortBy} summary completed orders`);
        sameNumber(result.summary.workingDayCount, expectedSummary.workingDayCount, `${sortBy} summary working days`);
        actualRows.push(...result.list);
      }

      assert(actualRows.length === expected.length, `${sortBy} list length does not match independent aggregation`);
      actualRows.forEach((actual, index) => {
        const expectedRow = expected[index];
        assert(expectedRow, `${sortBy} expected row ${index + 1} is missing`);
        sameNumber(actual.rank, index + 1, `${sortBy} rank for technician ${actual.technicianProfileId}`);
        sameNumber(actual.technicianProfileId, expectedRow.technicianProfileId, `${sortBy} technician at rank ${index + 1}`);
        sameNumber(actual.completedServiceAmountJpy, expectedRow.completedServiceAmountJpy, `${sortBy} revenue for technician ${actual.technicianProfileId}`);
        sameNumber(actual.completedOrderCount, expectedRow.completedOrderCount, `${sortBy} completed orders for technician ${actual.technicianProfileId}`);
        sameNumber(actual.workingDayCount, expectedRow.workingDayCount, `${sortBy} working days for technician ${actual.technicianProfileId}`);
      });
      sortedChecks[sortBy] = { total: expected.length, pages: pageCount };
    }

    const emptyPage = Math.ceil(expectedRows.length / PAGE_SIZE) + 2;
    const laterPage = await repository.listTechnicianRankings({
      scope: "platform",
      period: "all",
      sortBy: "revenue",
      sortOrder: "desc",
      page: emptyPage,
      pageSize: PAGE_SIZE,
      window
    });
    assert(laterPage.list.length === 0, "later ranking page must be empty");
    sameNumber(laterPage.total, expectedRows.length, "later page total");
    sameNumber(laterPage.summary.technicianCount, expectedSummary.technicianCount, "later page summary technician count");
    sameNumber(laterPage.summary.completedServiceAmountJpy, expectedSummary.completedServiceAmountJpy, "later page summary revenue");
    sameNumber(laterPage.summary.completedOrderCount, expectedSummary.completedOrderCount, "later page summary completed orders");
    sameNumber(laterPage.summary.workingDayCount, expectedSummary.workingDayCount, "later page summary working days");

    console.log(
      JSON.stringify(
        {
          database: databaseName,
          readOnly: true,
          sourceRows: {
            total: sourceOrders.length,
            refunded: sourceOrders.filter((order) => order.paymentStatus === "REFUNDED").length,
            incomplete: sourceOrders.filter((order) => order.status !== "COMPLETED").length
          },
          eligibleCompletedNonRefundedOrders: expectedSummary.completedOrderCount,
          summary: expectedSummary,
          checks: sortedChecks,
          emptyLaterPage: { page: emptyPage, verified: true },
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
