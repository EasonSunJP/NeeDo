import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("merchant technician list identity data", () => {
  it("returns the technician identity avatar instead of the later personal avatar", async () => {
    const createdAt = new Date("2026-08-25T00:00:00.000Z");
    const client = {
      technicianProfile: {
        findMany: jest.fn(async () => [
          {
            id: 31,
            userId: 41,
            shopId: 16,
            displayName: "佐藤 美咲",
            bio: null,
            city: "Tokyo",
            serviceArea: "Shibuya",
            yearsExperience: 5,
            employmentType: "FULL_TIME",
            employmentStartedAt: createdAt,
            visibility: "privateAll",
            status: "published",
            isRecommended: false,
            verifiedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            user: {
              needoId: "u0000000041",
              email: "sim.technician.001@needo.local",
              avatarUrl: "/images/generated/profiles/personal-later.jpg",
              avatarBootstrapUrl: "/images/generated/profiles/first-avatar.jpg",
              identities: [
                { publicIdentifier: { publicId: "s0000000041", kind: "S" } }
              ]
            },
            mediaAssets: [{ url: "/images/generated/profiles/technician-only.jpg" }],
            shop: { name: "Tokyo Relax Shibuya" },
            reviewSummary: null
          }
        ]),
        count: jest.fn(async () => 1)
      },
      technicianWorkState: { findMany: jest.fn(async () => []) },
      bookingOrder: { findMany: jest.fn(async () => []) }
    };
    const repository = new BackofficeRepository(client as never);

    const result = await repository.listTechnicians({
      scope: "merchant",
      shopId: 16,
      status: "published",
      page: 1,
      pageSize: 20
    });

    expect(result.list).toEqual([
      expect.objectContaining({
        id: 31,
        userId: 41,
        needoId: "s0000000041",
        avatarUrl: "/images/generated/profiles/technician-only.jpg",
        employmentType: "full_time",
        employmentStartedAt: "2026-08-25T00:00:00.000Z",
        visibility: "privateAll",
        rating: 5,
        reviewCount: 0
      })
    ]);
    expect(client.technicianProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: expect.objectContaining({
            deletedAt: null,
            identities: {
              some: expect.objectContaining({
                type: "technician",
                isActive: true,
                deletedAt: null,
                publicIdentifier: {
                  is: { kind: "S", status: "ACTIVE", deletedAt: null }
                }
              })
            }
          })
        })
      })
    );
  });
});
