import {
  auditUnifiedIdentityCutover,
  type UnifiedIdentityAuditClient
} from "../scripts/audit-unified-identity-cutover";

const mutationMethodNames = [
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany"
] as const;

type MutationMethodName = (typeof mutationMethodNames)[number];
type ReadDelegateTestDouble = {
  count: jest.Mock;
  findMany: jest.Mock;
  groupBy: jest.Mock;
} & Record<MutationMethodName, jest.Mock>;

const createReadDelegate = (count: number): ReadDelegateTestDouble => {
  const mutationSpies = Object.fromEntries(
    mutationMethodNames.map((methodName) => [methodName, jest.fn()])
  );

  return {
    count: jest.fn().mockResolvedValue(count),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
    ...mutationSpies
  } as ReadDelegateTestDouble;
};

describe("unified identity cutover audit", () => {
  it("classifies every legacy ownership surface without mutating data", async () => {
    const delegates = {
      user: createReadDelegate(4),
      userIdentity: createReadDelegate(7),
      customerProfile: createReadDelegate(3),
      technicianProfile: createReadDelegate(2),
      shop: createReadDelegate(2),
      merchantAccount: createReadDelegate(1),
      contact: createReadDelegate(5),
      friendRequest: createReadDelegate(6),
      conversationParticipant: createReadDelegate(8),
      message: createReadDelegate(9),
      socialPost: createReadDelegate(10),
      follow: createReadDelegate(11),
      notification: createReadDelegate(12),
      bookingOrder: createReadDelegate(13),
      wallet: createReadDelegate(14),
      ledgerTransaction: createReadDelegate(15)
    };
    delegates.user.count.mockResolvedValueOnce(4).mockResolvedValueOnce(3);
    delegates.userIdentity.groupBy.mockResolvedValue([
      { type: "customer", _count: { _all: 4 } },
      { type: "technician", _count: { _all: 2 } },
      { type: "merchant_owner", _count: { _all: 1 } }
    ]);
    delegates.message.findMany.mockResolvedValue([
      { id: 1, metadata: { needoId: "n0000000237" } },
      { id: 2, metadata: { attachment: { systemId: "u0000000001" } } },
      { id: 3, metadata: null }
    ]);

    const report = await auditUnifiedIdentityCutover(
      delegates as unknown as UnifiedIdentityAuditClient,
      { frontendSystemIdReferences: 122 }
    );

    expect(report.legacyIdentifierCounts).toMatchObject({
      userNeedoId: 3,
      frontendSystemIdReferences: 122,
      persistedMessageIdentifierSnapshots: 2
    });
    expect(report.modelCoverage).toMatchObject({
      User: 4,
      UserIdentity: 7,
      CustomerProfile: 3,
      TechnicianProfile: 2,
      Shop: 2,
      MerchantAccount: 1,
      Contact: 5,
      FriendRequest: 6,
      ConversationParticipant: 8,
      Message: 9,
      SocialPost: 10,
      Follow: 11,
      Notification: 12,
      BookingOrder: 13,
      Wallet: 14,
      LedgerTransaction: 15
    });
    expect(report.identityTypeCounts).toEqual({
      customer: 4,
      technician: 2,
      merchant_owner: 1
    });
    expect(delegates.user.count).toHaveBeenNthCalledWith(2, {
      where: {
        needoId: { startsWith: "n" },
        NOT: { needoId: { startsWith: "needo" } }
      }
    });
    expect(report.unresolvedOwnership).toEqual(expect.any(Array));
    expect(report.unresolvedOwnership).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ model: "User", relation: "primaryIdentity" }),
        expect.objectContaining({ model: "Contact", relation: "ownerUserId" }),
        expect.objectContaining({ model: "Message", relation: "senderUserId" }),
        expect.objectContaining({ model: "Wallet", relation: "ownerId" })
      ])
    );
    expect(report.mutatedRows).toBe(0);

    for (const delegate of Object.values(delegates)) {
      for (const methodName of mutationMethodNames) {
        expect(delegate[methodName]).not.toHaveBeenCalled();
      }
    }
  });
});
