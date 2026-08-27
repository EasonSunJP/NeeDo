import { PublicIdentifierRepository } from "../src/repositories/public-identifier.repository";

describe("PublicIdentifierRepository", () => {
  it("resolves only an active, non-deleted exact public ID", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 1, publicId: "u0000000123" });
    const repository = new PublicIdentifierRepository({
      publicIdentifier: { findFirst }
    } as never);

    await expect(repository.findActiveByPublicId("u0000000123")).resolves.toMatchObject({
      publicId: "u0000000123"
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        publicId: "u0000000123",
        status: "ACTIVE",
        deletedAt: null
      }
    });
  });

  it("checks the active manual vanity reservation table", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 4 });
    const repository = new PublicIdentifierRepository({
      vanityNumberReservation: { findFirst }
    } as never);

    await expect(repository.isVanityNumberReserved("0077007700")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        numberPart: "0077007700",
        status: "sealed",
        deletedAt: null
      },
      select: { id: true }
    });
  });

  it("loads an alias number from the active identity account", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      user: { accountNo: "0000000123" }
    });
    const repository = new PublicIdentifierRepository({
      userIdentity: { findFirst }
    } as never);

    await expect(repository.findAccountNumberByIdentityId(42)).resolves.toBe("0000000123");
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 42,
        isActive: true,
        deletedAt: null,
        user: {
          is: {
            isActive: true,
            deletedAt: null,
            accountNo: { not: null }
          }
        }
      },
      select: {
        user: { select: { accountNo: true } }
      }
    });
  });

  it("persists a single identifier without changing service-owned data", async () => {
    const create = jest.fn().mockResolvedValue({ id: 1, publicId: "u0000000123" });
    const repository = new PublicIdentifierRepository({
      publicIdentifier: { create }
    } as never);
    const input = {
      publicId: "u0000000123",
      numberPart: "0000000123",
      kind: "U" as const,
      userIdentityId: 11,
      loginAllowed: true,
      searchable: true
    };

    await expect(repository.createIdentifier(input)).resolves.toMatchObject({
      publicId: "u0000000123"
    });
    expect(create).toHaveBeenCalledWith({ data: input });
  });

  it("creates the Shop and Customer Support pair inside one transaction", async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({ id: 1, publicId: "shop0000000123" })
      .mockResolvedValueOnce({ id: 2, publicId: "cs0000000123" });
    const transactionClient = { publicIdentifier: { create } };
    const runTransaction = jest.fn(async (handler: (client: typeof transactionClient) => unknown) =>
      handler(transactionClient)
    );
    const repository = new PublicIdentifierRepository({
      $transaction: runTransaction
    } as never);

    await expect(
      repository.createShopSupportPair({
        numberPart: "0000000123",
        shopPublicId: "shop0000000123",
        customerSupportPublicId: "cs0000000123",
        shopId: 7,
        customerSupportAccountId: 9
      })
    ).resolves.toEqual({
      shopIdentifier: { id: 1, publicId: "shop0000000123" },
      customerSupportIdentifier: { id: 2, publicId: "cs0000000123" }
    });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: {
        publicId: "shop0000000123",
        numberPart: "0000000123",
        kind: "SHOP",
        shopId: 7,
        loginAllowed: false,
        searchable: true
      }
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: {
        publicId: "cs0000000123",
        numberPart: "0000000123",
        kind: "CUSTOMER_SUPPORT",
        customerSupportAccountId: 9,
        loginAllowed: false,
        searchable: true
      }
    });
  });

  it("classifies only candidate identifier uniqueness conflicts as retryable", () => {
    const repository = new PublicIdentifierRepository({} as never);

    expect(
      repository.isRetryableIdentifierCollision({
        code: "P2002",
        meta: { target: ["public_id"] }
      })
    ).toBe(true);
    expect(
      repository.isRetryableIdentifierCollision({
        code: "P2002",
        meta: { target: ["publicId"] }
      })
    ).toBe(true);
    expect(
      repository.isRetryableIdentifierCollision({
        code: "P2002",
        meta: { target: ["kind", "numberPart"] }
      })
    ).toBe(true);
    expect(
      repository.isRetryableIdentifierCollision({
        code: "P2002",
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { index: "public_identifiers_kind_number_part_key" }
            }
          }
        }
      })
    ).toBe(true);
    expect(
      repository.isRetryableIdentifierCollision({
        code: "P2002",
        meta: { target: ["user_identity_id"] }
      })
    ).toBe(false);
    expect(repository.isRetryableIdentifierCollision(new Error("other"))).toBe(false);
  });
});
