import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("BackofficeRepository formal customer membership context", () => {
  it("resolves the customer owner and granting operator without writing legacy membership fields", async () => {
    const customerFindFirst = jest.fn(async () => ({ userId: 42 }));
    const userFindFirst = jest.fn(async () => ({
      needoId: "o0000000001",
      username: "NeeDo Admin"
    }));
    const update = jest.fn();
    const repository = new BackofficeRepository({
      customerProfile: { findFirst: customerFindFirst, update },
      user: { findFirst: userFindFirst }
    } as never);

    await expect(repository.findCustomerMembershipGrantContext(44, 9)).resolves.toEqual({
      customerUserId: 42,
      membershipGrantedBy: {
        needoId: "o0000000001",
        username: "NeeDo Admin"
      }
    });
    expect(customerFindFirst).toHaveBeenCalledWith({
      where: { id: 44, deletedAt: null },
      select: { userId: true }
    });
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: 9, deletedAt: null },
      select: { needoId: true, username: true }
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns null when either the customer or granting operator is unavailable", async () => {
    const repository = new BackofficeRepository({
      customerProfile: { findFirst: jest.fn(async () => null) },
      user: { findFirst: jest.fn() }
    } as never);

    await expect(repository.findCustomerMembershipGrantContext(999, 9)).resolves.toBeNull();
  });
});
