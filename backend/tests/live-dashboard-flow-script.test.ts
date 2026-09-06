import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LiveDashboardSnapshotFacts } from "../src/domain/live-dashboard";
import type { LiveDashboardSnapshotResponse } from "../src/services/live-dashboard.service";
import { LIVE_DASHBOARD_CACHE_TTL_SECONDS } from "../src/services/live-dashboard-cache.service";
import {
  assertCacheLifecycle,
  assertCompleteSnapshotParity,
  assertSsePrivacy,
  buildDeterministicRunMarker,
  cleanupRedis,
  loadLiveDashboardCheckerAuthority,
  redactCheckerError
} from "../scripts/check-live-dashboard-flow";

const scriptPath = path.join(process.cwd(), "scripts/check-live-dashboard-flow.ts");

describe("live dashboard formal-flow checker contract", () => {
  const tempDirectories: string[] = [];

  afterAll(() => {
    for (const directory of tempDirectories) fs.rmSync(directory, { recursive: true, force: true });
  });

  const createEnvFile = (overrides: Record<string, string> = {}): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "needo-live-dashboard-"));
    tempDirectories.push(directory);
    const values = {
      NODE_ENV: "development",
      DEPLOY_ENV: "local",
      DATABASE_URL: "mysql://formal:private@127.0.0.1:3307/needo_test",
      REDIS_URL: "rediss://formal:private@localhost:6379/8",
      ...overrides
    };
    const envPath = path.join(directory, "formal-check.env");
    fs.writeFileSync(
      envPath,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")
    );
    return envPath;
  };

  it("fails closed and keeps the fixture run deterministic and rollback-only", () => {
    const source = fs.readFileSync(scriptPath, "utf8");

    expect(source).toContain("FORMAL_BACKEND_ENV_FILE is required");
    expect(source).toContain("LIVE_DASHBOARD_CHECK_ROLLBACK");
    expect(source).toContain("LIVE_DASHBOARD_CHECK_ROLLBACK=true is required");
    expect(source).toContain("production");
    expect(source).toContain("staging");
    expect(source).toContain("live");
    expect(source).toContain("$transaction");
    expect(source).toContain("dashboard:live:v1:");
    expect(source).toContain("backoffice:dashboard:read");
    expect(source).not.toContain("Math.random");
  });

  it("proves every required formal data and cleanup section", () => {
    const source = fs.readFileSync(scriptPath, "utf8");

    for (const section of [
      "schema",
      "bookingLocation",
      "regionalAggregates",
      "financeSeparation",
      "cache",
      "sse",
      "cleanup",
      "final"
    ]) {
      expect(source).toContain(`section: "${section}"`);
    }

    expect(source).toContain("N03-20260101");
    expect(source).toContain("13104");
    expect(source).toContain("UNRESOLVED");
    expect(source).toContain("xDel");
    expect(source).toContain('database: "clean"');
    expect(source).toContain('redis: "clean"');
  });

  it("uses current-main future slots and bound travel evidence for the home fixture", () => {
    const source = fs.readFileSync(scriptPath, "utf8");
    expect(source).toContain("const fixtureBookingTime = Date.now();");
    expect(source).toContain("fixtureBookingTime + (120 + index * 90) * 60_000");
    expect(source).toContain("transaction.shopTravelFarePolicyVersion.create");
    expect(source).toContain("transaction.routeEstimate.create");
    expect(source).toContain("travelEstimatePublicId: homeTravelEstimate.publicId");
    expect(source).toContain('"order" in storeResult && "order" in homeResult');
    expect(source).toContain('entityPredicate: Prisma.sql`candidate.customer_is_test = FALSE');
  });

  it("checks complete snapshot parity, all cache periods, and failure-path cleanup", () => {
    const source = fs.readFileSync(scriptPath, "utf8");

    expect(source).toContain("assertCompleteSnapshotParity");
    expect(source).toContain("directSnapshotFacts");
    expect(source).toContain("LIVE_DASHBOARD_CACHE_TTL_SECONDS");
    expect(source).toContain("allPeriodCacheState");
    expect(source).toContain("cleanupFailures");
    expect(source).toContain("primaryFailure");
    expect(source).toContain("forbiddenSentinels");
  });

  it("exposes the checker only through the named package command", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["check:live-dashboard"]).toBe(
      "tsx scripts/check-live-dashboard-flow.ts"
    );
  });

  it("behaviorally fails closed for explicit rollback-safe non-production authority", () => {
    const envPath = createEnvFile();
    expect(() => loadLiveDashboardCheckerAuthority({})).toThrow(
      "FORMAL_BACKEND_ENV_FILE is required"
    );
    expect(() => loadLiveDashboardCheckerAuthority({ FORMAL_BACKEND_ENV_FILE: envPath })).toThrow(
      "LIVE_DASHBOARD_CHECK_ROLLBACK=true is required"
    );
    expect(() =>
      loadLiveDashboardCheckerAuthority({
        FORMAL_BACKEND_ENV_FILE: envPath,
        LIVE_DASHBOARD_CHECK_ROLLBACK: "true",
        NODE_ENV: "production"
      })
    ).toThrow("refuses a production, staging, or live runtime");

    const stagingPath = createEnvFile({ DEPLOY_ENV: "staging" });
    expect(() =>
      loadLiveDashboardCheckerAuthority({
        FORMAL_BACKEND_ENV_FILE: stagingPath,
        LIVE_DASHBOARD_CHECK_ROLLBACK: "true"
      })
    ).toThrow("refuses a production, staging, or live runtime");

    const remotePath = createEnvFile({
      DATABASE_URL: "mysql://formal:private@db.example.test:3306/needo_test"
    });
    expect(() =>
      loadLiveDashboardCheckerAuthority({
        FORMAL_BACKEND_ENV_FILE: remotePath,
        LIVE_DASHBOARD_CHECK_ROLLBACK: "true"
      })
    ).toThrow("must use a loopback host");

    expect(
      loadLiveDashboardCheckerAuthority({
        FORMAL_BACKEND_ENV_FILE: envPath,
        LIVE_DASHBOARD_CHECK_ROLLBACK: "true"
      })
    ).toMatchObject({ databaseName: "needo_test", redisDatabase: "8" });
  });

  it("requires a deterministic collision-resistant run token and redacts all service URLs", () => {
    expect(() => buildDeterministicRunMarker(undefined)).toThrow(
      "LIVE_DASHBOARD_CHECK_RUN_ID is required"
    );
    expect(() => buildDeterministicRunMarker("PID-123")).toThrow(
      "must be a lowercase deterministic token"
    );
    expect(buildDeterministicRunMarker("task8-local-a")).toBe(
      buildDeterministicRunMarker("task8-local-a")
    );
    expect(buildDeterministicRunMarker("task8-local-a")).not.toBe(
      buildDeterministicRunMarker("task8-local-b")
    );

    const redacted = redactCheckerError(
      "mysql://user:mysql-secret@localhost/db redis://user:redis-secret@localhost/0 rediss://user:tls-secret@localhost/1"
    );
    expect(redacted).not.toMatch(/mysql-secret|redis-secret|tls-secret/u);
    expect(redacted.match(/\[redacted-url\]/gu)).toHaveLength(3);
  });

  it("compares every snapshot section without calling the production repository", () => {
    const facts: LiveDashboardSnapshotFacts = {
      evaluatedAt: new Date("2026-09-06T03:00:00.000Z"),
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      children: [],
      headline: { newOrders: 1, completedOrders: 2, newCustomers: 3, onboardedTechnicians: 4 },
      confirmedPayments: { jpy: 5, ndp: 6, testNdp: 7 },
      orders: {
        total: 8,
        serviceGmv: { jpy: 9, ndp: 10, testNdp: 11 },
        platformNetRevenue: { jpy: 12, ndp: 13, testNdp: 14 },
        agentCommission: null
      },
      realtimeOrders: { list: [], total: 0, page: 1, page_size: 20 },
      activity: [],
      trend: [
        {
          key: "2026-09-06",
          label: "09/06",
          orderCount: 1,
          confirmedPayments: { jpy: 5, ndp: 6, testNdp: 7 }
        }
      ],
      serviceRanking: [],
      technicianRanking: [],
      coverage: { total: 1, attributed: 1, unresolved: 0, completenessPercent: 100 }
    };
    const snapshot = {
      evaluatedAt: facts.evaluatedAt.toISOString(),
      scope: { country: "JP", admin1: "13", admin2: "13104", breadcrumbs: [] },
      children: facts.children,
      headline: facts.headline,
      confirmedPayments: facts.confirmedPayments,
      orders: facts.orders,
      realtimeOrders: { list: [], total: 0, page: 1, page_size: 20 },
      activity: [],
      trend: facts.trend,
      serviceRanking: facts.serviceRanking,
      technicianRanking: facts.technicianRanking,
      coverage: facts.coverage,
      cachedAt: facts.evaluatedAt.toISOString(),
      freshnessSeconds: 0,
      cacheStatus: "hit"
    } as LiveDashboardSnapshotResponse;

    expect(() => assertCompleteSnapshotParity(snapshot, facts, "fixture")).not.toThrow();
    expect(() =>
      assertCompleteSnapshotParity(
        { ...snapshot, headline: { ...snapshot.headline, newCustomers: 99 } },
        facts,
        "fixture"
      )
    ).toThrow("Complete direct MySQL snapshot parity failed");
    expect(fs.readFileSync(scriptPath, "utf8")).not.toContain("repository.getSnapshotFacts");
  });

  it("validates all supported cache keys against the exported TTL and generation contract", () => {
    const keys = ["today", "last7days", "last30days"].flatMap((period) =>
      ["JP", "JP:13", "JP:13:13104"].map((scope) => `${scope}:${period}`)
    );
    const populated = keys.map((key) => ({
      key,
      value: "cached",
      pttl: LIVE_DASHBOARD_CACHE_TTL_SECONDS * 1_000 - 1,
      elapsedSincePopulationMs: 0
    }));
    const invalidated = keys.map((key) => ({ key, value: null, generation: "1" }));
    expect(() =>
      assertCacheLifecycle(populated, invalidated, keys, LIVE_DASHBOARD_CACHE_TTL_SECONDS)
    ).not.toThrow();
    expect(() =>
      assertCacheLifecycle(
        [
          {
            ...populated[0]!,
            pttl: LIVE_DASHBOARD_CACHE_TTL_SECONDS * 1_000 - 20_000,
            elapsedSincePopulationMs: 20_000
          },
          ...populated.slice(1)
        ],
        invalidated,
        keys,
        LIVE_DASHBOARD_CACHE_TTL_SECONDS
      )
    ).not.toThrow();
    expect(() =>
      assertCacheLifecycle(populated.slice(1), invalidated, keys, LIVE_DASHBOARD_CACHE_TTL_SECONDS)
    ).toThrow("every configured scope/period key");
    expect(() =>
      assertCacheLifecycle(
        [
          {
            ...populated[0]!,
            pttl: LIVE_DASHBOARD_CACHE_TTL_SECONDS * 1_000 + 1
          },
          ...populated.slice(1)
        ],
        invalidated,
        keys,
        LIVE_DASHBOARD_CACHE_TTL_SECONDS
      )
    ).toThrow("configured positive TTL");
    expect(() =>
      assertCacheLifecycle(
        [{ ...populated[0]!, pttl: 1 }, ...populated.slice(1)],
        invalidated,
        keys,
        LIVE_DASHBOARD_CACHE_TTL_SECONDS
      )
    ).toThrow("configured TTL tolerance");
    expect(() =>
      assertCacheLifecycle(
        populated,
        [{ ...invalidated[0]!, generation: "0" }, ...invalidated.slice(1)],
        keys,
        LIVE_DASHBOARD_CACHE_TTL_SECONDS
      )
    ).toThrow("generation fence");
  });

  it("enforces SSE allowlists with non-tautological private sentinels", () => {
    const orderNo = "ld8-order-allowed";
    const frame = (event: string, value: Record<string, unknown>) =>
      `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
    const scope = { countryCode: "JP", admin1Code: "13", admin2Code: "13104" };
    const body =
      frame("connected", {
        type: "connected",
        scope,
        payload: {},
        createdAt: "2026-09-06T03:00:00.000Z"
      }) +
      frame("order.changed", {
        id: "1-0",
        type: "order.changed",
        scope,
        payload: { orderNo, status: "CONFIRMED", serviceName: "Formal", amountJpy: 1000 },
        createdAt: "2026-09-06T03:00:01.000Z"
      }) +
      frame("metrics.invalidate", {
        id: "2-0",
        type: "metrics.invalidate",
        scope,
        payload: { sections: ["headline"] },
        createdAt: "2026-09-06T03:00:02.000Z"
      });
    const forbidden = ["private-customer", "private-address", "private-phone", "private-note"];
    expect(() => assertSsePrivacy(body, orderNo, forbidden)).not.toThrow();
    expect(() => assertSsePrivacy(`${body}${forbidden[1]}`, orderNo, forbidden)).toThrow(
      "private fixture sentinel"
    );
    expect(() =>
      assertSsePrivacy(
        body.replace('"amountJpy":1000', '"amountJpy":1000,"customerUserId":"secret"'),
        orderNo,
        forbidden
      )
    ).toThrow("non-allowlisted field");
  });

  it("deletes only run-prefixed Redis state and surfaces cleanup failures", async () => {
    const prefix = "ld8-test:run";
    let deleted = false;
    const commands: string[][] = [];
    const client = {
      isOpen: true,
      connect: jest.fn(async () => undefined),
      sendCommand: jest.fn(async (command: string[]) => {
        commands.push(command);
        return ["0", deleted ? [] : [`${prefix}:cache`, `${prefix}:stream`]];
      }),
      xDel: jest.fn(async () => 2),
      del: jest.fn(async (keys: string[]) => {
        expect(keys.every((key) => key.startsWith(`${prefix}:`))).toBe(true);
        deleted = true;
        return keys.length;
      })
    };
    await expect(cleanupRedis(client, prefix, `${prefix}:stream`, ["1-0", "2-0"])).resolves.toEqual(
      {
        deletedStreamEntries: 2,
        deletedKeys: 2,
        remainingKeys: [],
        cleanupFailures: []
      }
    );
    expect(client.xDel).toHaveBeenCalledWith(`${prefix}:stream`, ["1-0", "2-0"]);
    expect(commands.every((command) => command[3] === `${prefix}:*`)).toBe(true);

    deleted = false;
    commands.length = 0;
    client.del.mockClear();
    await expect(
      cleanupRedis(
        {
          ...client,
          xDel: jest.fn(async () =>
            Promise.reject(new Error("rediss://u:secret@localhost failure"))
          )
        },
        prefix,
        `${prefix}:stream`,
        ["3-0"]
      )
    ).resolves.toMatchObject({
      remainingKeys: [],
      cleanupFailures: ["xdel:[redacted-url] failure"]
    });
    expect(client.del).toHaveBeenCalled();
    expect(commands).toHaveLength(2);
  });

  it("keeps the direct oracle independent except for the authoritative ranking CTE", () => {
    const source = fs.readFileSync(scriptPath, "utf8");
    expect(source).not.toContain('import("../src/domain/dashboard-period")');
    expect(source).not.toContain('import("../src/repositories/formal-confirmed-payment-evidence")');
    expect(source).not.toContain("runtime.resolveDashboardWindow");
    expect(source).not.toContain("runtime.formalConfirmedPaymentEvidence");
    expect(source).toContain("independentDashboardWindow");
    expect(source).toContain("independentConfirmedPaymentEvidence");
    expect(source).toContain("AnalyticsRankingRepository.formalRankingCtes");
  });

  it("measures cache age only after population and before direct-SQL work", () => {
    const source = fs.readFileSync(scriptPath, "utf8");
    const loop = source.slice(source.indexOf("for (const query of queries)"));
    expect(loop.indexOf("const first = await service.getSnapshot")).toBeLessThan(
      loop.indexOf("const populationCompletedAt = Date.now()")
    );
    expect(loop.indexOf("const populationCompletedAt = Date.now()")).toBeLessThan(
      loop.indexOf("const second = await service.getSnapshot")
    );
    expect(loop.indexOf("const cachePttl = await cacheClient.pTTL")).toBeLessThan(
      loop.indexOf("const directFacts = await independentDirectSnapshot")
    );
  });
});
