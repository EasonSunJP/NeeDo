import { OrderServiceExpiryService } from "../src/services/order-service-expiry.service";
import { LiveDashboardOrderChangePublisher } from "../src/services/live-dashboard-order-change.publisher";

const now = new Date("2026-09-01T10:00:00.000Z");

describe("OrderServiceExpiryService", () => {
  it("delegates the exact bounded expiry command and returns the advanced count", async () => {
    const repository = {
      moveDueSessionsToCheckout: jest.fn(async () => [41, 42])
    };
    const publisher = { publishCommittedOrderChanges: jest.fn(async () => undefined) };
    const service = new OrderServiceExpiryService(repository, publisher);

    await expect(service.expireDueSessions(now, 100)).resolves.toBe(2);
    expect(repository.moveDueSessionsToCheckout).toHaveBeenCalledWith({ now, batchSize: 100 });
    expect(publisher.publishCommittedOrderChanges).toHaveBeenCalledWith([41, 42]);
  });

  it("does not publish an idempotent replay with no applied expiry transitions", async () => {
    const repository = { moveDueSessionsToCheckout: jest.fn(async () => []) };
    const publisher = { publishCommittedOrderChanges: jest.fn(async () => undefined) };
    const service = new OrderServiceExpiryService(repository, publisher);

    await expect(service.expireDueSessions(now, 100)).resolves.toBe(0);

    expect(publisher.publishCommittedOrderChanges).toHaveBeenCalledWith([]);
  });

  it("keeps committed expiry successful when projection or event publishing fails", async () => {
    const committedRepository = { moveDueSessionsToCheckout: jest.fn(async () => [41]) };
    const projectionFailure = new LiveDashboardOrderChangePublisher(
      {
        findLiveDashboardOrderEvents: jest.fn(async () => {
          throw new Error("projection unavailable");
        })
      },
      { publish: jest.fn(async () => null) },
      jest.fn()
    );
    const projectionService = new OrderServiceExpiryService(committedRepository, projectionFailure);

    await expect(projectionService.expireDueSessions(now, 100)).resolves.toBe(1);

    const publishFailure = new LiveDashboardOrderChangePublisher(
      {
        findLiveDashboardOrderEvents: jest.fn(async () => [
          {
            orderId: 41,
            scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
            orderNo: "ND41",
            status: "awaitingCheckout" as const,
            serviceName: "Service",
            amountJpy: 8_800
          }
        ])
      },
      {
        publish: jest.fn(async () => {
          throw new Error("stream unavailable");
        })
      },
      jest.fn()
    );
    const publishService = new OrderServiceExpiryService(committedRepository, publishFailure);

    await expect(publishService.expireDueSessions(now, 100)).resolves.toBe(1);
  });

  it.each([
    [new Date("invalid"), 100],
    [now, 0],
    [now, 501],
    [now, 1.5]
  ])("rejects an invalid now or batch size", async (at, batchSize) => {
    const repository = { moveDueSessionsToCheckout: jest.fn(async () => []) };
    const service = new OrderServiceExpiryService(repository);

    await expect(service.expireDueSessions(at, batchSize)).rejects.toMatchObject({
      statusCode: 400,
      message: "error.validation"
    });
    expect(repository.moveDueSessionsToCheckout).not.toHaveBeenCalled();
  });
});
