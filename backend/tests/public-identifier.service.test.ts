import { ERROR_CODES } from "../src/constants/error-codes";
import {
  IdentifierAllocator,
  formatPersonId,
  isReservedVanityNumber,
  type PublicIdentifierRecord,
  type PublicIdentifierRepositoryPort
} from "../src/services/public-identifier.service";
import { publicIdentifierSchema } from "../src/validators/public-identifier.validator";

const identifierRecord = (
  publicId: string,
  overrides: Partial<PublicIdentifierRecord> = {}
): PublicIdentifierRecord => ({
  id: 1,
  publicId,
  numberPart: publicId.slice(publicId.length - 10),
  kind: "U",
  loginAllowed: true,
  searchable: true,
  status: "ACTIVE",
  userIdentityId: 1,
  shopId: null,
  merchantAccountId: null,
  customerSupportAccountId: null,
  ...overrides
});

const repositoryDouble = (): jest.Mocked<PublicIdentifierRepositoryPort> => ({
  findActiveByPublicId: jest.fn(),
  findAccountNumberByIdentityId: jest.fn(),
  isVanityNumberReserved: jest.fn().mockResolvedValue(false),
  createIdentifier: jest.fn(),
  createShopSupportPair: jest.fn(),
  isRetryableIdentifierCollision: jest.fn().mockReturnValue(false)
});

const assertRandomAllocationTypeBoundary = (allocator: IdentifierAllocator): void => {
  // @ts-expect-error S/B/O must reuse accountNo through registerPersonAlias.
  void allocator.allocate({ kind: "S", userIdentityId: 41 });
};
void assertRandomAllocationTypeBoundary;

