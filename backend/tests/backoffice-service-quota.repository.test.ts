import { BackofficeRepository } from "../src/repositories/backoffice.repository";

jest.mock("../src/prisma/client", () => ({ prisma: {} }));

describe("BackofficeRepository shop service quota", () => {
  it("lists merchant shop services with the same current-service boundary", async () => {
    const service = {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0)
    };
    const repository = new BackofficeRepository({ service } as never);

    await repository.listServices({
      scope: "merchant",
      shopId: 9,
      page: 1,
      pageSize: 100
    });

    const currentShopServiceWhere = {
      deletedAt: null,
      shopId: 9,
      technicianProfileId: null,
      status: { not: "archived" }
    };
    expect(service.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: currentShopServiceWhere
    }));
    expect(service.count).toHaveBeenCalledWith({ where: currentShopServiceWhere });
  });

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
    } as never);

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
    expect(transactionClient.service.count).toHaveBeenCalledWith({
      where: {
        shopId: 9,
        technicianProfileId: null,
        status: { not: "archived" },
        deletedAt: null
      }
    });
    expect(transactionClient.service.create).not.toHaveBeenCalled();
  });
});
