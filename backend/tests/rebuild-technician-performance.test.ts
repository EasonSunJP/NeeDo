import {
  isAssignedTechnicianHistoricalCancellation,
  parseTechnicianPerformanceRebuildArgs,
  PrismaTechnicianPerformanceRebuildRuntime,
  runTechnicianPerformanceRebuild,
  type TechnicianPerformanceRebuildInspection,
  type TechnicianPerformanceRebuildRuntime,
  type TechnicianPerformanceRebuildSubject
} from "../scripts/rebuild-technician-performance";
import type { PrismaClient } from "@prisma/client";

const subject: TechnicianPerformanceRebuildSubject = {
  technicianProfileId: 301,
  technicianUserId: 701
};

const current = {
  completedOrderCount: 8,
  accountableCancellationCount: 0,
  accountableUncompletedCount: 0,
  specialExcludedCount: 0,
  acceptanceRateBps: 10_000
};

const calculated = {
  completedOrderCount: 8,
  accountableCancellationCount: 1,
  accountableUncompletedCount: 1,
  specialExcludedCount: 1,
  acceptanceRateBps: 8_000
};

const inspection = (
  overrides: Partial<TechnicianPerformanceRebuildInspection> = {}
): TechnicianPerformanceRebuildInspection => ({
  technicianProfileId: subject.technicianProfileId,
  current,
  calculated,
  pendingHistoricalCancellationCount: 1,
  ...overrides
});

const runtime = (
  before: TechnicianPerformanceRebuildInspection,
  after = before
): jest.Mocked<TechnicianPerformanceRebuildRuntime> => {
  let scanNumber = 0;
  return {
    scanTechnicians: jest.fn(({ batchSize, technicianProfileId }) => {
      void batchSize;
      void technicianProfileId;
      scanNumber += 1;
      return (async function* () {
        yield [subject];
      })();
    }),
    inspect: jest.fn(async (requestedSubject, requestedBatchSize) => {
      void requestedSubject;
      void requestedBatchSize;
      return scanNumber <= 1 ? before : after;
    }),
    apply: jest.fn(async (requestedSubject, calculatedAt, requestedBatchSize) => {
      void requestedSubject;
      void calculatedAt;
      void requestedBatchSize;
      return { classifiedHistoricalCancellationCount: 1 };
    })
  };
};

describe("technician performance rebuild", () => {
  it("classifies historical cancellation only for the exact assigned technician user", () => {
    expect(
      isAssignedTechnicianHistoricalCancellation({
        assignedTechnicianUserId: 701,
        cancellationActorUserId: 701
      })
    ).toBe(true);
    expect(
      isAssignedTechnicianHistoricalCancellation({
        assignedTechnicianUserId: 701,
        cancellationActorUserId: 702
      })
    ).toBe(false);
    expect(
      isAssignedTechnicianHistoricalCancellation({
        assignedTechnicianUserId: 701,
        cancellationActorUserId: null
      })
    ).toBe(false);
  });

  it("counts only the latest cancellation transition when inspecting historical orders", async () => {
    const findMany = jest.fn().mockResolvedValueOnce([
      {
        id: 1,
        statusHistory: [
          { id: 11, actorUserId: 701, reason: "技师取消", createdAt: new Date("2026-01-01") }
        ]
      },
      {
        id: 2,
        statusHistory: [
          { id: 12, actorUserId: 702, reason: "用户取消", createdAt: new Date("2026-01-02") }
        ]
      },
      {
        id: 3,
        statusHistory: [
          { id: 13, actorUserId: 701, reason: "旧记录", createdAt: new Date("2026-01-03") },
          { id: 14, actorUserId: 1, reason: "运营最终取消", createdAt: new Date("2026-01-04") }
        ]
      }
    ]);
    const client = {
      technicianPerformanceSummary: { findFirst: jest.fn().mockResolvedValue(null) },
      bookingOrder: { count: jest.fn().mockResolvedValue(8), findMany },
      orderPerformanceAssessment: { groupBy: jest.fn().mockResolvedValue([]) }
    } as unknown as PrismaClient;
    const source = new PrismaTechnicianPerformanceRebuildRuntime(client);

    await expect(source.inspect(subject, 100)).resolves.toMatchObject({
      pendingHistoricalCancellationCount: 1,
      calculated: {
        completedOrderCount: 8,
        accountableCancellationCount: 1,
        accountableUncompletedCount: 0,
        specialExcludedCount: 0,
        acceptanceRateBps: 8889
      }
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        where: expect.objectContaining({
          technicianProfileId: 301,
          status: "CANCELLED",
          performanceAssessment: { is: null }
        })
      })
    );
  });

  it("reports current versus calculated values without writes by default", async () => {
    const source = runtime(inspection());

    await expect(
      runTechnicianPerformanceRebuild(source, {
        mode: "dry-run",
        batchSize: 100,
        technicianProfileId: null
      })
    ).resolves.toMatchObject({
      mode: "dry-run",
      scannedTechnicians: 1,
      changedTechnicians: 1,
      classifiedHistoricalCancellationCount: 0,
      before: [
        {
          technicianProfileId: 301,
          current,
          calculated,
          pendingHistoricalCancellationCount: 1,
          changed: true
        }
      ],
      after: []
    });
    expect(source.apply).not.toHaveBeenCalled();
  });

  it("replaces projections and reports a clean second inspection only with apply mode", async () => {
    const finalProjection = inspection({
      current: calculated,
      pendingHistoricalCancellationCount: 0
    });
    const source = runtime(inspection(), finalProjection);

    await expect(
      runTechnicianPerformanceRebuild(source, {
        mode: "apply",
        batchSize: 75,
        technicianProfileId: 301
      })
    ).resolves.toMatchObject({
      mode: "apply",
      scannedTechnicians: 1,
      changedTechnicians: 1,
      classifiedHistoricalCancellationCount: 1,
      after: [
        {
          technicianProfileId: 301,
          current: calculated,
          calculated,
          pendingHistoricalCancellationCount: 0,
          changed: false
        }
      ]
    });
    expect(source.scanTechnicians).toHaveBeenNthCalledWith(1, {
      batchSize: 75,
      technicianProfileId: 301
    });
    expect(source.apply).toHaveBeenCalledWith(subject, expect.any(Date), 75);
  });

  it("parses a safe dry-run default and requires an explicit apply flag", () => {
    expect(parseTechnicianPerformanceRebuildArgs([])).toEqual({
      mode: "dry-run",
      batchSize: 100,
      technicianProfileId: null
    });
    expect(
      parseTechnicianPerformanceRebuildArgs([
        "--apply",
        "--batch-size=25",
        "--technician-profile-id=301"
      ])
    ).toEqual({ mode: "apply", batchSize: 25, technicianProfileId: 301 });
    expect(() => parseTechnicianPerformanceRebuildArgs(["--dry-run", "--apply"])).toThrow(
      "Choose either --dry-run or --apply"
    );
    expect(() => parseTechnicianPerformanceRebuildArgs(["--batch-size=0"])).toThrow(
      "--batch-size must be an integer from 1 through 500"
    );
  });
});
