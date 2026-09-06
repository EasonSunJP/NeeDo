import type { LiveDashboardEventDraft } from "../src/domain/live-dashboard";
import {
  LiveDashboardOrderChangePublisher,
  type LiveDashboardOrderChangeFailure
} from "../src/services/live-dashboard-order-change.publisher";

const projection = (orderId: number) => ({
  orderId,
  scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
  orderNo: `ND${orderId}`,
  status: "cancelled" as const,
  serviceName: "整体",
  amountJpy: 9000
});

describe("LiveDashboardOrderChangePublisher", () => {
  it("batch-fetches every changed order once and publishes one compact pair per projection", async () => {
    const repository = {
      findLiveDashboardOrderEvents: jest.fn(async () => [
        projection(11),
        projection(12),
        projection(13)
      ])
    };
    const eventPublisher = {
      publish: jest.fn(async (event: LiveDashboardEventDraft) => {
        void event;
        return null;
      })
    };
    const publisher = new LiveDashboardOrderChangePublisher(repository, eventPublisher);

    await publisher.publishCommittedOrderChanges([11, 12, 11, 13]);

    expect(repository.findLiveDashboardOrderEvents).toHaveBeenCalledTimes(1);
    expect(repository.findLiveDashboardOrderEvents).toHaveBeenCalledWith([11, 12, 13]);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(6);
    const orderNos = eventPublisher.publish.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === "order.changed")
      .map((event) => event.payload.orderNo);
    expect(new Set(orderNos)).toEqual(new Set(["ND11", "ND12", "ND13"]));
  });

  it("contains batch projection and individual publish failures after commit", async () => {
    const errors: Array<{ operation: string; orderId?: number }> = [];
    const failedProjection = new LiveDashboardOrderChangePublisher(
      {
        findLiveDashboardOrderEvents: jest.fn(async () => {
          throw new Error("projection unavailable");
        })
      },
      { publish: jest.fn() },
      (error: LiveDashboardOrderChangeFailure) => errors.push(error)
    );
    await expect(failedProjection.publishCommittedOrderChanges([11, 12])).resolves.toBeUndefined();

    const eventPublisher = {
      publish: jest.fn(async () => {
        throw new Error("stream unavailable");
      })
    };
    const failedPublish = new LiveDashboardOrderChangePublisher(
      { findLiveDashboardOrderEvents: jest.fn(async () => [projection(11), projection(12)]) },
      eventPublisher,
      (error: LiveDashboardOrderChangeFailure) => errors.push(error)
    );
    await expect(failedPublish.publishCommittedOrderChanges([11, 12])).resolves.toBeUndefined();

    expect(eventPublisher.publish).toHaveBeenCalledTimes(4);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "projection" }),
        expect.objectContaining({ operation: "publish", orderId: 11 }),
        expect.objectContaining({ operation: "publish", orderId: 12 })
      ])
    );
  });

  it("does nothing for an idempotent replay with no applied order IDs", async () => {
    const repository = { findLiveDashboardOrderEvents: jest.fn() };
    const eventPublisher = { publish: jest.fn() };
    const publisher = new LiveDashboardOrderChangePublisher(repository, eventPublisher);

    await publisher.publishCommittedOrderChanges([]);

    expect(repository.findLiveDashboardOrderEvents).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
