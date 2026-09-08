import type { PrismaClient } from "@prisma/client";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("BackofficeRepository shop service quota", () => {
  it("serializes creation by shop and rejects a twenty-first active service", async () => {
    const transactionClient = {
      $queryRaw: jest.fn(async () => [{ id: 9 }]),
      shop: { findFirst: jest.fn(async () => ({ id: 9 })) },
      category: { findFirst: jest.fn(async () => ({ id: 2 })) },
      technicianProfile: { findFirst: jest.fn(async () => ({ id: 3 })) },
      service: {
        count: jest.fn(async () => 20),
        create: jest.fn()
      }
    };
    const repository = new BackofficeRepository({
      $transaction: jest.fn((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient))
    } as unknown as PrismaClient);

    await expect(repository.createService({
      scope: "merchant",
      shopId: 9,
      categoryId: 2,
      technicianProfileId: null,
      name: "第 21 个服务",
      description: null,
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: 8_800,
      durationMinutes: 60,
      status: "published",
      isRecommended: false,
      sortOrder: 20
    })).rejects.toMatchObject({
      message: "error.service.limit_reached",
      statusCode: 409
    });

    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transactionClient.service.create).not.toHaveBeenCalled();
  });
});
