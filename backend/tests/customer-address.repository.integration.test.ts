import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { disconnectPrisma, prisma } from "../src/prisma/client";
import { CustomerAddressRepository } from "../src/repositories/customer-address.repository";
import { UserRepository } from "../src/repositories/user.repository";

const runIntegration = process.env.RUN_CUSTOMER_PROFILE_REPOSITORY_INTEGRATION === "true";
const describeIntegration = runIntegration ? describe : describe.skip;
const marker = `customer-address-repository-${randomUUID()}`;
const userIds: number[] = [];
const profileIds: number[] = [];

describeIntegration("CustomerAddressRepository MySQL integration", () => {
  const repository = new CustomerAddressRepository(prisma);

  beforeAll(async () => {
    for (const suffix of ["owner", "other"]) {
      const user = await new UserRepository(prisma).create({
        email: `${marker}-${suffix}@needo.local`,
        isActive: true,
        passwordHash: "integration-test-password-hash",
        username: `${marker}-${suffix}`
      });
      userIds.push(user.id);
      const profile = await prisma.customerProfile.findUniqueOrThrow({ where: { userId: user.id } });
      profileIds.push(profile.id);
    }
  }, 30_000);

  afterAll(async () => {
    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.customerAddress.deleteMany({ where: { customerProfileId: { in: profileIds } } });
      await prisma.customerProfile.deleteMany({ where: { id: { in: profileIds } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userExperienceAccount.deleteMany({ where: { userId: { in: userIds } } });
      const identities = await prisma.userIdentity.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
      await prisma.publicIdentifier.deleteMany({ where: { userIdentityId: { in: identities.map(({ id }) => id) } } });
      await prisma.userIdentity.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await disconnectPrisma();
  }, 30_000);

  it("persists defaults across hard rereads and rejects cross-account mutation", async () => {
    const first = await repository.createMine(
      userIds[0]!,
      profileIds[0]!,
      {
        label: "自宅",
        countryCode: "JP",
        postalCode: "1600022",
        admin1Code: "13",
        prefecture: "東京都",
        admin2Code: "13104",
        city: "新宿区",
        addressLine1: "新宿1-1-1",
        addressLine2: null,
        building: null
      },
      { action: "customer_address.self_create", actorId: userIds[0]!, targetId: null, targetType: "CustomerAddress" }
    );
    expect(first.isDefault).toBe(true);

    const second = await repository.createMine(
      userIds[0]!,
      profileIds[0]!,
      {
        label: "会社",
        countryCode: "JP",
        postalCode: "1000005",
        admin1Code: "13",
        prefecture: "東京都",
        admin2Code: "13101",
        city: "千代田区",
        addressLine1: "丸の内1-1-1",
        addressLine2: null,
        building: "NeeDo Tower",
        isDefault: true
      },
      { action: "customer_address.self_create", actorId: userIds[0]!, targetId: null, targetType: "CustomerAddress" }
    );

    await expect(repository.listMine(userIds[0]!, profileIds[0]!, { page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: [expect.objectContaining({ publicId: second.publicId, isDefault: true }), expect.objectContaining({ publicId: first.publicId, isDefault: false })],
      total: 2
    });
    await expect(
      repository.updateMine(
        userIds[1]!,
        profileIds[1]!,
        second.publicId,
        { label: "越权修改" },
        { action: "customer_address.self_update", actorId: userIds[1]!, targetId: null, targetType: "CustomerAddress" }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      repository.deleteMine(
        userIds[1]!,
        profileIds[1]!,
        second.publicId,
        { action: "customer_address.self_delete", actorId: userIds[1]!, targetId: null, targetType: "CustomerAddress" }
      )
    ).rejects.toMatchObject({ statusCode: 404 });

    await repository.deleteMine(
      userIds[0]!,
      profileIds[0]!,
      second.publicId,
      { action: "customer_address.self_delete", actorId: userIds[0]!, targetId: null, targetType: "CustomerAddress" }
    );
    await expect(repository.listMine(userIds[0]!, profileIds[0]!, { page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: [expect.objectContaining({ publicId: first.publicId, isDefault: true })],
      total: 1
    });
    await expect(prisma.auditLog.count({ where: { actorId: userIds[0]!, targetType: "CustomerAddress" } })).resolves.toBe(3);
  });
});
