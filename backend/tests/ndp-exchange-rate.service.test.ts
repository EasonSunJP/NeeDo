import { ERROR_CODES } from "../src/constants/error-codes";
import { AuditLogService } from "../src/services/audit-log.service";
import {
  NdpExchangeRateRepository,
  type NdpExchangeRateRepositoryPort
} from "../src/repositories/ndp-exchange-rate.repository";
import { NdpExchangeRateService } from "../src/services/ndp-exchange-rate.service";

const initialFrom = new Date("2026-01-01T00:00:00.000Z");
const actor = {
  userId: 7,
  email: "operator@example.com",
  accessTokenJti: "ndp-rate-test-jti",
  accessTokenExpiresAt: 2_000_000_000,
  roles: ["operator"],
  permissions: [
    "backoffice:ndp-exchange-rate:read",
    "backoffice:ndp-exchange-rate:write"
  ],
  currentIdentityType: "operator",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null
};
const context = { ip: "127.0.0.1", userAgent: "ndp-rate-test" };

type StoredRate = {
  id: number;
  publicId: string;
  version: number;
  ndpUnits: number;
  jpyUnits: number;
  status: "ACTIVE" | "SUPERSEDED";
  effectiveFrom: Date;
  effectiveTo: Date | null;
  activeKey: string | null;
  idempotencyKey: string;
  reason: string;
  createdById: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type FindFirstArgs = {
  where?: {
    activeKey?: string;
    effectiveFrom?: { lte?: Date; gt?: Date };
  };
  orderBy?: { version?: string } | Array<Record<string, string>>;
};

type UpdateManyArgs = {
  where: Pick<StoredRate, "id" | "version" | "activeKey">;
  data: Partial<StoredRate>;
};

type CreateArgs = {
  data: Omit<StoredRate, "id" | "publicId" | "createdAt" | "updatedAt" | "deletedAt">;
};

const createHarness = (options: { noInitial?: boolean; auditFailure?: Error } = {}) => {
  const rows: StoredRate[] = options.noInitial
    ? []
    : [
        {
          id: 1,
          publicId: "00000000-0000-4000-8000-000000000001",
          version: 1,
          ndpUnits: 1,
          jpyUnits: 1,
          status: "ACTIVE",
          effectiveFrom: initialFrom,
          effectiveTo: null,
          activeKey: "ndp_exchange_rate",
          idempotencyKey: "bootstrap-ndp-exchange-rate-v1",
          reason: "bootstrap",
          createdById: null,
          createdAt: initialFrom,
          updatedAt: initialFrom,
          deletedAt: null
        }
      ];
  const audits: Array<Record<string, unknown>> = [];
  const effectiveAt = (at: Date) =>
    rows
      .filter(
        (row) =>
          !row.deletedAt &&
          row.effectiveFrom <= at &&
          (row.effectiveTo === null || at < row.effectiveTo)
      )
      .sort((left, right) => right.version - left.version)[0] ?? null;
  const latest = () =>
    rows
      .filter((row) => !row.deletedAt && row.activeKey === "ndp_exchange_rate")
      .sort((left, right) => right.version - left.version)[0] ?? null;
  const findFirst = jest.fn(async ({ where, orderBy }: FindFirstArgs) => {
    if (where?.activeKey === "ndp_exchange_rate") return latest();
    if (where?.effectiveFrom?.lte instanceof Date) return effectiveAt(where.effectiveFrom.lte);
    if (where?.effectiveFrom?.gt instanceof Date) {
      const nextFrom = where.effectiveFrom.gt;
      return (
        rows
          .filter((row) => !row.deletedAt && row.effectiveFrom > nextFrom)
          .sort((left, right) => left.effectiveFrom.getTime() - right.effectiveFrom.getTime())[0] ??
        null
      );
    }
    if (Array.isArray(orderBy) || orderBy?.version === "desc") {
      return [...rows].sort((left, right) => right.version - left.version)[0] ?? null;
    }
    return null;
  });
  const tx = {
    $queryRaw: jest.fn(async () => (latest() ? [{ id: latest()!.id }] : [])),
    ndpExchangeRateRule: {
      findFirst,
      findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        rows.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null
      ),
      updateMany: jest.fn(async ({ where, data }: UpdateManyArgs) => {
        const row = rows.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.version === where.version &&
            candidate.activeKey === where.activeKey &&
            candidate.deletedAt === null
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      create: jest.fn(async ({ data }: CreateArgs) => {
        const created: StoredRate = {
          id: rows.length + 1,
          publicId: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
          updatedAt: new Date("2026-09-01T00:00:00.000Z"),
          deletedAt: null,
          ...data
        };
        rows.push(created);
        return created;
      })
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.auditFailure) throw options.auditFailure;
        audits.push(data);
        return data;
      })
    }
  };
  const client = {
    ndpExchangeRateRule: {
      ...tx.ndpExchangeRateRule,
      findMany: jest.fn(async ({ skip = 0, take = 20 }: { skip?: number; take?: number }) =>
        [...rows]
          .filter((row) => !row.deletedAt)
          .sort((left, right) => right.version - left.version)
          .slice(skip, skip + take)
      ),
      count: jest.fn(async () => rows.filter((row) => !row.deletedAt).length)
    },
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => {
      const rowSnapshot = rows.map((row) => ({ ...row }));
      const auditSnapshot = audits.map((audit) => ({ ...audit }));
      try {
        return await callback(tx);
      } catch (error) {
        rows.splice(0, rows.length, ...rowSnapshot);
        audits.splice(0, audits.length, ...auditSnapshot);
        throw error;
      }
    })
  };
  const repository = new NdpExchangeRateRepository(client as never);
  const service = new NdpExchangeRateService(
    repository,
    new AuditLogService({ create: jest.fn(async () => undefined) })
  );
  return { service, repository, client, tx, rows, audits };
};

