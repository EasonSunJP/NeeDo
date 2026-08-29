import { describe, expect, it, jest } from "@jest/globals";
import type { AuthRepositoryPort, AuthUserRecord } from "../src/repositories/auth.repository";
import { PersonalIdentityScopeService } from "../src/services/personal-identity-scope.service";

const now = new Date("2026-08-30T00:00:00.000Z");

const identity = (
  id: number,
  type: string,
  options: { isDefault?: boolean; isActive?: boolean; deletedAt?: Date | null } = {}
) => ({
  id,
  userId: 7,
  type,
  scopeType: type === "technician" ? "technician_profile" : type === "customer" ? "customer_profile" : "global",
  scopeId: type === "technician" ? 31 : type === "customer" ? 17 : null,
  displayName: type,
  isDefault: options.isDefault ?? false,
  isActive: options.isActive ?? true,
  deletedAt: options.deletedAt ?? null
});

const user = (identities: AuthUserRecord["identities"]): AuthUserRecord => ({
  id: 7,
  needoId: "u1234567890",
  email: "person@example.com",
  phone: null,
  passwordHash: "hash",
  username: "Formal Person",
  avatarUrl: null,
  isActive: true,
  accessState: { disabled: false, restricted: false },
  lastLoginAt: now,
  deletedAt: null,
  identities,
  userRoles: []
});

const repository = (record: AuthUserRecord | null) => ({
  findUserById: jest.fn(async () => record)
}) as unknown as AuthRepositoryPort;

describe("PersonalIdentityScopeService", () => {
  it("resolves a customer identity to itself", async () => {
    const service = new PersonalIdentityScopeService(repository(user([
      identity(70, "customer", { isDefault: true }),
      identity(71, "scout")
    ])));

    await expect(service.resolve({
      userId: 7,
      currentIdentityId: 70,
      currentIdentityType: "customer"
    })).resolves.toEqual({ identityId: 70, userId: 7, identityType: "customer" });
  });

  it("resolves an affiliate identity to the same account customer identity", async () => {
    const service = new PersonalIdentityScopeService(repository(user([
      identity(70, "customer", { isDefault: true }),
      identity(71, "scout")
    ])));

    await expect(service.resolve({
      userId: 7,
      currentIdentityId: 71,
      currentIdentityType: "scout"
    })).resolves.toEqual({ identityId: 70, userId: 7, identityType: "customer" });
  });

  it.each([
    ["technician", 72],
    ["merchant_owner", 73]
  ])("keeps %s in its own identity scope", async (type, id) => {
    const service = new PersonalIdentityScopeService(repository(user([
      identity(70, "customer", { isDefault: true }),
      identity(id, type)
    ])));

    await expect(service.resolve({
      userId: 7,
      currentIdentityId: id,
      currentIdentityType: type
    })).resolves.toEqual({ identityId: id, userId: 7, identityType: type });
  });

  it.each([
    ["missing identity", user([identity(70, "customer")]), 999, "customer"],
    ["inactive identity", user([identity(70, "customer", { isActive: false })]), 70, "customer"],
    ["deleted identity", user([identity(70, "customer", { deletedAt: now })]), 70, "customer"],
    ["token type mismatch", user([identity(70, "customer")]), 70, "technician"]
  ])("rejects %s", async (_label, record, currentIdentityId, currentIdentityType) => {
    const service = new PersonalIdentityScopeService(repository(record));

    await expect(service.resolve({ userId: 7, currentIdentityId, currentIdentityType }))
      .rejects.toMatchObject({ statusCode: 403, message: "error.auth.identity_not_found" });
  });

  it("rejects an affiliate identity when the account has no active customer identity", async () => {
    const service = new PersonalIdentityScopeService(repository(user([
      identity(71, "scout"),
      identity(70, "customer", { isActive: false })
    ])));

    await expect(service.resolve({
      userId: 7,
      currentIdentityId: 71,
      currentIdentityType: "scout"
    })).rejects.toMatchObject({ statusCode: 403, message: "error.auth.identity_not_found" });
  });
});