describe("formal public identifiers", () => {
  it("formats every personnel identity with the shared ten-digit account number", () => {
    expect(formatPersonId("U", "0000000123")).toBe("u0000000123");
    expect(formatPersonId("NEEDO", "0000000123")).toBe("needo0000000123");
    expect(formatPersonId("S", "0000000123")).toBe("s0000000123");
    expect(formatPersonId("B", "0000000123")).toBe("b0000000123");
    expect(formatPersonId("O", "0000000123")).toBe("o0000000123");
  });

  it("registers S/B/O aliases from the existing account number without random allocation", async () => {
    const repository = repositoryDouble();
    repository.findAccountNumberByIdentityId.mockResolvedValue("0000000123");
    repository.createIdentifier.mockResolvedValue(
      identifierRecord("b0000000123", {
        kind: "B",
        numberPart: "0000000123",
        userIdentityId: 42
      })
    );
    const nextCandidate = jest.fn(() => "5831047296");
    const allocator = new IdentifierAllocator(repository, nextCandidate);

    await expect(
      allocator.registerPersonAlias({
        kind: "B",
        userIdentityId: 42
      })
    ).resolves.toMatchObject({ publicId: "b0000000123" });
    expect(nextCandidate).not.toHaveBeenCalled();
    expect(repository.findAccountNumberByIdentityId).toHaveBeenCalledWith(42);
    expect(repository.createIdentifier).toHaveBeenCalledWith({
      publicId: "b0000000123",
      numberPart: "0000000123",
      kind: "B",
      userIdentityId: 42,
      loginAllowed: true,
      searchable: true
    });
  });

  it("rejects alias registration when the identity has no allocated account number", async () => {
    const repository = repositoryDouble();
    repository.findAccountNumberByIdentityId.mockResolvedValue(null);
    const allocator = new IdentifierAllocator(repository, () => "5831047296");

    await expect(
      allocator.registerPersonAlias({ kind: "S", userIdentityId: 42 })
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_NOT_FOUND,
      message: "error.identifier.account_number_unavailable",
      statusCode: 404
    });
    expect(repository.createIdentifier).not.toHaveBeenCalled();
  });

  it("recognizes only approved exact lowercase public identifier formats", () => {
    expect(publicIdentifierSchema.parse("u0000000123")).toEqual({
      publicId: "u0000000123",
      kind: "U",
      numberPart: "0000000123"
    });
    expect(publicIdentifierSchema.parse("shop0000000123")).toEqual({
      publicId: "shop0000000123",
      kind: "SHOP",
      numberPart: "0000000123"
    });
    expect(publicIdentifierSchema.safeParse("n0000000123").success).toBe(false);
    expect(publicIdentifierSchema.safeParse("U0000000123").success).toBe(false);
    expect(publicIdentifierSchema.safeParse(" u0000000123 ").success).toBe(false);
  });

  it.each(["6666661234", "1234567890", "9876543210", "0077007700"])(
    "seals the approved vanity pattern %s",
    (numberPart) => {
      expect(isReservedVanityNumber(numberPart)).toBe(true);
    }
  );

  it("does not classify an ordinary ten-digit number as vanity", () => {
    expect(isReservedVanityNumber("5831047296")).toBe(false);
  });

  it("skips rule-based and manually sealed candidates before writing", async () => {
    const repository = repositoryDouble();
    repository.isVanityNumberReserved.mockImplementation(
      async (numberPart: string) => numberPart === "1357902468"
    );
    repository.createIdentifier.mockResolvedValue(
      identifierRecord("u3141592653", { numberPart: "3141592653" })
    );
    const nextCandidate = jest
      .fn(() => "3141592653")
      .mockReturnValueOnce("6666661234")
      .mockReturnValueOnce("1357902468")
      .mockReturnValueOnce("3141592653");
    const allocator = new IdentifierAllocator(repository, nextCandidate);

    await expect(allocator.allocate({ kind: "U", userIdentityId: 41 })).resolves.toMatchObject({
      publicId: "u3141592653",
      numberPart: "3141592653"
    });
    expect(repository.createIdentifier).toHaveBeenCalledTimes(1);
    expect(repository.createIdentifier).toHaveBeenCalledWith({
      publicId: "u3141592653",
      numberPart: "3141592653",
      kind: "U",
      userIdentityId: 41,
      loginAllowed: true,
      searchable: true
    });
  });

  it("retries an identifier uniqueness collision and succeeds with the next candidate", async () => {
    const repository = repositoryDouble();
    const collision = new Error("identifier collision");
    repository.isRetryableIdentifierCollision.mockImplementation(
      (error: unknown) => error === collision
    );
    repository.createIdentifier
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce(identifierRecord("u3141592653", { numberPart: "3141592653" }));
    const nextCandidate = jest
      .fn(() => "3141592653")
      .mockReturnValueOnce("5831047296")
      .mockReturnValueOnce("3141592653");
    const allocator = new IdentifierAllocator(repository, nextCandidate);

    await expect(allocator.allocate({ kind: "U", userIdentityId: 41 })).resolves.toMatchObject({
      publicId: "u3141592653"
    });
    expect(repository.createIdentifier).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-unique persistence failure", async () => {
    const repository = repositoryDouble();
    const failure = new Error("database unavailable");
    repository.createIdentifier.mockRejectedValue(failure);
    const allocator = new IdentifierAllocator(repository, () => "5831047296");

    await expect(allocator.allocate({ kind: "U", userIdentityId: 41 })).rejects.toBe(failure);
    expect(repository.createIdentifier).toHaveBeenCalledTimes(1);
  });

  it("returns the stable allocation-busy domain error after eight collisions", async () => {
    const repository = repositoryDouble();
    const collision = new Error("identifier collision");
    repository.isRetryableIdentifierCollision.mockReturnValue(true);
    repository.createIdentifier.mockRejectedValue(collision);
    const candidates = [
      "5831047296",
      "3141592653",
      "2718281828",
      "6029384751",
      "4901726385",
      "8514072936",
      "7304826159",
      "2695173048"
    ];
    const allocator = new IdentifierAllocator(repository, () => candidates.shift() ?? "5831047296");

    await expect(allocator.allocate({ kind: "U", userIdentityId: 41 })).rejects.toMatchObject({
      code: ERROR_CODES.PUBLIC_IDENTIFIER_ALLOCATION_UNAVAILABLE,
      message: "error.identifier.allocation_busy",
      statusCode: 503,
      attempts: 8
    });
    expect(repository.createIdentifier).toHaveBeenCalledTimes(8);
  });

  it("registers Shop and Customer Support identifiers atomically with one number", async () => {
    const repository = repositoryDouble();
    repository.createShopSupportPair.mockResolvedValue({
      shopIdentifier: identifierRecord("shop5831047296", {
        kind: "SHOP",
        loginAllowed: false,
        searchable: true,
        userIdentityId: null,
        shopId: 7
      }),
      customerSupportIdentifier: identifierRecord("cs5831047296", {
        kind: "CUSTOMER_SUPPORT",
        loginAllowed: false,
        searchable: true,
        userIdentityId: null,
        customerSupportAccountId: 9
      })
    });
    const allocator = new IdentifierAllocator(repository, () => "5831047296");

    await expect(
      allocator.allocateShopSupportPair({ shopId: 7, customerSupportAccountId: 9 })
    ).resolves.toMatchObject({
      shopIdentifier: { publicId: "shop5831047296" },
      customerSupportIdentifier: { publicId: "cs5831047296" }
    });
    expect(repository.createShopSupportPair).toHaveBeenCalledWith({
      numberPart: "5831047296",
      shopPublicId: "shop5831047296",
      customerSupportPublicId: "cs5831047296",
      shopId: 7,
      customerSupportAccountId: 9
    });
  });

  it("resolves only a valid active public identifier", async () => {
    const repository = repositoryDouble();
    repository.findActiveByPublicId.mockResolvedValue(identifierRecord("b5831047296"));
    const allocator = new IdentifierAllocator(repository, () => "5831047296");

    await expect(allocator.resolve("b5831047296")).resolves.toMatchObject({
      publicId: "b5831047296"
    });
    await expect(allocator.resolve("n0000000123")).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION,
      message: "error.identifier.invalid",
      statusCode: 400
    });
    expect(repository.findActiveByPublicId).toHaveBeenCalledTimes(1);
  });
});
