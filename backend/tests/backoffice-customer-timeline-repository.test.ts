import type { PrismaClient } from "@prisma/client";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("BackofficeRepository customer timeline", () => {
  it("excludes read-only access audits and keeps the persisted profile lifecycle total", async () => {
    const count = jest.fn().mockResolvedValue(0);
    const findMany = jest.fn();
    const repository = new BackofficeRepository({
      customerProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 44,
          userId: 2044,
          createdAt: new Date("2026-05-01T01:00:00.000Z")
        })
      },
      auditLog: { count, findMany }
    } as unknown as PrismaClient);

    const result = await repository.listCustomerTimeline({
      scope: "platform",
      id: 44,
      page: 1,
      pageSize: 10
    });

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        action: {
          notIn: ["backoffice.customer.read", "merchant_admin.customer.read"]
        }
      })
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      list: [{
        id: "profile.created:2026-05-01T01:00:00.000Z",
        action: "profile.created",
        actorName: "System",
        actorAvatarUrl: null,
        createdAt: "2026-05-01T01:00:00.000Z",
        metadata: null
      }],
      total: 1,
      page: 1,
      page_size: 10
    });
  });
});
