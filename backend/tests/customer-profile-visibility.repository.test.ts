import type { PrismaClient } from "@prisma/client";
import { CustomerProfileVisibilityRepository } from "../src/repositories/customer-profile-visibility.repository";

const target = {
  profileId: 248,
  userId: 249,
  visibility: "network" as const
};

const viewer = {
  userId: 900,
  identityId: 901,
  identityType: "customer",
  identityScopeType: "customer_profile",
  identityScopeId: 900
};

const createClient = () => ({
  userIdentity: {
    findFirst: jest.fn(
      async (_args?: {
        where?: { id?: number };
      }): Promise<{
        id: number;
        type?: string;
        scopeType?: string | null;
        scopeId?: number | null;
      } | null> => {
        void _args;
        return { id: 250 };
      }
    )
  },
  contact: {
    count: jest.fn(async () => 0),
    findFirst: jest.fn(async (): Promise<{ id: number } | null> => null)
  },
  affiliateAttribution: {
    findFirst: jest.fn(async (): Promise<{ id: number } | null> => null)
  },
  shopCustomerMembership: {
    findFirst: jest.fn(async (): Promise<{ id: number } | null> => null)
  },
  bookingOrder: {
    findFirst: jest.fn(async (): Promise<{ id: number } | null> => null)
  }
});

