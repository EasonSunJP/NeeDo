import { ERROR_CODES } from "../src/constants/error-codes";
import { AuditLogService } from "../src/services/audit-log.service";
import { AgentCommissionRuleRepository } from "../src/repositories/agent-commission-rule.repository";
import type { AgentCommissionPaymentDetails } from "../src/repositories/agent-commission-rule.repository";
import { AgentCommissionRuleService } from "../src/services/agent-commission-rule.service";

const agentPublicId = "11111111-1111-4111-8111-111111111111";
const actor = {
  userId: 7,
  email: "operator@example.test",
  accessTokenJti: "agent-rule-test-jti",
  accessTokenExpiresAt: 2_000_000_000,
  roles: ["operator"],
  permissions: ["backoffice:agent:read", "backoffice:agent:write"],
  currentIdentityType: "operator",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null
};
const context = { ip: "127.0.0.1", userAgent: "agent-rule-test" };

type StoredRule = {
  id: number;
  publicId: string;
  agentProfileId: number;
  version: number;
  fixedSuccessRewardJpy: bigint;
  profitShareRateBps: number;
  paymentMethod: "BANK_TRANSFER" | "NDP" | "OTHER";
  paymentDetailsJson: Record<string, unknown> | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  publishedAt: Date;
  publishedById: number;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const createHarness = (
  options: { agentMissing?: boolean; auditFailure?: Error; createConflict?: boolean } = {}
) => {
  const rows: StoredRule[] = [];
  const audits: Array<Record<string, unknown>> = [];
  const agent = options.agentMissing
    ? null
    : { id: 41, publicId: agentPublicId, partnerType: "AGENT", deletedAt: null };
  const latest = () =>
    [...rows]
      .filter((row) => row.deletedAt === null)
      .sort((left, right) => right.version - left.version)[0] ?? null;
  const currentAt = (at: Date) =>
    [...rows]
      .filter(
        (row) =>
          row.deletedAt === null &&
          row.effectiveFrom <= at &&
          (row.effectiveTo === null || at < row.effectiveTo)
      )
      .sort((left, right) => right.version - left.version)[0] ?? null;
  const tx = {
    $queryRaw: jest.fn(async () => (agent ? [{ id: agent.id }] : [])),
    platformPartnerProfile: {
      findFirst: jest.fn(async () => agent)
    },
    agentCommissionRuleVersion: {
      findFirst: jest.fn(async (args: { where?: { effectiveFrom?: { lte: Date } } }) =>
        args.where?.effectiveFrom?.lte ? currentAt(args.where.effectiveFrom.lte) : latest()
      ),
      updateMany: jest.fn(
        async ({
          where,
          data
        }: {
          where: { id: number; version: number };
          data: { effectiveTo: Date };
        }) => {
          const row = rows.find(
            (candidate) =>
              candidate.id === where.id &&
              candidate.version === where.version &&
              candidate.effectiveTo === null &&
              candidate.deletedAt === null
          );
          if (!row) return { count: 0 };
          row.effectiveTo = data.effectiveTo;
          return { count: 1 };
        }
      ),
      create: jest.fn(
        async ({
          data
        }: {
          data: Omit<
            StoredRule,
            "id" | "publicId" | "publishedAt" | "createdAt" | "updatedAt" | "deletedAt"
          >;
        }) => {
          if (options.createConflict) throw { code: "P2002" };
          const now = new Date("2026-09-02T00:00:00.000Z");
          const created: StoredRule = {
            id: rows.length + 1,
            publicId: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            ...data
          };
          rows.push(created);
          return created;
        }
      )
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
    platformPartnerProfile: tx.platformPartnerProfile,
    agentCommissionRuleVersion: {
      ...tx.agentCommissionRuleVersion,
      findMany: jest.fn(async ({ skip = 0, take = 20 }: { skip?: number; take?: number }) =>
        [...rows].sort((left, right) => right.version - left.version).slice(skip, skip + take)
      ),
      count: jest.fn(async () => rows.length)
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
  const repository = new AgentCommissionRuleRepository(client as never);
  const service = new AgentCommissionRuleService(
    repository,
    new AuditLogService({ create: jest.fn(async () => undefined) })
  );
  return { service, repository, client, tx, rows, audits };
};

const publishInput = (
  overrides: Partial<{
    fixedSuccessRewardJpy: number;
    profitShareRateBps: number;
    paymentMethod: "bank_transfer" | "ndp" | "other";
    paymentDetails: AgentCommissionPaymentDetails;
    effectiveFrom: Date;
    reason: string;
  }> = {}
) => ({
  fixedSuccessRewardJpy: 50_000,
  profitShareRateBps: 1_500,
  paymentMethod: "bank_transfer" as const,
  paymentDetails: { bankReference: "agent-41-bank" },
  effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
  reason: "2026 contract",
  ...overrides
});

describe("AgentCommissionRuleService and repository state", () => {
  it("publishes immutable monotonically increasing versions and closes the previous window", async () => {
    const harness = createHarness();
    const first = await harness.service.publishRule(actor, agentPublicId, publishInput(), context);
    const second = await harness.service.publishRule(
      actor,
      agentPublicId,
      publishInput({
        fixedSuccessRewardJpy: 60_000,
        profitShareRateBps: 1_800,
        paymentMethod: "ndp",
        paymentDetails: null,
        effectiveFrom: new Date("2026-11-01T00:00:00.000Z"),
        reason: "November renewal"
      }),
      context
    );

    expect(first).toMatchObject({
      version: 1,
      fixedSuccessRewardJpy: 50_000,
      profitShareRateBps: 1_500
    });
    expect(second).toMatchObject({ version: 2, paymentMethod: "ndp", effectiveTo: null });
    expect(harness.rows).toMatchObject([
      { version: 1, effectiveTo: new Date("2026-11-01T00:00:00.000Z") },
      { version: 2, effectiveTo: null }
    ]);
    expect(harness.audits).toHaveLength(2);
    expect(harness.audits[1]).toMatchObject({
      actorId: 7,
      action: "backoffice.agent_commission_rule.version_published",
      targetType: "AgentCommissionRuleVersion",
      metadata: {
        previous: { version: 1, fixedSuccessRewardJpy: 50_000, profitShareRateBps: 1_500 },
        next: { version: 2, fixedSuccessRewardJpy: 60_000, profitShareRateBps: 1_800 },
        reason: "November renewal"
      }
    });
  });

  it("resolves half-open effective windows and returns paginated immutable history", async () => {
    const harness = createHarness();
    await harness.service.publishRule(actor, agentPublicId, publishInput(), context);
    await harness.service.publishRule(
      actor,
      agentPublicId,
      publishInput({ effectiveFrom: new Date("2026-11-01T00:00:00.000Z"), reason: "v2" }),
      context
    );

    await expect(
      harness.service.listRules(actor, agentPublicId, {
        page: 1,
        pageSize: 20,
        at: new Date("2026-10-31T23:59:59.999Z")
      })
    ).resolves.toMatchObject({ current: { version: 1 }, latestVersion: 2, history: { total: 2 } });
    await expect(
      harness.service.listRules(actor, agentPublicId, {
        page: 1,
        pageSize: 20,
        at: new Date("2026-11-01T00:00:00.000Z")
      })
    ).resolves.toMatchObject({
      current: { version: 2 },
      history: { list: [{ version: 2 }, { version: 1 }] }
    });
  });

  it("rejects absent or inactive agents without rule writes", async () => {
    const harness = createHarness({ agentMissing: true });
    await expect(
      harness.service.publishRule(actor, agentPublicId, publishInput(), context)
    ).rejects.toMatchObject({
      code: ERROR_CODES.PLATFORM_PARTNER_PROFILE_NOT_FOUND,
      statusCode: 404
    });
    expect(harness.rows).toHaveLength(0);
    expect(harness.audits).toHaveLength(0);
  });

  it("rejects overlapping or non-increasing effective versions", async () => {
    const harness = createHarness();
    await harness.service.publishRule(actor, agentPublicId, publishInput(), context);
    await expect(
      harness.service.publishRule(
        actor,
        agentPublicId,
        publishInput({ effectiveFrom: new Date("2026-10-01T00:00:00.000Z") }),
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.AGENT_COMMISSION_RULE_CONFLICT, statusCode: 409 });
    expect(harness.rows).toHaveLength(1);
    expect(harness.audits).toHaveLength(1);
  });

  it("rolls back the rule and previous window when atomic audit persistence fails", async () => {
    const harness = createHarness({ auditFailure: new Error("audit unavailable") });
    await expect(
      harness.service.publishRule(actor, agentPublicId, publishInput(), context)
    ).rejects.toThrow("audit unavailable");
    expect(harness.rows).toHaveLength(0);
    expect(harness.audits).toHaveLength(0);
  });

  it("maps a concurrent unique-version race to the stable publication conflict", async () => {
    const harness = createHarness({ createConflict: true });
    await expect(
      harness.service.publishRule(actor, agentPublicId, publishInput(), context)
    ).rejects.toMatchObject({
      code: ERROR_CODES.AGENT_COMMISSION_RULE_CONFLICT,
      statusCode: 409
    });
    expect(harness.rows).toHaveLength(0);
    expect(harness.audits).toHaveLength(0);
  });

  it("fails closed for shop-scoped identities before repository access", async () => {
    const harness = createHarness();
    await expect(
      harness.service.publishRule(
        { ...actor, currentIdentityScopeType: "shop", currentIdentityScopeId: 19 },
        agentPublicId,
        publishInput(),
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(harness.client.$transaction).not.toHaveBeenCalled();
  });
});
