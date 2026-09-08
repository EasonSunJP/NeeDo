import type { PrismaClient } from "@prisma/client";
import { repairApprovedApplicationIdentifier } from "../src/repositories/identity-activation-identifier-repair.repository";
const setup = () => {
  const application = { id: 3, userId: 1826, type: "merchant", status: "approved" };
  const identity = {
    id: 7614,
    userId: 1826,
    type: "merchant_owner",
    scopeType: "shop",
    scopeId: 553,
    isActive: true,
    deletedAt: null,
    publicIdentifier: null as null | { status: string; deletedAt: Date | null; publicId: string }
  };
  const tx = {
    identityApplication: { findFirst: jest.fn(async () => application) },
    userIdentity: {
      findUnique: jest.fn(async () => identity),
      findFirst: jest.fn(async () => ({ user: { accountNo: "9616829227" } }))
    },
    userRole: { findFirst: jest.fn(async () => ({ id: 1 })) },
    publicIdentifier: { create: jest.fn(async () => ({ id: 20, publicId: "b9616829227" })) },
    auditLog: { create: jest.fn(async () => ({ id: 99 })) }
  };
  const client = {
    $transaction: jest.fn(async (fn: (db: typeof tx) => unknown) => fn(tx))
  } as unknown as PrismaClient;
  return { application, identity, tx, client };
};
describe("narrow approved identity identifier recovery", () => {
  it("repairs only the approved application identity and records system audit", async () => {
    const { tx, client } = setup();
    await expect(repairApprovedApplicationIdentifier(client, 3)).resolves.toMatchObject({
      status: "repaired",
      identityId: 7614
    });
    expect(tx.userIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activeKey: "identity-activation:1826:merchant_owner:application:3" }
      })
    );
    expect(tx.publicIdentifier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "B", userIdentityId: 7614, publicId: "b9616829227" })
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        action: "system.identity_activation.identifier_repaired",
        targetId: 7614
      })
    });
  });
  it("is idempotent without extra identifier or audit writes", async () => {
    const { identity, tx, client } = setup();
    identity.publicIdentifier = { status: "ACTIVE", deletedAt: null, publicId: "b9616829227" };
    await expect(repairApprovedApplicationIdentifier(client, 3)).resolves.toMatchObject({
      status: "verified"
    });
    expect(tx.publicIdentifier.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it("does not override disabled identifiers", async () => {
    const { identity, tx, client } = setup();
    identity.publicIdentifier = { status: "DISABLED", deletedAt: null, publicId: "b9616829227" };
    await expect(repairApprovedApplicationIdentifier(client, 3)).rejects.toThrow();
    expect(tx.publicIdentifier.create).not.toHaveBeenCalled();
  });
  it("rejects nonapproved applications without modifying roles or state", async () => {
    const { application, tx, client } = setup();
    application.status = "submitted";
    await expect(repairApprovedApplicationIdentifier(client, 3)).rejects.toThrow();
    expect(tx.publicIdentifier.create).not.toHaveBeenCalled();
  });
  it("rejects an identity without the formally assigned scoped role", async () => {
    const { tx, client } = setup();
    tx.userRole.findFirst.mockResolvedValue(null as never);
    await expect(repairApprovedApplicationIdentifier(client, 3)).rejects.toThrow();
    expect(tx.publicIdentifier.create).not.toHaveBeenCalled();
  });
});
