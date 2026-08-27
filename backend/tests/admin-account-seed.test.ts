import { migrateAdminAccount, revokeAdminSeedSessions } from "../prisma/seed";

const adminConfig = {
  email: "admin@lifedance.com",
  username: "LifeDance 管理员",
  password: "test-only-secret"
};

const makeCandidate = (input: Partial<{
  id: number;
  needoId: string;
  email: string;
  isActive: boolean;
}> = {}) => ({
  id: input.id ?? 7,
  needoId: input.needoId ?? "n0000000001",
  email: input.email ?? "admin@example.com",
  isActive: input.isActive ?? true
});

const makeTransaction = (candidates: ReturnType<typeof makeCandidate>[]) => {
  const user = {
    findMany: jest.fn(async () => candidates),
    update: jest.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => ({
      ...candidates.find((candidate) => candidate.id === where.id),
      ...data,
      id: where.id,
      email: adminConfig.email,
      needoId: candidates.find((candidate) => candidate.id === where.id)?.needoId ?? "n0000000001"
    })),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: 99,
      needoId: data.needoId as string,
      email: data.email as string
    }))
  };
  const auditLog = { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data) };

  return { tx: { user, auditLog }, user, auditLog };
};

const runMigration = (
  tx: ReturnType<typeof makeTransaction>["tx"]
) => migrateAdminAccount(tx as never, {
  adminConfig,
  adminPasswordHash: "$2b$12$test-hash-never-exported",
  allocateNeedoId: async (create) => create("n0000000099")
});

describe("formal administrator account seed", () => {
  it("migrates the legacy row in place and preserves its immutable identifiers", async () => {
    const legacy = makeCandidate();
    const { tx, user, auditLog } = makeTransaction([legacy]);

    const result = await runMigration(tx);

    expect(result).toMatchObject({ id: legacy.id, needoId: legacy.needoId, email: adminConfig.email });
    expect(user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: legacy.id },
      data: expect.objectContaining({
        email: adminConfig.email,
        username: adminConfig.username,
        passwordHash: "$2b$12$test-hash-never-exported",
        sessionGeneration: { increment: 1 },
        isActive: true,
        deletedAt: null
      })
    }));
    expect(user.create).not.toHaveBeenCalled();
    expect(auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: legacy.id,
        action: "seed.admin_account.migrate",
        targetType: "User",
        targetId: legacy.id,
        metadata: {
          namespace: "lifedance_real_ops_v1",
          oldEmail: "admin@example.com",
          newEmail: adminConfig.email,
          preservedNeedoId: legacy.needoId
        }
      })
    });
    expect(JSON.stringify(auditLog.create.mock.calls)).not.toContain("passwordHash");
    expect(JSON.stringify(auditLog.create.mock.calls)).not.toContain("test-hash");
  });

  it("updates an existing target row idempotently", async () => {
    const target = makeCandidate({ email: adminConfig.email });
    const { tx, user } = makeTransaction([target]);

    const result = await runMigration(tx);

    expect(result.id).toBe(target.id);
    expect(user.update).toHaveBeenCalledTimes(1);
    expect(user.create).not.toHaveBeenCalled();
  });

  it("updates once when both lookup aliases resolve to the same row", async () => {
    const target = makeCandidate({ email: adminConfig.email });
    const legacyAlias = { ...target, email: "admin@example.com" };
    const { tx, user } = makeTransaction([target, legacyAlias]);

    await runMigration(tx);

    expect(user.update).toHaveBeenCalledTimes(1);
    expect(user.create).not.toHaveBeenCalled();
  });

  it("aborts before writing when legacy and target emails are different active users", async () => {
    const target = makeCandidate({ id: 7, email: adminConfig.email });
    const legacy = makeCandidate({ id: 8, needoId: "n0000000008" });
    const { tx, user, auditLog } = makeTransaction([target, legacy]);

    await expect(runMigration(tx)).rejects.toThrow("ADMIN_SEED_ACCOUNT_CONFLICT");

    expect(user.update).not.toHaveBeenCalled();
    expect(user.create).not.toHaveBeenCalled();
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it("creates a new administrator only when neither email exists", async () => {
    const { tx, user } = makeTransaction([]);

    const result = await runMigration(tx);

    expect(result).toMatchObject({ id: 99, needoId: "n0000000099", email: adminConfig.email });
    expect(user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        needoId: "n0000000099",
        email: adminConfig.email,
        username: adminConfig.username
      })
    });
    expect(user.update).not.toHaveBeenCalled();
  });

  it("revokes every pre-migration refresh session and surfaces dependency failures", async () => {
    const sessionRevoker = { revokeAllRefreshTokens: jest.fn(async () => undefined) };

    await revokeAdminSeedSessions(sessionRevoker, 7, 1);

    expect(sessionRevoker.revokeAllRefreshTokens).toHaveBeenCalledWith(7, 1);

    sessionRevoker.revokeAllRefreshTokens.mockRejectedValueOnce(
      new Error("simulated session revocation failure")
    );
    await expect(revokeAdminSeedSessions(sessionRevoker, 7, 1)).rejects.toThrow(
      "simulated session revocation failure"
    );
  });
});
