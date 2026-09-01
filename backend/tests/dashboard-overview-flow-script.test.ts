import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DASHBOARD_CHECK_METRIC_ORACLE,
  aggregateIndependentEvidence,
  assertDashboardProjection,
  assertFixtureWitnessRows,
  assertSelectOnlyGrants,
  compareDashboardValues,
  createSelectOnlyQueryFacade,
  loadDashboardCheckerAuthority,
  parseDashboardFixtureManifest,
  resolveCheckerWindows,
  runDashboardOverviewCheck,
  type DashboardFixtureManifest,
  type FixtureWitnessRow,
  type IndependentEvidenceRow
} from "../scripts/check-dashboard-overview-flow";

const backendRoot = resolve(__dirname, "..");

const readyMetricKeys = [
  "gross_revenue",
  "discount_amount",
  "dedicated_technician_commission",
  "part_time_technician_commission",
  "marketing_commission",
  "ndp_income",
  "affiliate_platform_income",
  "new_users",
  "new_paid_members",
  "technician_onboarding"
] as const;

const manifest = (): DashboardFixtureManifest => ({
  version: 1,
  namespace: "analytics-task8-immutable-v1",
  marker: "dashboard-overview-fixture-2026-08",
  city: "Tokyo",
  windows: {
    current: { from: "2026-08-25", to: "2026-08-31" },
    previous: { from: "2026-08-18", to: "2026-08-24" }
  },
  witnesses: {
    coherentCompletedCheckoutIds: ["order-current", "order-previous"],
    cancelledOrderIds: ["order-cancelled"],
    refundedOrderIds: ["order-refunded"],
    reversedFinancialIds: ["financial-reversed"],
    otherCityOrderIds: ["order-osaka"],
    testNdpLedgerIds: ["ledger-test-ndp"],
    firstPaidMembershipCardIds: ["card-first-paid"],
    excludedMembershipCardIds: ["card-trial", "card-gift", "card-renewal"],
    technicianIdentityIds: ["identity-first-technician"],
    compensationProfileIds: ["profile-dedicated", "profile-part-time"],
    ndpIncomeFinancialIds: ["financial-ndp-income"],
    affiliateRewardIds: ["affiliate-settled"]
  },
  readyMetricWitnesses: Object.fromEntries(
    readyMetricKeys.map((metricKey, index) => [metricKey, {
      current: [`${metricKey}-current-${index}`],
      previous: [`${metricKey}-previous-${index}`]
    }])
  ) as DashboardFixtureManifest["readyMetricWitnesses"]
});

const evidenceRows = (): IndependentEvidenceRow[] => readyMetricKeys.flatMap(
  (metricKey, index) => ([
    {
      metricKey,
      period: "current" as const,
      witnessId: manifest().readyMetricWitnesses[metricKey].current[0]!,
      value: (index + 1) * 10
    },
    {
      metricKey,
      period: "previous" as const,
      witnessId: manifest().readyMetricWitnesses[metricKey].previous[0]!,
      value: index === 0 ? 0 : (index + 1) * 5
    }
  ])
);

const fixtureWitnessRows = (): FixtureWitnessRow[] => Object.entries(manifest().witnesses)
  .flatMap(([kind, ids]) => ids.map((witnessId) => ({
    kind: kind as FixtureWitnessRow["kind"], witnessId
  })));

const createTempAuthority = (overrides: string[] = []) => {
  const directory = join(tmpdir(), `needo-dashboard-check-${process.pid}-${Math.random()}`);
  mkdirSync(directory, { recursive: true });
  const envPath = join(directory, "formal.env");
  const manifestPath = join(directory, "fixture.json");
  writeFileSync(manifestPath, JSON.stringify(manifest()), { mode: 0o444 });
  writeFileSync(envPath, [
    "NODE_ENV=test",
    "DEPLOY_ENV=local",
    "DATABASE_URL=mysql://analytics_reader:secret@127.0.0.1:3306/needo_analytics_test",
    "DASHBOARD_OVERVIEW_CHECK_CITY=Tokyo",
    "DASHBOARD_OVERVIEW_CHECK_FROM=2026-08-25",
    "DASHBOARD_OVERVIEW_CHECK_TO=2026-08-31",
    `DASHBOARD_OVERVIEW_FIXTURE_MANIFEST_FILE=${manifestPath}`,
    ...overrides
  ].join("\n"));
  return { directory, envPath, manifestPath };
};

