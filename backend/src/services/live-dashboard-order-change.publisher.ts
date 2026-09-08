import { logger } from "../config/logger";
import type { LiveDashboardOrderEventProjection } from "../repositories/booking.repository";
import type { LiveDashboardEventDraft } from "../domain/live-dashboard";
import type { LiveDashboardEventPublisher } from "./live-dashboard-event.gateway";

const MAX_PUBLISH_CONCURRENCY = 4;

export interface LiveDashboardOrderProjectionPort {
  findLiveDashboardOrderEvents(ids: number[]): Promise<LiveDashboardOrderEventProjection[]>;
}

export interface LiveDashboardOrderChangeFailure {
  operation: "projection" | "publish";
  error: unknown;
  orderIds?: number[];
  orderId?: number;
  eventType?: LiveDashboardEventDraft["type"];
}

type FailureReporter = (failure: LiveDashboardOrderChangeFailure) => void;

const defaultFailureReporter: FailureReporter = (failure) => {
  logger.error(failure, `Live dashboard order ${failure.operation} failed after booking commit`);
};

export class LiveDashboardOrderChangePublisher {
  public constructor(
    private readonly repository: LiveDashboardOrderProjectionPort,
    private readonly publisher: LiveDashboardEventPublisher,
    private readonly reportFailure: FailureReporter = defaultFailureReporter
  ) {}

  public async publishCommittedOrderChanges(orderIds: number[]): Promise<void> {
    const uniqueIds = [...new Set(orderIds)];
    if (uniqueIds.length === 0) return;

    let projections: LiveDashboardOrderEventProjection[];
    try {
      projections = await this.repository.findLiveDashboardOrderEvents(uniqueIds);
    } catch (error) {
      this.reportFailure({ operation: "projection", error, orderIds: uniqueIds });
      return;
    }

    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < projections.length) {
        const projection = projections[cursor];
        cursor += 1;
        if (projection) await this.publishProjection(projection);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_PUBLISH_CONCURRENCY, projections.length) }, () => worker())
    );
  }

  private async publishProjection(projection: LiveDashboardOrderEventProjection): Promise<void> {
    const events: LiveDashboardEventDraft[] = [
      {
        type: "order.changed",
        scope: projection.scope,
        payload: {
          orderNo: projection.orderNo,
          status: projection.status,
          serviceName: projection.serviceName,
          amountJpy: projection.amountJpy
        }
      },
      {
        type: "metrics.invalidate",
        scope: projection.scope,
        payload: { sections: ["headline", "orders", "trend", "rankings"] }
      }
    ];
    for (const event of events) {
      try {
        await this.publisher.publish(event);
      } catch (error) {
        this.reportFailure({
          operation: "publish",
          error,
          orderId: projection.orderId,
          eventType: event.type
        });
      }
    }
  }
}
