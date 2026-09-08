import type { PrismaClient } from "@prisma/client";
import { EkycApplicationRepository } from "../src/repositories/ekyc-application.repository";
const setup = () => {
  const tx = {
    user: { updateMany: jest.fn(async () => ({ count: 1 })) },
    ekycApplication: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 7, userId: 2, status: "submitted", version: 1, user: { needoId: "u0000000002" } })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 7, userId: 2, status: "approved", version: 2, user: { needoId: "u0000000002" } }))
    },
    ekycVerification: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 9 }))
    },
    auditLog: { create: jest.fn(async () => ({ id: 1 })) }
  };
  const client = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx))
  } as unknown as PrismaClient;
  return { tx, repo: new EkycApplicationRepository(client) };
};
describe("manual eKYC transactional persistence", () => {
  it("projects the applicant public NeeDo ID for review lists", async () => {
    const application = {
      id: 7,
      userId: 2,
      status: "submitted",
      version: 1,
      profileEncrypted: "sealed",
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
      reviewerUserId: null,
      reviewNote: null,
      rejectionReason: null,
      deletedAt: null,
      user: { needoId: "u0000000002" }
    };
    const findMany = jest.fn(async () => [application]);
    const client = {
      ekycApplication: { findMany, count: jest.fn(async () => 1) },
      $transaction: jest.fn(async (queries: Promise<unknown>[]) => Promise.all(queries))
    } as unknown as PrismaClient;

    const result = await new EkycApplicationRepository(client).list(undefined, {
      page: 1,
      page_size: 20
    });

    expect(result.list[0]).toMatchObject({ userId: 2, userPublicId: "u0000000002" });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { user: { select: { needoId: true } } } })
    );
  });

  it("locks applicant before checking active applications and only creates submitted data", async () => {
    const { tx, repo } = setup();
    await repo.create({ userId: 2, profileEncrypted: "sealed", now: new Date() });
    expect(tx.user.updateMany).toHaveBeenCalled();
    expect(tx.user.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.ekycApplication.findFirst.mock.invocationCallOrder[0]
    );
    expect(tx.ekycApplication.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "submitted", version: 1, activeUserId: 2 })
    }));
    expect(tx.ekycVerification.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 2, action: "ekyc_application.submitted" })
    });
  });
  it("rejects active duplicate submissions", async () => {
    const { tx, repo } = setup();
    tx.ekycApplication.findFirst.mockResolvedValue({ id: 7 } as never);
    await expect(
      repo.create({ userId: 2, profileEncrypted: "sealed", now: new Date() })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.ekycApplication.create).not.toHaveBeenCalled();
  });
  it("rejects an already verified applicant", async () => {
    const { tx, repo } = setup();
    tx.ekycVerification.findFirst.mockResolvedValue({ id: 9 } as never);
    await expect(
      repo.create({ userId: 2, profileEncrypted: "sealed", now: new Date() })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("rejects a verification committed while an older submission waited for the applicant lock", async () => {
    const requestedAt = new Date("2026-09-07T00:00:00.000Z");
    const verifiedAt = new Date("2026-09-07T00:00:01.000Z");
    const lockAcquiredAt = new Date("2026-09-07T00:00:02.000Z");
    jest.useFakeTimers().setSystemTime(requestedAt);
    try {
      const { tx, repo } = setup();
      tx.user.updateMany.mockImplementation(async () => {
        jest.setSystemTime(lockAcquiredAt);
        return { count: 1 };
      });
      (tx.ekycVerification.findFirst as jest.Mock).mockImplementation(
        async ({
          where
        }: {
          where: {
            verifiedAt: { lte: Date };
            OR: [{ expiresAt: null }, { expiresAt: { gt: Date } }];
          };
        }) => (verifiedAt <= where.verifiedAt.lte ? { id: 9 } : null)
      );
      await expect(
        repo.create({ userId: 2, profileEncrypted: "sealed", now: requestedAt })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "error.ekyc_application.already_verified"
      });
      expect(tx.ekycVerification.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          verifiedAt: { lte: lockAcquiredAt },
          OR: [{ expiresAt: null }, { expiresAt: { gt: lockAcquiredAt } }]
        })
      });
      expect(tx.ekycApplication.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it("checks version atomically before any approval write or audit", async () => {
    const { tx, repo } = setup();
    tx.ekycApplication.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      repo.decide({
        id: 7,
        userId: 2,
        actorId: 3,
        expectedVersion: 1,
        status: "rejected",
        rejectionReason: "Unclear",
        now: new Date()
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.ekycVerification.create).not.toHaveBeenCalled();
  });
  it.each(["rejected", "withdrawn"] as const)(
    "releases active key for resubmit after %s without modifying profile",
    async (status) => {
      const { tx, repo } = setup();
      await repo.decide({
        id: 7,
        userId: 2,
        actorId: status === "withdrawn" ? 2 : 3,
        expectedVersion: 1,
        status,
        rejectionReason: status === "rejected" ? "Unclear" : undefined,
        now: new Date()
      });
      const data = (tx.ekycApplication.updateMany as jest.Mock).mock.calls[0][0].data;
      expect(data.activeUserId).toBeNull();
      expect(data).not.toHaveProperty("profileEncrypted");
      expect(tx.ekycVerification.create).not.toHaveBeenCalled();
    }
  );
  it("commits approval, verified record, and actor audit in one transaction", async () => {
    const { tx, repo } = setup();
    const now = new Date();
    const verification = {
      userId: 2,
      provider: "operations_manual",
      providerReference: "manual-application-7",
      status: "verified",
      verifiedNameEncrypted: "sealed-name",
      verifiedNameKanaEncrypted: "sealed-kana",
      nameMatchHash: "a".repeat(64),
      resultHash: "b".repeat(64),
      verifiedAt: now,
      expiresAt: null
    };
    await repo.decide({
      id: 7,
      userId: 2,
      actorId: 3,
      expectedVersion: 1,
      status: "approved",
      reviewNote: "Checked external evidence",
      verification,
      now
    });
    expect(tx.ekycVerification.create).toHaveBeenCalledWith({ data: verification });
    expect(tx.ekycApplication.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.ekycVerification.create.mock.invocationCallOrder[0]
    );
    expect(tx.ekycVerification.create.mock.invocationCallOrder[0]).toBeLessThan(
      tx.auditLog.create.mock.invocationCallOrder[0]
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 3,
        action: "ekyc_application.approved",
        metadata: {
          applicationId: 7,
          userId: 2,
          fromStatus: "submitted",
          status: "approved",
          version: 2
        }
      })
    });
    expect(JSON.stringify((tx.auditLog.create as jest.Mock).mock.calls)).not.toContain("sealed");
  });
  it("only permits one competing expected-version decision and audits the winner", async () => {
    const { tx, repo } = setup();
    tx.ekycApplication.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const input = {
      id: 7,
      userId: 2,
      actorId: 3,
      expectedVersion: 1,
      status: "rejected" as const,
      rejectionReason: "Unclear evidence",
      now: new Date()
    };
    const results = await Promise.allSettled([repo.decide(input), repo.decide(input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
