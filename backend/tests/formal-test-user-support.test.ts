import { deleteFormalTestUserFoundations } from "../scripts/support/formal-test-user";

describe("formal test user support", () => {
  it("deletes shop employee role assignments before deleting marker-owned employees", async () => {
    const calls: string[] = [];
    const transaction = {
      userIdentity: {
        findMany: jest.fn(async () => {
          calls.push("find user identities");
          return [{ id: 31 }, { id: 32 }];
        }),
        deleteMany: jest.fn(async () => calls.push("delete user identities"))
      },
      shopEmployee: {
        findMany: jest.fn(async () => {
          calls.push("find shop employees");
          return [{ id: 41 }];
        }),
        deleteMany: jest.fn(async () => calls.push("delete shop employees"))
      },
      shopEmployeeRoleAssignment: {
        deleteMany: jest.fn(async () => calls.push("delete shop employee role assignments"))
      },
      publicIdentifier: {
        deleteMany: jest.fn(async () => calls.push("delete public identifiers"))
      },
      merchantIdentityProfile: {
        deleteMany: jest.fn(async () => calls.push("delete merchant identity profiles"))
      },
      userExperienceEntry: {
        deleteMany: jest.fn(async () => calls.push("delete user experience entries"))
      },
      userExperienceAccount: {
        deleteMany: jest.fn(async () => calls.push("delete user experience accounts"))
      },
      userRole: {
        deleteMany: jest.fn(async () => calls.push("delete user roles"))
      },
      customerProfile: {
        deleteMany: jest.fn(async () => calls.push("delete customer profiles"))
      }
    };

    await deleteFormalTestUserFoundations(transaction as never, [11, 12]);

    expect(transaction.shopEmployee.findMany).toHaveBeenCalledWith({
      where: { userId: { in: [11, 12] } },
      select: { id: true }
    });
    expect(transaction.shopEmployeeRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { shopEmployeeId: { in: [41] } }
    });
    expect(transaction.shopEmployee.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [41] } }
    });
    expect(calls.indexOf("delete shop employee role assignments")).toBeLessThan(
      calls.indexOf("delete shop employees")
    );
  });
});