describe("zero-write comprehensive dashboard checker", () => {
  it("is import-safe and wired to an explicit package command", async () => {
    expect(existsSync(resolve(backendRoot, "scripts/check-dashboard-overview-flow.ts"))).toBe(true);
    const packageJson = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["check:dashboard-overview"]).toBe(
      "tsx scripts/check-dashboard-overview-flow.ts"
    );
    await expect(jest.isolateModulesAsync(async () => {
      await import("../scripts/check-dashboard-overview-flow");
    })).resolves.toBeUndefined();
  });

  it("requires an authoritative env file and rejects inherited, remote, and production-looking targets before connect", () => {
    const authority = createTempAuthority();
    expect(() => loadDashboardCheckerAuthority({})).toThrow("FORMAL_BACKEND_ENV_FILE is required");
    expect(() => loadDashboardCheckerAuthority({
      FORMAL_BACKEND_ENV_FILE: join(authority.directory, "missing.env")
    })).toThrow("does not exist");

    writeFileSync(authority.envPath, "NODE_ENV=test\nDEPLOY_ENV=local");
    expect(() => loadDashboardCheckerAuthority({
      FORMAL_BACKEND_ENV_FILE: authority.envPath,
      DATABASE_URL: "mysql://runtime@127.0.0.1/runtime_test"
    })).toThrow("DATABASE_URL is required in FORMAL_BACKEND_ENV_FILE");

    for (const unsafe of [
      "NODE_ENV=production",
      "DEPLOY_ENV=staging",
      "DATABASE_URL=mysql://reader@db.example/needo_test",
      "DATABASE_URL=mysql://reader@127.0.0.1/needo_productiontest",
      "DATABASE_URL=mysql://reader@127.0.0.1/needo_proddev"
    ]) {
      const candidate = createTempAuthority([unsafe]);
      expect(() => loadDashboardCheckerAuthority({
        FORMAL_BACKEND_ENV_FILE: candidate.envPath
      })).toThrow();
    }
  });

  it("requires all checker values from the env file and a read-only external manifest", () => {
    const authority = createTempAuthority();
    expect(loadDashboardCheckerAuthority({
      FORMAL_BACKEND_ENV_FILE: authority.envPath,
      DASHBOARD_OVERVIEW_CHECK_CITY: "Osaka"
    })).toMatchObject({ city: "Tokyo", from: "2026-08-25", to: "2026-08-31" });

    chmodSync(authority.manifestPath, 0o644);
    expect(() => loadDashboardCheckerAuthority({
      FORMAL_BACKEND_ENV_FILE: authority.envPath
    })).toThrow("read-only");

    const missing = createTempAuthority(["DASHBOARD_OVERVIEW_CHECK_CITY="]);
    expect(() => loadDashboardCheckerAuthority({
      FORMAL_BACKEND_ENV_FILE: missing.envPath
    })).toThrow("DASHBOARD_OVERVIEW_CHECK_CITY");
  });

  it("validates immutable manifest completeness, unique ids, exclusions, and exact windows", () => {
    expect(parseDashboardFixtureManifest(JSON.stringify(manifest()), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toEqual(manifest());

    const duplicate = manifest();
    duplicate.witnesses.cancelledOrderIds = ["same", "same"];
    expect(() => parseDashboardFixtureManifest(JSON.stringify(duplicate), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("duplicate");

    const incomplete = manifest();
    incomplete.witnesses.testNdpLedgerIds = [];
    expect(() => parseDashboardFixtureManifest(JSON.stringify(incomplete), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("incomplete");

    expect(() => parseDashboardFixtureManifest(JSON.stringify(manifest()), {
      city: "Osaka", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("authority");
  });

  it("rejects write grants and exposes only SHOW/SELECT/WITH with no model or execute surface", async () => {
    expect(() => assertSelectOnlyGrants([
      "GRANT SELECT ON `needo_analytics_test`.* TO `reader`@`localhost`"
    ])).not.toThrow();
    expect(() => assertSelectOnlyGrants([
      "GRANT USAGE ON *.* TO `reader`@`localhost`",
      "GRANT SELECT ON `needo_analytics_test`.* TO `reader`@`localhost`"
    ])).not.toThrow();
    for (const grant of ["ALL PRIVILEGES", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "TRIGGER", "EXECUTE", "EVENT", "LOCK TABLES"]) {
      expect(() => assertSelectOnlyGrants([
        `GRANT SELECT, ${grant} ON *.* TO reader@localhost`
      ])).toThrow("SELECT-only");
    }

    const queryRaw = jest.fn(async () => [{ ok: 1 }]);
    const facade = createSelectOnlyQueryFacade({ $queryRaw: queryRaw });
    await expect(facade.$queryRaw("SELECT 1")).resolves.toEqual([{ ok: 1 }]);
    await expect(facade.$queryRaw("WITH x AS (SELECT 1) SELECT * FROM x")).resolves.toEqual([{ ok: 1 }]);
    await expect(facade.$queryRaw("SHOW GRANTS")).resolves.toEqual([{ ok: 1 }]);
    await expect(facade.$queryRaw("UPDATE users SET is_active = 0")).rejects.toThrow("read-only");
    expect((facade as unknown as Record<string, unknown>).$executeRaw).toBeUndefined();
    expect((facade as unknown as Record<string, unknown>).user).toBeUndefined();
  });

  it("calculates independent comparison boundaries and Tokyo half-open windows", () => {
    expect(compareDashboardValues(null, 1)).toEqual({ percent: null, direction: "unavailable" });
    expect(compareDashboardValues(10, 10)).toEqual({ percent: 0, direction: "flat" });
    expect(compareDashboardValues(10, 0)).toEqual({ percent: 100, direction: "up" });
    expect(compareDashboardValues(-10, 0)).toEqual({ percent: -100, direction: "down" });
    expect(compareDashboardValues(1, 3)).toEqual({ percent: -66.67, direction: "down" });
    expect(compareDashboardValues(-5, -10)).toEqual({ percent: 50, direction: "up" });
    expect(() => compareDashboardValues(Number.NaN, 1)).toThrow("finite");
    expect(resolveCheckerWindows("2026-08-25", "2026-08-31")).toEqual({
      current: {
        from: "2026-08-25", to: "2026-08-31",
        fromInclusive: "2026-08-24T15:00:00.000Z",
        toExclusive: "2026-08-31T15:00:00.000Z"
      },
      previous: {
        from: "2026-08-18", to: "2026-08-24",
        fromInclusive: "2026-08-17T15:00:00.000Z",
        toExclusive: "2026-08-24T15:00:00.000Z"
      }
    });
  });

  it("aggregates only exact authorized witnesses and rejects missing, duplicate, unexpected, incomplete, or all-zero facts", () => {
    const result = aggregateIndependentEvidence(manifest(), evidenceRows());
    expect(result.gross_revenue).toEqual({ current: 10, previous: 0 });
    expect(Object.keys(result)).toHaveLength(10);

    expect(() => aggregateIndependentEvidence(manifest(), evidenceRows().slice(1))).toThrow("missing");
    expect(() => aggregateIndependentEvidence(manifest(), [...evidenceRows(), evidenceRows()[0]!])).toThrow("duplicate");
    expect(() => aggregateIndependentEvidence(manifest(), [
      ...evidenceRows(),
      { metricKey: "gross_revenue", period: "current", witnessId: "not-authorized", value: 1 }
    ])).toThrow("authorized");
    expect(() => aggregateIndependentEvidence(manifest(), evidenceRows().map((row) => ({ ...row, value: 0 })))).toThrow("all-zero");
  });

  it("requires every positive and exclusion witness to exist in formal rows", () => {
    expect(() => assertFixtureWitnessRows(manifest(), fixtureWitnessRows())).not.toThrow();
    expect(() => assertFixtureWitnessRows(manifest(), fixtureWitnessRows().slice(1))).toThrow("missing");
    expect(() => assertFixtureWitnessRows(manifest(), [
      ...fixtureWitnessRows(), fixtureWitnessRows()[0]!
    ])).toThrow("duplicate");
    expect(() => assertFixtureWitnessRows(manifest(), [
      ...fixtureWitnessRows(), { kind: "cancelledOrderIds", witnessId: "outside-manifest" }
    ])).toThrow("authorized");
  });

  it("keeps an independent exact 17-metric order and catches every projection field mutation", () => {
    expect(DASHBOARD_CHECK_METRIC_ORACLE.map((metric) => metric.metricKey)).toEqual([
      "gross_revenue", "travel_fare", "discount_amount", "consumables_sales",
      "dedicated_technician_commission", "part_time_technician_commission",
      "marketing_commission", "agent_commission", "ndp_income",
      "affiliate_platform_income", "consumables_profit", "new_users",
      "new_paid_members", "technician_onboarding", "agent_onboarding",
      "franchisee_onboarding", "supplier_onboarding"
    ]);
    const values = aggregateIndependentEvidence(manifest(), evidenceRows());
    const projection = testProjection(values);
    expect(() => assertDashboardProjection(projection, manifest(), values)).not.toThrow();

    const fields = [
      "currentValue", "previousValue", "dataStatus", "unit", "description",
      "formula", "detailRoute", "comparisonPercent", "comparisonDirection"
    ] as const;
    for (let index = 0; index < 17; index += 1) {
      for (const field of fields) {
        const mutated = structuredClone(projection);
        const metric = [...mutated.operationsFinance, ...mutated.commissionMetrics, ...mutated.growthMetrics][index]!;
        (metric as Record<string, unknown>)[field] = field === "currentValue" ? 999_999 : "mutated";
        expect(() => assertDashboardProjection(mutated, manifest(), values)).toThrow();
      }
    }
    const reordered = structuredClone(projection);
    reordered.operationsFinance.reverse();
    expect(() => assertDashboardProjection(reordered, manifest(), values)).toThrow("order");
    const missing = structuredClone(projection);
    missing.growthMetrics.pop();
    expect(() => assertDashboardProjection(missing, manifest(), values)).toThrow();
    const duplicate = structuredClone(projection);
    duplicate.growthMetrics[5] = duplicate.growthMetrics[4]!;
    expect(() => assertDashboardProjection(duplicate, manifest(), values)).toThrow();
  });

  it("checks every detail as one previous/current chronological series, including null-route TEST metrics", () => {
    const values = aggregateIndependentEvidence(manifest(), evidenceRows());
    const projection = testProjection(values);
    expect(() => assertDashboardProjection(projection, manifest(), values)).not.toThrow();
    const wrong = structuredClone(projection);
    wrong.details.supplier_onboarding.series[0]!.points.reverse();
    expect(() => assertDashboardProjection(wrong, manifest(), values)).toThrow("detail");
  });

  it("disconnects on success and every post-connect failure while never exposing a write client", async () => {
    const authority = createTempAuthority();
    const disconnect = jest.fn(async () => undefined);
    const raw = jest.fn(async (query: unknown) => {
      const text = String(query);
      if (/SHOW GRANTS/iu.test(text)) {
        return [{ "Grants for reader@localhost": "GRANT SELECT ON `needo_analytics_test`.* TO `reader`@`localhost`" }];
      }
      if (/fixture_witnesses/iu.test(text)) return fixtureWitnessRows();
      return evidenceRows();
    });
    const result = await runDashboardOverviewCheck({
      runtimeEnvironment: { FORMAL_BACKEND_ENV_FILE: authority.envPath },
      connect: async () => ({ client: { $queryRaw: raw }, disconnect }),
      createProjection: async (_facade, fixture, facts) => testProjection(facts, fixture)
    });
    expect(result.metricCount).toBe(17);
    expect(disconnect).toHaveBeenCalledTimes(1);

    const failedDisconnect = jest.fn(async () => undefined);
    await expect(runDashboardOverviewCheck({
      runtimeEnvironment: { FORMAL_BACKEND_ENV_FILE: authority.envPath },
      connect: async () => ({
        client: { $queryRaw: jest.fn(async () => [{ Grants: "GRANT SELECT, UPDATE ON *.* TO reader" }]) },
        disconnect: failedDisconnect
      }),
      createProjection: async () => { throw new Error("must not reach projection"); }
    })).rejects.toThrow("SELECT-only");
    expect(failedDisconnect).toHaveBeenCalledTimes(1);

    const projectionDisconnect = jest.fn(async () => undefined);
    await expect(runDashboardOverviewCheck({
      runtimeEnvironment: { FORMAL_BACKEND_ENV_FILE: authority.envPath },
      connect: async () => ({ client: { $queryRaw: raw }, disconnect: projectionDisconnect }),
      createProjection: async () => { throw new Error("projection failed"); }
    })).rejects.toThrow("projection failed");
    expect(projectionDisconnect).toHaveBeenCalledTimes(1);
  });

  it("rejects missing manifest before constructing Prisma", async () => {
    const authority = createTempAuthority();
    const connect = jest.fn();
    writeFileSync(authority.envPath, readFileSync(authority.envPath, "utf8").replace(
      authority.manifestPath,
      join(authority.directory, "missing.json")
    ));
    await expect(runDashboardOverviewCheck({
      runtimeEnvironment: { FORMAL_BACKEND_ENV_FILE: authority.envPath },
      connect
    })).rejects.toThrow("manifest does not exist");
    expect(connect).not.toHaveBeenCalled();
  });
});

type ReadyValues = ReturnType<typeof aggregateIndependentEvidence>;

const testProjection = (values: ReadyValues, fixture = manifest()) => {
  const metrics = DASHBOARD_CHECK_METRIC_ORACLE.map((metadata) => {
    const ready = values[metadata.metricKey as keyof ReadyValues];
    const currentValue = ready?.current ?? null;
    const previousValue = ready?.previous ?? null;
    const comparison = compareDashboardValues(currentValue, previousValue);
    return {
      ...metadata,
      currentValue,
      previousValue,
      comparisonPercent: comparison.percent,
      comparisonDirection: comparison.direction
    };
  });
  const filter = {
    period: "custom",
    from: fixture.windows.current.from,
    to: fixture.windows.current.to,
    previousFrom: fixture.windows.previous.from,
    previousTo: fixture.windows.previous.to,
    timeZone: "Asia/Tokyo" as const,
    granularity: "day" as const,
    city: fixture.city
  };
  return {
    filter,
    operationsFinance: metrics.slice(0, 4),
    commissionMetrics: metrics.slice(4, 11),
    growthMetrics: metrics.slice(11),
    details: Object.fromEntries(metrics.map((metric) => [metric.metricKey, {
      filter,
      metric,
      series: [{
        seriesKey: metric.metricKey,
        label: metric.description,
        unit: metric.unit,
        points: [
          {
            key: "previous", label: `${fixture.windows.previous.from} - ${fixture.windows.previous.to}`,
            value: metric.previousValue
          },
          {
            key: "current", label: `${fixture.windows.current.from} - ${fixture.windows.current.to}`,
            value: metric.currentValue
          }
        ]
      }]
    }]))
  };
};