describe("CustomerProfileVisibilityRepository", () => {
  it("allows public profiles anonymously and private profiles only to the owner", async () => {
    const client = createClient();
    const repository = new CustomerProfileVisibilityRepository(client as unknown as PrismaClient);

    await expect(repository.canView({ ...target, visibility: "public" })).resolves.toBe(true);
    await expect(repository.canView({ ...target, visibility: "privateAll" }, viewer)).resolves.toBe(
      false
    );
    await expect(
      repository.canView(
        { ...target, visibility: "privateAll" },
        { ...viewer, userId: target.userId }
      )
    ).resolves.toBe(true);
    expect(client.userIdentity.findFirst).not.toHaveBeenCalled();
  });

  it("requires reciprocal active friend contacts for limited visibility", async () => {
    const client = createClient();
    client.contact.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const repository = new CustomerProfileVisibilityRepository(client as unknown as PrismaClient);

    await expect(repository.canView({ ...target, visibility: "limited" }, viewer)).resolves.toBe(
      false
    );
    await expect(repository.canView({ ...target, visibility: "limited" }, viewer)).resolves.toBe(
      true
    );
    expect(client.contact.count).toHaveBeenLastCalledWith({
      where: {
        source: "friend_request",
        deletedAt: null,
        blockedAt: null,
        OR: [
          { ownerIdentityId: viewer.identityId, contactIdentityId: 250 },
          { ownerIdentityId: 250, contactIdentityId: viewer.identityId }
        ]
      }
    });
  });

  it("allows an active introducer attribution only in the selected identity direction", async () => {
    const client = createClient();
    client.affiliateAttribution.findFirst.mockResolvedValue({ id: 71 });
    const repository = new CustomerProfileVisibilityRepository(client as unknown as PrismaClient);

    await expect(repository.canView(target, viewer)).resolves.toBe(true);
    expect(client.affiliateAttribution.findFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: { in: ["ATTRIBUTED", "QUALIFIED", "SETTLED"] },
        claimantUserId: target.userId,
        customerUserId: viewer.userId
      },
      select: { id: true }
    });

    await expect(repository.canView({ ...target, visibility: "limited" }, viewer)).resolves.toBe(
      false
    );

    client.affiliateAttribution.findFirst.mockClear();
    await expect(repository.canView(target, { ...viewer, identityType: "scout" })).resolves.toBe(
      true
    );
    expect(client.affiliateAttribution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          claimantUserId: viewer.userId,
          customerUserId: target.userId
        })
      })
    );
  });

  it("does not inherit an affiliate relationship while a non-affiliate identity is selected", async () => {
    const client = createClient();
    client.affiliateAttribution.findFirst.mockResolvedValue({ id: 71 });
    const repository = new CustomerProfileVisibilityRepository(client as unknown as PrismaClient);

    await expect(
      repository.canView(target, {
        ...viewer,
        identityType: "technician",
        identityScopeType: "technician_profile",
        identityScopeId: 134
      })
    ).resolves.toBe(false);
    expect(client.affiliateAttribution.findFirst).not.toHaveBeenCalled();
  });

  it("allows an active non-friend business contact only for network visibility", async () => {
    const client = createClient();
    client.contact.findFirst.mockResolvedValue({ id: 72 });
    const repository = new CustomerProfileVisibilityRepository(client as unknown as PrismaClient);

    await expect(repository.canView(target, viewer)).resolves.toBe(true);
    expect(client.contact.findFirst).toHaveBeenCalledWith({
      where: {
        source: { not: "friend_request" },
        deletedAt: null,
        blockedAt: null,
        OR: [
          { ownerIdentityId: viewer.identityId, contactIdentityId: 250 },
          { ownerIdentityId: 250, contactIdentityId: viewer.identityId }
        ]
      },
      select: { id: true }
    });
    await expect(repository.canView({ ...target, visibility: "limited" }, viewer)).resolves.toBe(
      false
    );
  });

  it("allows only the current merchant shop or technician booking relationship", async () => {
    const merchantClient = createClient();
    merchantClient.shopCustomerMembership.findFirst.mockResolvedValue({ id: 81 });
    const merchantRepository = new CustomerProfileVisibilityRepository(
      merchantClient as unknown as PrismaClient
    );
    await expect(
      merchantRepository.canView(target, {
        ...viewer,
        identityType: "merchant_owner",
        identityScopeType: "shop",
        identityScopeId: 21
      })
    ).resolves.toBe(true);
    expect(merchantClient.shopCustomerMembership.findFirst).toHaveBeenCalledWith({
      where: {
        shopId: 21,
        customerProfileId: target.profileId,
        status: "ACTIVE",
        endedAt: null,
        deletedAt: null
      },
      select: { id: true }
    });

    const technicianClient = createClient();
    technicianClient.bookingOrder.findFirst.mockResolvedValue({ id: 91 });
    const technicianRepository = new CustomerProfileVisibilityRepository(
      technicianClient as unknown as PrismaClient
    );
    await expect(
      technicianRepository.canView(target, {
        ...viewer,
        identityType: "technician",
        identityScopeType: "technician_profile",
        identityScopeId: 134
      })
    ).resolves.toBe(true);
    expect(technicianClient.bookingOrder.findFirst).toHaveBeenCalledWith({
      where: {
        customerUserId: target.userId,
        technicianProfileId: 134,
        deletedAt: null
      },
      select: { id: true }
    });
  });

  it("recognizes a selected shop for a formal merchant organization identity", async () => {
    const client = createClient();
    client.shopCustomerMembership.findFirst.mockResolvedValue({ id: 81 });
    const repository = new CustomerProfileVisibilityRepository(client as unknown as PrismaClient);

    await expect(
      repository.canView(target, {
        ...viewer,
        identityType: "merchant_organization",
        identityScopeType: "shop",
        identityScopeId: 21
      })
    ).resolves.toBe(true);
  });

  it("denies unrelated merchant identities without falling back to another identity on the account", async () => {
    const client = createClient();
    const repository = new CustomerProfileVisibilityRepository(client as unknown as PrismaClient);

    await expect(
      repository.canView(target, {
        ...viewer,
        identityType: "merchant_owner",
        identityScopeType: "shop",
        identityScopeId: 999
      })
    ).resolves.toBe(false);
  });

  it("resolves the selected viewer identity for directory callers before checking bookings", async () => {
    const client = createClient();
    client.userIdentity.findFirst.mockImplementation(async (args?: { where?: { id?: number } }) =>
      args?.where?.id === viewer.identityId
        ? {
            id: viewer.identityId,
            type: "technician",
            scopeType: "technician_profile",
            scopeId: 134
          }
        : { id: 250 }
    );
    client.bookingOrder.findFirst.mockResolvedValue({ id: 91 });
    const repository = new CustomerProfileVisibilityRepository(client as unknown as PrismaClient);

    await expect(
      repository.canView(target, { userId: viewer.userId, identityId: viewer.identityId })
    ).resolves.toBe(true);
    expect(client.userIdentity.findFirst).toHaveBeenCalledWith({
      where: {
        id: viewer.identityId,
        userId: viewer.userId,
        isActive: true,
        deletedAt: null
      },
      select: { id: true, type: true, scopeType: true, scopeId: true }
    });
  });
});