const publishInput = (
  overrides: Partial<{
    ndpUnits: number;
    jpyUnits: number;
    expectedVersion: number;
    effectiveFrom: Date;
    reason: string;
    idempotencyKey: string;
  }> = {}
) => ({
  ndpUnits: 2,
  jpyUnits: 3,
  expectedVersion: 1,
  effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
  reason: "quarterly rate change",
  idempotencyKey: "ndp-rate-publish-0001",
  ...overrides
});

describe("NdpExchangeRateService and repository state", () => {
  it("resolves the bootstrapped 1:1 rule and uses half-open boundaries", async () => {
    const harness = createHarness();
    const created = await harness.service.publish(actor, publishInput(), context);

    await expect(
      harness.service.resolveEffectiveRate(new Date("2026-09-30T23:59:59.999Z"))
    ).resolves.toMatchObject({ version: 1, ndpUnits: 1, jpyUnits: 1 });
    await expect(
      harness.service.resolveEffectiveRate(new Date("2026-10-01T00:00:00.000Z"))
    ).resolves.toEqual({
      ruleId: created.ruleId,
      publicId: created.publicId,
      version: 2,
      ndpUnits: 2,
      jpyUnits: 3,
      effectiveFrom: new Date("2026-10-01T00:00:00.000Z")
    });
  });

  it("publishes a future schedule chain and audits each immutable version atomically", async () => {
    const harness = createHarness();
    const second = await harness.service.publish(actor, publishInput(), context);
    const third = await harness.service.publish(
      actor,
      publishInput({
        ndpUnits: 3,
        jpyUnits: 5,
        expectedVersion: 2,
        effectiveFrom: new Date("2026-11-01T00:00:00.000Z"),
        reason: "scheduled November rate",
        idempotencyKey: "ndp-rate-publish-0002"
      }),
      context
    );

    expect(second.version).toBe(2);
    expect(third.version).toBe(3);
    expect(harness.rows).toMatchObject([
      { version: 1, status: "SUPERSEDED", effectiveTo: second.effectiveFrom, activeKey: null },
      { version: 2, status: "SUPERSEDED", effectiveTo: third.effectiveFrom, activeKey: null },
      { version: 3, status: "ACTIVE", effectiveTo: null, activeKey: "ndp_exchange_rate" }
    ]);
    expect(harness.audits).toHaveLength(2);
    expect(harness.audits[1]).toMatchObject({
      actorId: actor.userId,
      action: "backoffice.ndp_exchange_rate.version_published",
      targetType: "NdpExchangeRateRule",
      metadata: {
        previous: { version: 2, ndpUnits: 2, jpyUnits: 3 },
        next: { version: 3, ndpUnits: 3, jpyUnits: 5 },
        reason: "scheduled November rate"
      }
    });
  });

  it.each([
    [{ expectedVersion: 0 }, ERROR_CODES.NDP_EXCHANGE_RATE_CONFLICT],
    [
      { effectiveFrom: new Date("2026-01-01T00:00:00.000Z") },
      ERROR_CODES.NDP_EXCHANGE_RATE_CONFLICT
    ]
  ])("rejects stale or invalid chronology without writes", async (overrides, code) => {
    const harness = createHarness();
    await expect(harness.service.publish(actor, publishInput(overrides), context)).rejects.toMatchObject({
      code,
      statusCode: 409
    });
    expect(harness.rows).toHaveLength(1);
    expect(harness.audits).toHaveLength(0);
  });

  it("replays an identical key but conflicts on actor or semantic changes", async () => {
    const harness = createHarness();
    const input = publishInput();
    const created = await harness.service.publish(actor, input, context);
    await expect(harness.service.publish(actor, input, context)).resolves.toEqual(created);
    expect(harness.rows).toHaveLength(2);
    expect(harness.audits).toHaveLength(1);

    for (const changed of [
      { ...input, jpyUnits: 4 },
      { ...input, expectedVersion: 2 },
      { ...input, effectiveFrom: new Date("2026-12-01T00:00:00.000Z") },
      { ...input, reason: "a different approved reason" }
    ]) {
      await expect(harness.service.publish(actor, changed, context)).rejects.toMatchObject({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        statusCode: 409
      });
    }
    await expect(
      harness.service.publish({ ...actor, userId: 8 }, input, context)
    ).rejects.toMatchObject({ code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED, statusCode: 409 });
  });

  it("fails closed when no effective rate exists", async () => {
    const harness = createHarness({ noInitial: true });
    await expect(harness.service.resolveEffectiveRate(new Date())).rejects.toMatchObject({
      code: ERROR_CODES.NDP_EXCHANGE_RATE_NOT_FOUND
    });
  });

  it("rejects non-platform identities even when permission was assigned", async () => {
    const harness = createHarness();
    await expect(
      harness.service.publish(
        { ...actor, currentIdentityScopeType: "shop", currentIdentityScopeId: 12 },
        publishInput(),
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(harness.rows).toHaveLength(1);
  });

  it("rolls back both version writes when the in-transaction audit fails", async () => {
    const auditFailure = new Error("audit unavailable");
    const harness = createHarness({ auditFailure });
    await expect(harness.service.publish(actor, publishInput(), context)).rejects.toBe(auditFailure);
    expect(harness.rows).toMatchObject([
      { version: 1, status: "ACTIVE", effectiveTo: null, activeKey: "ndp_exchange_rate" }
    ]);
    expect(harness.audits).toHaveLength(0);
  });

  it("maps exhausted transaction and uniqueness races to a public conflict", async () => {
    const transaction = jest.fn().mockRejectedValue({ code: "P2034" });
    const repository = new NdpExchangeRateRepository({ $transaction: transaction } as never);
    const service = new NdpExchangeRateService(
      repository,
      new AuditLogService({ create: jest.fn(async () => undefined) })
    );

    await expect(service.publish(actor, publishInput(), context)).rejects.toMatchObject({
      code: ERROR_CODES.NDP_EXCHANGE_RATE_CONFLICT,
      statusCode: 409
    });
    expect(transaction).toHaveBeenCalledTimes(3);

    const uniqueTransaction = jest.fn().mockRejectedValue({ code: "P2002" });
    const uniqueService = new NdpExchangeRateService(
      new NdpExchangeRateRepository({ $transaction: uniqueTransaction } as never),
      new AuditLogService({ create: jest.fn(async () => undefined) })
    );
    await expect(uniqueService.publish(actor, publishInput(), context)).rejects.toMatchObject({
      code: ERROR_CODES.NDP_EXCHANGE_RATE_CONFLICT,
      statusCode: 409
    });
    expect(uniqueTransaction).toHaveBeenCalledTimes(1);
  });

  it("returns evaluated summary and paginated history without idempotency evidence", async () => {
    const harness = createHarness();
    await harness.service.publish(actor, publishInput(), context);
    const overview = await harness.service.list(actor, {
      page: 1,
      pageSize: 1,
      at: new Date("2026-09-01T00:00:00.000Z")
    });

    expect(overview).toMatchObject({
      current: { version: 1 },
      nextScheduled: { version: 2 },
      latestVersion: 2,
      evaluatedAt: new Date("2026-09-01T00:00:00.000Z"),
      history: { total: 2, page: 1, page_size: 1 }
    });
    expect(JSON.stringify(overview)).not.toContain("idempotencyKey");
    expect(JSON.stringify(overview)).not.toContain("activeKey");
  });
});

void (null as unknown as NdpExchangeRateRepositoryPort);
