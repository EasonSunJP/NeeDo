export type TechnicianPerformanceCounts = {
  completedOrderCount: number;
  accountableCancellationCount: number;
  accountableUncompletedCount: number;
  specialExcludedCount: number;
};

export type TechnicianPerformanceProjection = TechnicianPerformanceCounts & {
  acceptanceRateBps: number;
};

const INVALID_COUNTS_MESSAGE = "Technician performance counts must be non-negative safe integers";

export const calculateTechnicianPerformance = (
  counts: TechnicianPerformanceCounts
): TechnicianPerformanceProjection => {
  if (Object.values(counts).some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new TypeError(INVALID_COUNTS_MESSAGE);
  }

  const {
    completedOrderCount,
    accountableCancellationCount,
    accountableUncompletedCount,
    specialExcludedCount
  } = counts;
  const denominator =
    completedOrderCount + accountableCancellationCount + accountableUncompletedCount;
  const acceptanceRateBps =
    denominator === 0 ? 10_000 : Math.round((completedOrderCount * 10_000) / denominator);

  return {
    completedOrderCount,
    accountableCancellationCount,
    accountableUncompletedCount,
    specialExcludedCount,
    acceptanceRateBps
  };
};
