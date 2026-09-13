import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { FieldJobService } from "../src/services/field-job.service";

type SafetyEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "DATABASE_URL" | "DEPLOY_ENV" | "NODE_ENV">
>;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const assertSafeFieldJobProjectionEnvironment = (environment: SafetyEnvironment): void => {
  const runtime = `${environment.NODE_ENV ?? ""}:${environment.DEPLOY_ENV ?? ""}`.toLowerCase();
  assert(
    !/(?:^|:)(?:staging|stage|production|prod|live)(?::|$)/.test(runtime),
    "field-job projection check cannot use a staging or production runtime"
  );
  const databaseUrl = new URL(environment.DATABASE_URL || "");
  assert(
    databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1",
    "field-job projection check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "").toLowerCase();
  assert(
    /(dev|test|local)/.test(databaseName) && !/(stage|prod|live)/.test(databaseName),
    "field-job projection check requires a development or test database name"
  );
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  if (existsSync(".env.dev.example")) loadDotenv({ path: ".env.dev.example" });
  loadDotenv({ path: envFile, override: true });
  assertSafeFieldJobProjectionEnvironment(process.env);

  const [{ FieldJobRepository }, { prisma, disconnectPrisma }] = await Promise.all([
    import("../src/repositories/field-job.repository"),
    import("../src/prisma/client")
  ]);
  try {
    const source = await prisma.bookingOrder.findMany({
      where: { fulfillmentMode: { in: ["home", "home_visit"] }, deletedAt: null },
      select: { id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    assert(source.length > 0, "local formal data contains no home BookingOrder rows");

    const repository = new FieldJobRepository(prisma);
    const projectedIds: number[] = [];
    let projectedTotal = 0;
    for (let page = 1; ; page += 1) {
      const result = await repository.list({ page, pageSize: 100 });
      projectedTotal = result.total;
      projectedIds.push(...result.list.map((item) => item.id));
      if (projectedIds.length >= result.total) break;
    }

    const sourceIds = source.map((item) => item.id);
    assert(
      projectedTotal === sourceIds.length,
      "projection total does not match formal source rows"
    );
    assert(
      JSON.stringify(projectedIds) === JSON.stringify(sourceIds),
      "projection membership or ordering does not exactly match formal source rows"
    );

    const audit = { record: async (): Promise<void> => undefined };
    const service = new FieldJobService(repository, audit);
    const actorBase = {
      userId: 1,
      currentIdentityId: 1,
      currentIdentityType: "platform",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null
    };
    const context = { ip: "127.0.0.1", userAgent: "field-job-projection-check" };
    const redacted = await service.get(
      { ...actorBase, permissions: ["backoffice:field-jobs:read"] } as never,
      context,
      sourceIds[0]
    );
    const full = await service.get(
      {
        ...actorBase,
        permissions: [
          "backoffice:field-jobs:read",
          "backoffice:field-jobs:address:read",
          "sos:list"
        ]
      } as never,
      context,
      sourceIds[0]
    );
    assert(
      redacted.location.disclosure === "region_only",
      "default projection disclosed full address"
    );
    assert(redacted.location.lines === null, "default projection returned address lines");
    assert(redacted.exceptions.activeSosCount === null, "default projection returned an SOS count");
    assert(
      full.location.disclosure === "full",
      "address permission did not enable full disclosure"
    );
    assert(
      typeof full.exceptions.activeSosCount === "number",
      "SOS permission did not enable count disclosure"
    );

    console.log(
      JSON.stringify({
        status: "ok",
        source: "BookingOrder",
        fulfillmentModes: ["home", "home_visit"],
        sourceCount: sourceIds.length,
        projectedCount: projectedIds.length,
        redaction: "verified",
        optionalDisclosure: "verified"
      })
    );
  } finally {
    await disconnectPrisma();
  }
};

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
