import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  DASHBOARD_CHECK_METRIC_ORACLE,
  DASHBOARD_PROVENANCE_STORAGE_CONTRACTS,
  aggregateIndependentEvidence,
  calculateIndependentNdpIncome,
  calculateIndependentTechnicianCommission,
  countIndependentTechnicianOnboarding,
  assertDashboardProjection,
  assertFixtureWitnessRows,
  assertSelectOnlyGrants,
  compareDashboardValues,
  createSelectOnlyQueryFacade,
  extractSqlFunctionCalls,
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

const metricNamespace = {
  gross_revenue: "booking_order",
  discount_amount: "booking_order",
  dedicated_technician_commission: "booking_order",
  part_time_technician_commission: "booking_order",
  marketing_commission: "affiliate_reward",
  ndp_income: "order_financial",
  affiliate_platform_income: "affiliate_reward",
  new_users: "user",
  new_paid_members: "membership_card",
  technician_onboarding: "user_identity"
} as const;

const fixtureMarker = "dashboard-overview-fixture-2026-08";
const fixtureNamespace = "analytics-task8-immutable-v1";

const identifierKind = {
  booking_order: "order_no",
  order_financial: "numeric_id",
  ledger_transaction: "transaction_no",
  membership_card: "public_id",
  user_identity: "numeric_id",
  compensation_profile: "numeric_id",
  affiliate_reward: "numeric_id",
  user: "needo_id"
} as const;

const provenanceField = {
  booking_order: "service_snapshot_json.fixtureMarker",
  order_financial: "booking_order.service_snapshot_json.fixtureMarker",
  ledger_transaction: "metadata.fixtureMarker",
  membership_card: "issuance_reference",
  user_identity: "user.email",
  compensation_profile: "technician.user.email",
  affiliate_reward: "ledger.metadata.fixtureMarker",
  user: "email"
} as const;

const stableNumericId = (value: string): string => String(
  [...value].reduce((sum, character) => (sum * 33 + character.codePointAt(0)!) % 2_000_000_000, 17) + 1
);

const typedIdentity = (namespace: keyof typeof identifierKind, logicalId: string) => {
  const structuredProvenance = `${fixtureMarker}:${fixtureNamespace}:${namespace}:${logicalId}`;
  const emailProvenance = `${namespace}.${logicalId}@${fixtureMarker}.${fixtureNamespace}.fixture.needo.local`;
  const id = identifierKind[namespace] === "numeric_id"
    ? stableNumericId(`${namespace}:${logicalId}`)
    : namespace === "user"
      ? `u${stableNumericId(`${namespace}:${logicalId}`).padStart(10, "0")}`
      : `${fixtureMarker}:${logicalId}`;
  return {
    id,
    identifierKind: identifierKind[namespace],
    provenance: {
      field: provenanceField[namespace],
      value: ["user", "user_identity", "compensation_profile"].includes(namespace)
        ? emailProvenance
        : structuredProvenance
    }
  };
};

const ref = (
  namespace: DashboardFixtureManifest["witnesses"]["cancelledOrderIds"][number]["namespace"],
  id: string,
  period: "current" | "previous" = "current"
) => ({ namespace, ...typedIdentity(namespace, id), period });

const manifest = (): DashboardFixtureManifest => ({
  version: 2,
  namespace: fixtureNamespace,
  marker: fixtureMarker,
  city: "Tokyo",
  windows: {
    current: { from: "2026-08-25", to: "2026-08-31" },
    previous: { from: "2026-08-18", to: "2026-08-24" }
  },
  witnesses: {
    coherentCompletedCheckoutIds: [
      ref("booking_order", "order-current"),
      ref("booking_order", "order-previous", "previous")
    ],
    cancelledOrderIds: [ref("booking_order", "order-cancelled")],
    refundedOrderIds: [ref("booking_order", "order-refunded")],
    reversedFinancialIds: [ref("order_financial", "financial-reversed")],
    otherCityOrderIds: [ref("booking_order", "order-osaka")],
    testNdpLedgerIds: [ref("ledger_transaction", "ledger-test-ndp")],
    firstPaidMembershipCardIds: [ref("membership_card", "card-first-paid")],
    excludedMembershipCardIds: [
      ref("membership_card", "card-trial"),
      ref("membership_card", "card-gift"),
      ref("membership_card", "card-renewal")
    ],
    technicianIdentityIds: [ref("user_identity", "identity-first-technician")],
    compensationProfileIds: [
      ref("compensation_profile", "profile-dedicated"),
      ref("compensation_profile", "profile-part-time")
    ],
    ndpIncomeFinancialIds: [ref("order_financial", "financial-ndp-income")],
    affiliateRewardIds: [ref("affiliate_reward", "affiliate-settled")]
  },
  readyMetricWitnesses: Object.fromEntries(
    readyMetricKeys.map((metricKey, index) => [metricKey, {
      current: [{
        namespace: metricNamespace[metricKey],
        ...typedIdentity(metricNamespace[metricKey], `${metricKey}-current-${index}`),
        expectation: "positive"
      }],
      previous: [{
        namespace: metricNamespace[metricKey],
        ...typedIdentity(metricNamespace[metricKey], `${metricKey}-previous-${index}`),
        expectation: metricKey === "gross_revenue" ? "zero" : "positive"
      }]
    }])
  ) as unknown as DashboardFixtureManifest["readyMetricWitnesses"]
});

