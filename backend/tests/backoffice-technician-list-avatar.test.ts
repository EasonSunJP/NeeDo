import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("merchant technician list identity data", () => {
  it("returns the persisted user avatar for each shop-scoped technician", async () => {
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
            status: "published",
            isRecommended: false,
            verifiedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            user: {
              needoId: "n0000000041",
              email: "sim.technician.001@needo.local",
              avatarUrl: "/images/generated/profiles/ai-profile-01.jpg"
            },
            shop: { name: "Tokyo Relax Shibuya" }
          }
        ]),
        count: jest.fn(async () => 1)
      }
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
        needoId: "n0000000041",
        avatarUrl: "/images/generated/profiles/ai-profile-01.jpg",
        employmentType: "full_time",
        employmentStartedAt: "2026-08-25T00:00:00.000Z"
      })
    ]);
  });
});
