import { LedgerRepository } from "../src/repositories/ledger.repository";

describe("LedgerRepository wallet creation", () => {
  it("uses an atomic idempotent insert for concurrent wallet creation", async () => {
    const wallet = {
      id: 91,
      ownerType: "USER",
      ownerId: 501,
      currency: "NDP",
      availableBalance: 0,
      frozenBalance: 0,
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      deletedAt: null
    };
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      wallet: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(wallet)
      }
    };
    const repository = new LedgerRepository(client as never);

    await expect(
      repository.getOrCreateWallet({ ownerType: "user", ownerId: 501, currency: "NDP" })
    ).resolves.toMatchObject({ id: 91, ownerType: "user", ownerId: 501 });
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.wallet.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: 501,
          currency: "NDP"
        }
      }
    });
  });
});
