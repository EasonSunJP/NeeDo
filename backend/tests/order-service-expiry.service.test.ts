import { OrderServiceExpiryService } from "../src/services/order-service-expiry.service";

const now = new Date("2026-09-01T10:00:00.000Z");

describe("OrderServiceExpiryService", () => {
  it("delegates the exact bounded expiry command and returns the advanced count", async () => {
    const repository = {
      moveDueSessionsToCheckout: jest.fn(async () => 2)
    };
    const service = new OrderServiceExpiryService(repository);

    await expect(service.expireDueSessions(now, 100)).resolves.toBe(2);
    expect(repository.moveDueSessionsToCheckout).toHaveBeenCalledWith({ now, batchSize: 100 });
  });

  it.each([
    [new Date("invalid"), 100],
    [now, 0],
    [now, 501],
    [now, 1.5]
  ])("rejects an invalid now or batch size", async (at, batchSize) => {
    const repository = { moveDueSessionsToCheckout: jest.fn(async () => 0) };
    const service = new OrderServiceExpiryService(repository);

    await expect(service.expireDueSessions(at, batchSize)).rejects.toMatchObject({
      statusCode: 400,
      message: "error.validation"
    });
    expect(repository.moveDueSessionsToCheckout).not.toHaveBeenCalled();
  });
});