const evidenceRows = (): IndependentEvidenceRow[] => readyMetricKeys.flatMap(
  (metricKey, index) => ([
    {
      metricKey,
      period: "current" as const,
      witnessNamespace: metricNamespace[metricKey],
      witnessId: manifest().readyMetricWitnesses[metricKey].current[0]!.id,
      value: (index + 1) * 10
    },
    {
      metricKey,
      period: "previous" as const,
      witnessNamespace: metricNamespace[metricKey],
      witnessId: manifest().readyMetricWitnesses[metricKey].previous[0]!.id,
      value: index === 0 ? 0 : (index + 1) * 5
    }
  ])
);

const fixtureWitnessRows = (): FixtureWitnessRow[] => Object.entries(manifest().witnesses)
  .flatMap(([kind, witnesses]) => witnesses.map((witness) => ({
    kind: kind as FixtureWitnessRow["kind"],
    witnessNamespace: witness.namespace,
    witnessId: witness.id,
    period: witness.period,
    identifierKind: witness.identifierKind,
    resolvedIdentifier: witness.id,
    provenanceField: witness.provenance.field,
    resolvedProvenance: witness.provenance.value,
    resolvedCount: 1,
    resolvedReversalState: kind === "reversedFinancialIds" ? "refunded" : null,
    resolvedReversalReference: kind === "reversedFinancialIds" ? "formal-refund-reference" : null
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

  it("rejects symlinks plus current, main, sibling, and common-git repository paths", () => {
    const authority = createTempAuthority();
    const repositoryTarget = resolve(backendRoot, "package.json");
    const symlinkPath = join(authority.directory, "external-link.json");
    symlinkSync(repositoryTarget, symlinkPath);
    writeFileSync(authority.envPath, readFileSync(authority.envPath, "utf8").replace(
      authority.manifestPath,
      symlinkPath
    ));
    expect(() => loadDashboardCheckerAuthority({
      FORMAL_BACKEND_ENV_FILE: authority.envPath
    })).toThrow("symlink");

    writeFileSync(authority.envPath, readFileSync(authority.envPath, "utf8").replace(
      symlinkPath,
      repositoryTarget
    ));
    expect(() => loadDashboardCheckerAuthority({
      FORMAL_BACKEND_ENV_FILE: authority.envPath
    })).toThrow("repository-controlled");

    const currentCheckout = resolve(backendRoot, "..");
    const gitEntry = join(currentCheckout, ".git");
    const worktreeGitDirectory = existsSync(join(gitEntry, "HEAD"))
      ? gitEntry
      : resolve(currentCheckout, /^gitdir:\s*(.+)\s*$/imu.exec(readFileSync(gitEntry, "utf8"))![1]!);
    const commonDirectoryFile = join(worktreeGitDirectory, "commondir");
    const commonGitDirectory = existsSync(commonDirectoryFile)
      ? realpathSync(resolve(worktreeGitDirectory, readFileSync(commonDirectoryFile, "utf8").trim()))
      : realpathSync(worktreeGitDirectory);
    const mainCheckout = realpathSync(dirname(commonGitDirectory));
    const forbiddenTargets = [
      join(mainCheckout, "package.json"),
      join(commonGitDirectory, "HEAD")
    ];
    const worktreesDirectory = join(commonGitDirectory, "worktrees");
    const sibling = existsSync(worktreesDirectory)
      ? readdirSync(worktreesDirectory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => readFileSync(join(worktreesDirectory, entry.name, "gitdir"), "utf8").trim())
          .map((gitFile) => dirname(gitFile))
          .find((checkout) => checkout !== currentCheckout && existsSync(join(checkout, "package.json")))
      : undefined;
    if (sibling) forbiddenTargets.push(join(sibling, "package.json"));

    for (const forbiddenTarget of forbiddenTargets) {
      const candidate = createTempAuthority();
      writeFileSync(candidate.envPath, readFileSync(candidate.envPath, "utf8").replace(
        candidate.manifestPath,
        forbiddenTarget
      ));
      expect(() => loadDashboardCheckerAuthority({
        FORMAL_BACKEND_ENV_FILE: candidate.envPath
      })).toThrow("repository-controlled");
    }

    const allowed = createTempAuthority();
    expect(loadDashboardCheckerAuthority({
      FORMAL_BACKEND_ENV_FILE: allowed.envPath
    }).manifestFilePath).toBe(realpathSync(allowed.manifestPath));
  });

  it("validates immutable manifest completeness, unique ids, exclusions, and exact windows", () => {
    expect(parseDashboardFixtureManifest(JSON.stringify(manifest()), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toEqual(manifest());

    const duplicate = manifest();
    duplicate.witnesses.cancelledOrderIds = [
      ref("booking_order", "same"),
      ref("booking_order", "same")
    ];
    expect(() => parseDashboardFixtureManifest(JSON.stringify(duplicate), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("duplicate");

    const incomplete = manifest();
    incomplete.witnesses.testNdpLedgerIds = [];
    expect(() => parseDashboardFixtureManifest(JSON.stringify(incomplete), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("incomplete");

    const incompatible = manifest();
    incompatible.readyMetricWitnesses.new_users.current[0] = {
      namespace: "booking_order" as never,
      ...typedIdentity("booking_order", "incompatible"),
      expectation: "positive"
    };
    expect(() => parseDashboardFixtureManifest(JSON.stringify(incompatible), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("namespace");

    const crossPeriod = manifest();
    crossPeriod.readyMetricWitnesses.gross_revenue.previous[0] = {
      ...crossPeriod.readyMetricWitnesses.gross_revenue.current[0]!,
      expectation: "zero"
    };
    expect(() => parseDashboardFixtureManifest(JSON.stringify(crossPeriod), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("reuse");

    const wrongIdentifier = manifest();
    wrongIdentifier.witnesses.cancelledOrderIds[0]!.identifierKind = "numeric_id" as never;
    expect(() => parseDashboardFixtureManifest(JSON.stringify(wrongIdentifier), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("identifier");

    const missingProvenance = manifest();
    delete (missingProvenance.witnesses.cancelledOrderIds[0] as unknown as { provenance?: unknown }).provenance;
    expect(() => parseDashboardFixtureManifest(JSON.stringify(missingProvenance), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("provenance");

    const shortMarker = manifest();
    shortMarker.marker = "short";
    expect(() => parseDashboardFixtureManifest(JSON.stringify(shortMarker), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("marker format");

    const lowEntropyMarker = manifest();
    lowEntropyMarker.marker = "aaaaaaaaaaaaaaaa-1";
    expect(() => parseDashboardFixtureManifest(JSON.stringify(lowEntropyMarker), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("marker format");

    const shortNamespace = manifest();
    shortNamespace.namespace = "x";
    expect(() => parseDashboardFixtureManifest(JSON.stringify(shortNamespace), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("namespace format");

    for (const invalidProvenance of [
      `ordinary-${fixtureMarker}:${fixtureNamespace}:booking_order:cancelled`,
      `${fixtureMarker}:wrong-namespace:booking_order:cancelled`,
      `${fixtureMarker}:${fixtureNamespace}:`
    ]) {
      const candidate = manifest();
      candidate.witnesses.cancelledOrderIds[0]!.provenance.value = invalidProvenance;
      expect(() => parseDashboardFixtureManifest(JSON.stringify(candidate), {
        city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
      })).toThrow("structured provenance");
    }

    expect(() => parseDashboardFixtureManifest(JSON.stringify(manifest()), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).not.toThrow();

    const parsed = parseDashboardFixtureManifest(JSON.stringify(manifest()), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    });
    const everyWitness = [
      ...Object.values(parsed.witnesses).flat(),
      ...Object.values(parsed.readyMetricWitnesses).flatMap((family) => [
        ...family.current,
        ...family.previous
      ])
    ];
    const prismaSchema = readFileSync(resolve(backendRoot, "prisma/schema.prisma"), "utf8");
    expect(prismaSchema).toMatch(/needoId\s+String\s+@unique\s+@map\("needo_id"\)\s+@db\.VarChar\(32\)/u);
    expect(prismaSchema).toMatch(/email\s+String\s+@unique\s+@db\.VarChar\(255\)/u);
    expect(prismaSchema).toMatch(/issuanceReference\s+String\?\s+@map\("issuance_reference"\)\s+@db\.VarChar\(160\)/u);
    expect(prismaSchema).toMatch(/serviceSnapshotJson\s+Json\?\s+@map\("service_snapshot_json"\)/u);
    expect(prismaSchema).toMatch(/metadata\s+Json\?/u);
    expect(DASHBOARD_PROVENANCE_STORAGE_CONTRACTS).toEqual({
      "service_snapshot_json.fixtureMarker": { storage: "json_string", maxCharacters: null },
      "booking_order.service_snapshot_json.fixtureMarker": { storage: "json_string", maxCharacters: null },
      "metadata.fixtureMarker": { storage: "json_string", maxCharacters: null },
      issuance_reference: { storage: "varchar", maxCharacters: 160 },
      "user.email": { storage: "email_varchar", maxCharacters: 255 },
      "technician.user.email": { storage: "email_varchar", maxCharacters: 255 },
      "ledger.metadata.fixtureMarker": { storage: "json_string", maxCharacters: null },
      email: { storage: "email_varchar", maxCharacters: 255 }
    });
    for (const witness of everyWitness) {
      const contract = DASHBOARD_PROVENANCE_STORAGE_CONTRACTS[witness.provenance.field];
      expect(contract).toBeDefined();
      if (contract.storage === "json_string") {
        expect(JSON.parse(JSON.stringify(witness.provenance.value))).toBe(witness.provenance.value);
      } else {
        expect(witness.provenance.value.length).toBeLessThanOrEqual(contract.maxCharacters!);
      }
      if (contract.storage === "email_varchar") {
        const [local, ...domainParts] = witness.provenance.value.split("@");
        expect(witness.provenance.value).toBe(witness.provenance.value.toLowerCase());
        expect(local!.length).toBeLessThanOrEqual(64);
        expect(domainParts).toHaveLength(1);
        expect(domainParts[0]!.split(".").every((label) => label.length > 0 && label.length <= 63)).toBe(true);
        expect(witness.provenance.value).toMatch(/^[a-z0-9._-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/u);
      }
    }
    const userWitnesses = everyWitness.filter((witness) => [
      "user", "user_identity", "compensation_profile"
    ].includes(witness.namespace));
    expect(userWitnesses.every((witness) => /email$/u.test(witness.provenance.field))).toBe(true);
    expect(userWitnesses.every((witness) => witness.provenance.value.length > 40)).toBe(true);
    expect(userWitnesses.every((witness) => witness.provenance.value !== witness.id)).toBe(true);
    expect(everyWitness.filter((witness) => witness.namespace === "user")
      .every((witness) => /^u\d{10}$/u.test(witness.id) && witness.id.length <= 32)).toBe(true);

    const legacyNeedoIdProvenance = manifest();
    legacyNeedoIdProvenance.readyMetricWitnesses.new_users.current[0]!.provenance = {
      field: "needo_id" as never,
      value: `${fixtureMarker}:${fixtureNamespace}:user:legacy`
    };
    expect(() => parseDashboardFixtureManifest(JSON.stringify(legacyNeedoIdProvenance), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("provenance");

    const nonCanonicalEmail = manifest();
    nonCanonicalEmail.witnesses.technicianIdentityIds[0]!.provenance.value =
      `user_identity.Identity@${fixtureMarker}.${fixtureNamespace}.fixture.needo.local`;
    expect(() => parseDashboardFixtureManifest(JSON.stringify(nonCanonicalEmail), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("structured provenance");

    const caseCollision = manifest();
    caseCollision.witnesses.coherentCompletedCheckoutIds = [
      { ...ref("booking_order", "Case-Collision"), id: `${fixtureMarker}:Case-Collision` },
      { ...ref("booking_order", "case-collision", "previous"), id: `${fixtureMarker}:case-collision` }
    ];
    expect(() => parseDashboardFixtureManifest(JSON.stringify(caseCollision), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).toThrow("collision");

    const typedNumericLooking = manifest();
    typedNumericLooking.witnesses.coherentCompletedCheckoutIds[0] = {
      ...typedNumericLooking.witnesses.coherentCompletedCheckoutIds[0]!,
      id: "123",
      provenance: {
        field: "service_snapshot_json.fixtureMarker",
        value: `${fixtureMarker}:${fixtureNamespace}:booking_order:123`
      }
    };
    typedNumericLooking.witnesses.reversedFinancialIds[0] = {
      ...typedNumericLooking.witnesses.reversedFinancialIds[0]!,
      id: "123"
    };
    expect(() => parseDashboardFixtureManifest(JSON.stringify(typedNumericLooking), {
      city: "Tokyo", from: "2026-08-25", to: "2026-08-31"
    })).not.toThrow();

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
    for (const grant of [
      "ALL PRIVILEGES", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER",
      "TRIGGER", "EXECUTE", "EVENT", "LOCK TABLES", "FILE", "SUPER"
    ]) {
      expect(() => assertSelectOnlyGrants([
        `GRANT SELECT, ${grant} ON *.* TO reader@localhost`
      ])).toThrow("SELECT-only");
    }
    for (const grant of [
      "GRANT PROXY ON ''@'' TO reader@localhost",
      "GRANT SELECT ON *.* TO reader@localhost WITH GRANT OPTION",
      "GRANT `analytics_admin`@`%` TO `reader`@`localhost`"
    ]) {
      expect(() => assertSelectOnlyGrants([grant])).toThrow("SELECT-only");
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

  it("lexes one complete read-only SQL statement and never forwards disguised writes", async () => {
    const queryRaw = jest.fn(async () => [{ ok: 1 }]);
    const facade = createSelectOnlyQueryFacade({ $queryRaw: queryRaw });
    for (const statement of [
      "SELECT '; DELETE FROM users' AS literal",
      "SELECT `semi;column` FROM `semi;table`",
      "/* ; DELETE FROM users */ SELECT 1;",
      "-- ; UPDATE users\nWITH x AS (SELECT 1 AS value) SELECT value FROM x",
      "SHOW GRANTS",
      "DESCRIBE users",
      "EXPLAIN SELECT * FROM users",
      "SELECT cOnCaT /* reviewed pure function */ ('a', 'b')",
      "SELECT '東京都' AS city",
      "SELECT 1 /* 恶意() remains inert fixture data */",
      "SELECT '\"恶意\"()' AS inert_literal",
      "SELECT 1 /* \"evil_mutating_udf\"() remains inert */"
    ]) {
      await expect(facade.$queryRaw(statement)).resolves.toEqual([{ ok: 1 }]);
    }
    expect(queryRaw).toHaveBeenCalledTimes(12);

    for (const statement of [
      "SELECT 1; DELETE FROM users",
      "SELECT 1 /* safe */; /* split */ UPDATE users SET is_active = 0",
      "WITH x AS (SELECT 1) UPDATE users SET is_active = 0",
      "WITH x AS (DELETE FROM users RETURNING id) SELECT id FROM x",
      "WITH x AS (SELECT 1) SELECT * FROM x FOR UPDATE",
      "SELECT * FROM users INTO OUTFILE '/tmp/users'",
      "EXPLAIN UPDATE users SET is_active = 0",
      "SET SESSION TRANSACTION READ WRITE",
      "LOCK TABLES users WRITE",
      "SELECT 1--1; DELETE FROM users",
      "SELECT /*!50000 1 INTO OUTFILE '/tmp/users' */ 1",
      "SELECT /*+ SET_VAR(sort_buffer_size=16M) */ 1",
      "SELECT GET_LOCK('dashboard', 1)",
      "SELECT RELEASE_LOCK('dashboard')",
      "SELECT RELEASE_ALL_LOCKS()",
      "SELECT LAST_INSERT_ID(42)",
      "SELECT evil_mutating_udf('dashboard')",
      "SELECT evil_mutating_udf /* hidden call */ ('dashboard')",
      "SELECT `evil_mutating_udf`()",
      "SELECT `WHERE`()",
      "SELECT MASTER_POS_WAIT('binlog.000001', 4)",
      "SELECT 恶意()",
      "SELECT π()",
      "SELECT sys.恶意()",
      "SELECT evil恶意()",
      "SELECT sys.evil恶意()",
      "SELECT sys.CONCAT('a', 'b')",
      "SELECT \"恶意\"()",
      "SELECT \"evil_mutating_udf\"()",
      "SELECT \"CONCAT\"('a', 'b')",
      "SELECT sys.\"evil_mutating_udf\"()",
      "SELECT \"sys\".\"evil_mutating_udf\"()",
      "SELECT \"evil_mutating_udf\" /* hidden call */ ()",
      "SELECT \"ordinary data\"",
      "SELECT @x := 1",
      "SELECT @@session.sql_mode := ''"
    ]) {
      await expect(facade.$queryRaw(statement)).rejects.toThrow("read-only");
    }
    expect(queryRaw).toHaveBeenCalledTimes(12);
    expect(extractSqlFunctionCalls(
      "SELECT CONCAT('safe(', TRIM(name)), `evil_mutating_udf` FROM users"
    )).toEqual(["CONCAT", "TRIM"]);
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

  it("allocates natural-month base salary once for two bookings on one work day", () => {
    expect(calculateIndependentTechnicianCommission([
      {
        witnessId: "order-a", technicianProfileId: 10, shopId: 20,
        workDate: "2026-08-25", classification: "dedicated", settledShareJpy: 100,
        profiles: [{
          id: 31, status: "archived", wageMode: "base_plus_commission",
          baseSalaryJpy: 31_000, effectiveFrom: "2026-08-01", effectiveTo: "2026-08-31",
          deleted: false
        }]
      },
      {
        witnessId: "order-b", technicianProfileId: 10, shopId: 20,
        workDate: "2026-08-25", classification: "dedicated", settledShareJpy: 200,
        profiles: [{
          id: 31, status: "archived", wageMode: "base_plus_commission",
          baseSalaryJpy: 31_000, effectiveFrom: "2026-08-01", effectiveTo: "2026-08-31",
          deleted: false
        }]
      }
    ])).toEqual({ dedicated: 1_300, partTime: 0 });

    const ambiguous = {
      witnessId: "order-ambiguous", technicianProfileId: 11, shopId: 20,
      workDate: "2026-08-25", classification: "part_time" as const, settledShareJpy: 0,
      profiles: [
        { id: 40, status: "active", wageMode: "commission", baseSalaryJpy: 0, effectiveFrom: null, effectiveTo: null, deleted: false },
        { id: 41, status: "archived", wageMode: "commission", baseSalaryJpy: 0, effectiveFrom: null, effectiveTo: null, deleted: false }
      ]
    };
    expect(() => calculateIndependentTechnicianCommission([ambiguous])).toThrow("profile");
    expect(() => calculateIndependentTechnicianCommission([{
      ...ambiguous,
      profiles: [{
        id: 40, status: "active", wageMode: "commission", baseSalaryJpy: -1,
        effectiveFrom: "2026-09-01", effectiveTo: "2026-08-01", deleted: false
      }]
    }])).toThrow("profile");
  });

  it("attributes NDP platform income and user rewards by their own formal event timestamps", () => {
    const windows = resolveCheckerWindows("2026-08-25", "2026-08-31");
    expect(calculateIndependentNdpIncome([
      {
        financialId: "prior-payment-current-reward",
        paymentConfirmedAt: "2026-08-24T10:00:00.000Z",
        platformFeeNdp: 80,
        requestFeeNdp: 20,
        userRewardNdp: 20,
        userRewardGrantedAt: "2026-08-25T01:00:00.000Z",
        paymentLedgerValid: true,
        paymentWalletValid: true,
        paymentReconciliationValid: true,
        rewardLedgerValid: true,
        rewardWalletValid: true
      },
      {
        financialId: "current-payment",
        paymentConfirmedAt: "2026-08-26T01:00:00.000Z",
        platformFeeNdp: 30,
        requestFeeNdp: 0,
        userRewardNdp: 0,
        userRewardGrantedAt: null,
        paymentLedgerValid: true,
        paymentWalletValid: true,
        paymentReconciliationValid: true,
        rewardLedgerValid: true,
        rewardWalletValid: true
      }
    ], windows)).toEqual({ current: 10, previous: 100 });

    const missingEvidence = {
      financialId: "missing-wallet",
      paymentConfirmedAt: "2026-08-26T01:00:00.000Z",
      platformFeeNdp: 30,
      requestFeeNdp: 0,
      userRewardNdp: 0,
      userRewardGrantedAt: null,
      paymentLedgerValid: true,
      paymentWalletValid: false,
      paymentReconciliationValid: true,
      rewardLedgerValid: true,
      rewardWalletValid: true
    };
    expect(() => calculateIndependentNdpIncome([missingEvidence], windows)).toThrow("evidence");
    expect(() => calculateIndependentNdpIncome([{
      ...missingEvidence,
      paymentWalletValid: true,
      paymentReconciliationValid: false
    }], windows)).toThrow("evidence");

    for (const userRewardGrantedAt of [null, "2026-09-15T01:00:00.000Z"]) {
      expect(calculateIndependentNdpIncome([{
        ...missingEvidence,
        paymentWalletValid: true,
        userRewardNdp: 20,
        userRewardGrantedAt,
        rewardLedgerValid: false,
        rewardWalletValid: false
      }], windows)).toEqual({ current: 30, previous: 0 });
    }
  });

  it("counts first technician activation through an effective affiliation when no direct shop exists", () => {
    const windows = resolveCheckerWindows("2026-08-25", "2026-08-31");
    expect(countIndependentTechnicianOnboarding([{
      identityId: "identity-affiliation-only",
      userId: 50,
      activatedAt: "2026-08-26T01:00:00.000Z",
      firstActivatedAt: "2026-08-26T01:00:00.000Z",
      identityActive: true,
      identityDeleted: false,
      userActive: true,
      userDeleted: false,
      testUser: false,
      profileDeleted: false,
      directShop: null,
      affiliations: [{
        city: "Tokyo", relationshipType: "partner", workStatus: "active",
        startsAt: "2026-08-01T00:00:00.000Z", endsAt: null, deleted: false
      }]
    }], windows, "Tokyo")).toEqual({ current: 1, previous: 0 });
  });

  it("aggregates only exact authorized witnesses and rejects missing, duplicate, unexpected, incomplete, or all-zero facts", () => {
    const result = aggregateIndependentEvidence(manifest(), evidenceRows());
    expect(result.gross_revenue).toEqual({ current: 10, previous: 0 });
    expect(Object.keys(result)).toHaveLength(10);

    expect(() => aggregateIndependentEvidence(manifest(), evidenceRows().slice(1))).toThrow("missing");
    expect(() => aggregateIndependentEvidence(manifest(), [...evidenceRows(), evidenceRows()[0]!])).toThrow("duplicate");
    expect(() => aggregateIndependentEvidence(manifest(), [
      ...evidenceRows(),
      {
        metricKey: "gross_revenue",
        period: "current",
        witnessNamespace: "booking_order",
        witnessId: "not-authorized",
        value: 1
      }
    ])).toThrow("authorized");
    expect(() => aggregateIndependentEvidence(manifest(), evidenceRows().map((row) => ({ ...row, value: 0 })))).toThrow();
    const accidentalZeros = evidenceRows().map((row, index) => ({
      ...row,
      value: index === 0 ? 1 : 0
    }));
    expect(() => aggregateIndependentEvidence(manifest(), accidentalZeros)).toThrow(
      "positive contribution"
    );
  });

  it("requires every positive and exclusion witness to exist in formal rows", () => {
    expect(() => assertFixtureWitnessRows(manifest(), fixtureWitnessRows())).not.toThrow();
    expect(() => assertFixtureWitnessRows(manifest(), fixtureWitnessRows().slice(1))).toThrow("missing");
    expect(() => assertFixtureWitnessRows(manifest(), [
      ...fixtureWitnessRows(), fixtureWitnessRows()[0]!
    ])).toThrow("duplicate");
    expect(() => assertFixtureWitnessRows(manifest(), [
      ...fixtureWitnessRows(), {
        kind: "cancelledOrderIds",
        witnessNamespace: "booking_order",
        witnessId: `${fixtureMarker}:outside-manifest`,
        period: "current",
        identifierKind: "order_no",
        resolvedIdentifier: `${fixtureMarker}:outside-manifest`,
        provenanceField: "service_snapshot_json.fixtureMarker",
        resolvedProvenance: `${fixtureMarker}:booking_order:outside-manifest`,
        resolvedCount: 1,
        resolvedReversalState: null,
        resolvedReversalReference: null
      }
    ])).toThrow("authorized");

    const ineligible = fixtureWitnessRows();
    ineligible[2] = { ...ineligible[2]!, resolvedCount: 0 };
    expect(() => assertFixtureWitnessRows(manifest(), ineligible)).toThrow("exactly one");

    const wrongMarker = fixtureWitnessRows();
    wrongMarker[0] = { ...wrongMarker[0]!, resolvedProvenance: "another-fixture" };
    expect(() => assertFixtureWitnessRows(manifest(), wrongMarker)).toThrow("provenance");

    const wrongCanonicalId = fixtureWitnessRows();
    wrongCanonicalId[0] = { ...wrongCanonicalId[0]!, resolvedIdentifier: `${wrongCanonicalId[0]!.resolvedIdentifier} ` };
    expect(() => assertFixtureWitnessRows(manifest(), wrongCanonicalId)).toThrow("identifier");

    for (const invalidState of ["pending", "unknown"]) {
      const invalidReversal = fixtureWitnessRows() as Array<FixtureWitnessRow & {
        resolvedReversalState?: string | null;
        resolvedReversalReference?: string | null;
      }>;
      const reversedIndex = invalidReversal.findIndex((row) => row.kind === "reversedFinancialIds");
      invalidReversal[reversedIndex] = {
        ...invalidReversal[reversedIndex]!,
        resolvedReversalState: invalidState,
        resolvedReversalReference: "formal-refund-reference"
      };
      expect(() => assertFixtureWitnessRows(manifest(), invalidReversal)).toThrow("reversal evidence");
    }
    const missingReversalReference = fixtureWitnessRows();
    const reversedIndex = missingReversalReference.findIndex((row) => row.kind === "reversedFinancialIds");
    missingReversalReference[reversedIndex] = {
      ...missingReversalReference[reversedIndex]!,
      resolvedReversalReference: null
    };
    expect(() => assertFixtureWitnessRows(manifest(), missingReversalReference)).toThrow("reversal evidence");
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

  it("executes typed, persisted-provenance SQL with exact exclusion and growth predicates", async () => {
    const authority = createTempAuthority();
    const executed: string[] = [];
    await runDashboardOverviewCheck({
      runtimeEnvironment: { FORMAL_BACKEND_ENV_FILE: authority.envPath },
      connect: async () => ({
        client: {
          $queryRaw: jest.fn(async (query: unknown) => {
            const sql = String(query);
            executed.push(sql);
            if (/SHOW GRANTS/iu.test(sql)) {
              return [{ Grants: "GRANT SELECT ON `needo_analytics_test`.* TO `reader`@`localhost`" }];
            }
            return /fixture_witnesses/iu.test(sql) ? fixtureWitnessRows() : evidenceRows();
          })
        },
        disconnect: async () => undefined
      }),
      createProjection: async (_facade, fixture, facts) => testProjection(facts, fixture)
    });

    const witnessSql = executed.find((sql) => /fixture_witnesses/iu.test(sql))!;
    const evidenceSql = executed.find((sql) => /independent_evidence/iu.test(sql))!;
    const generatedFunctionCalls = [...new Set([
      ...extractSqlFunctionCalls(witnessSql),
      ...extractSqlFunctionCalls(evidenceSql)
    ])].sort();
    expect(generatedFunctionCalls).toEqual([
      "CAST", "COALESCE", "CONCAT", "CONVERT_TZ", "COUNT", "DATE", "DAY",
      "JSON_CONTAINS", "JSON_EXTRACT", "JSON_OBJECT", "JSON_UNQUOTE", "LAST_DAY",
      "MAX", "MIN", "MONTH", "ROUND",
      "ROW_NUMBER", "SUM", "TIMESTAMP", "TRIM", "YEAR"
    ]);
    expect(witnessSql).toContain("authorized.identifier_kind");
    expect(witnessSql).toContain("BINARY TRIM(row_identity_user.email) = BINARY authorized.provenance_value");
    expect(witnessSql).toContain("BINARY TRIM(row_profile_user.email) = BINARY authorized.provenance_value");
    expect(witnessSql).toContain("BINARY TRIM(row_user.email) = BINARY authorized.provenance_value");
    expect(witnessSql).not.toMatch(
      /BINARY\s+TRIM\([^)]*needo_id\)\s*=\s*BINARY\s+authorized\.provenance_value/iu
    );
    const cancelledSql = witnessSql.match(
      /authorized\.kind = 'cancelledOrderIds'[\s\S]*?(?=\n\s+OR \(authorized\.kind = 'refundedOrderIds')/iu
    )?.[0] ?? "";
    expect(cancelledSql).toContain("booking.payment_confirmed_at >= period.from_inclusive");
    expect(cancelledSql).toContain("booking.payment_confirmed_at < period.to_exclusive");
    expect(cancelledSql).toContain("checkout.payment_selected_at <= booking.payment_confirmed_at");
    expect(cancelledSql).toContain("payment_ledger.reference_type = 'order_checkout_payment'");
    const reversedSql = witnessSql.match(
      /authorized\.kind = 'reversedFinancialIds'[\s\S]*?(?=\n\s+OR \(authorized\.kind = 'otherCityOrderIds')/iu
    )?.[0] ?? "";
    expect(reversedSql).toContain("financial.settlement_status = 'refunded'");
    expect(reversedSql).toContain("booking.payment_status = 'refunded'");
    expect(reversedSql).toMatch(/JSON_CONTAINS\s*\(\s*financial\.money_timeline_json/iu);
    expect(reversedSql).not.toContain("financial.settlement_status <> 'settled'");
    expect(witnessSql).toContain("BINARY TRIM(booking.order_no) = BINARY authorized.witness_id");
    expect(witnessSql).not.toContain("booking.order_no = authorized.witness_id OR CAST(booking.id AS CHAR)");
    expect(witnessSql).toContain("JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))");
    expect(witnessSql).toContain("AS resolvedIdentifier");
    expect(witnessSql).toContain("AS resolvedProvenance");
    expect(witnessSql).not.toContain("authorized.provenance_value AS resolvedProvenance");
    expect(witnessSql).toContain("AS resolvedCount");
    expect(witnessSql).not.toMatch(/AS fixture_marker|AS allOtherPredicatesSatisfied|1 AS withinAuthoritativeWindow/iu);
    expect(witnessSql).toMatch(/payment_status\s*=\s*'refunded'/iu);
    expect(witnessSql).toMatch(/currency\s*=\s*'TEST_NDP'[\s\S]*receipt_confirmed_by_id\s+IS\s+NULL/iu);
    expect(witnessSql).toMatch(/payment_wallet\.currency\s*=\s*'TEST_NDP'[\s\S]*reconciliation\.currency\s*=\s*'TEST_NDP'/iu);
    expect(witnessSql).toContain("card.issuance_source <> 'offline_paid'");
    expect(witnessSql).toMatch(/excludedMembershipCardIds[\s\S]*NOT EXISTS \([\s\S]*historical_card\.issuance_source = 'offline_paid'[\s\S]*historical_card\.issued_at < card\.issued_at/iu);
    expect(evidenceSql).toContain("checkout.payable_ndp >= 0");
    expect(evidenceSql).toContain("historical_customer.user_id = member_user.id");
    expect(evidenceSql).toContain("ROW_NUMBER() OVER (PARTITION BY authorized.period_key, member_user.id");
    expect(evidenceSql).toContain("financial.user_reward_granted_at >= period.from_inclusive");
    expect(evidenceSql).toMatch(/NOT \([\s\S]*financial\.user_reward_ndp > 0[\s\S]*financial\.user_reward_granted_at >= period\.from_inclusive[\s\S]*OR \([\s\S]*financial\.user_reward_status IN \('immediate', 'paid'\)/iu);
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
