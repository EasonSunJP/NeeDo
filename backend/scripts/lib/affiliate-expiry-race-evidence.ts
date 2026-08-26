export type RaceTimestamp = Date | string | null | undefined;

const timestampMillis = (value: RaceTimestamp): number | null => {
  if (value === null || value === undefined) return null;
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(millis) ? millis : null;
};

export const assertTimestampWithinRace = (
  value: RaceTimestamp,
  raceStartedAt: Date,
  raceSettledAt: Date,
  label: string
): void => {
  const millis = timestampMillis(value);
  if (millis === null) throw new Error(`${label} timestamp is missing`);
  if (millis < raceStartedAt.getTime() || millis > raceSettledAt.getTime()) {
    throw new Error(`${label} timestamp is outside race bounds`);
  }
};

export const assertTimestampOrder = (
  earlier: RaceTimestamp,
  later: RaceTimestamp,
  label: string
): void => {
  const earlierMillis = timestampMillis(earlier);
  const laterMillis = timestampMillis(later);
  if (earlierMillis === null || laterMillis === null || earlierMillis > laterMillis) {
    throw new Error(`${label} timestamps are out of order`);
  }
};

export const assertExactBaselinePrefix = <T>(
  baseline: readonly T[],
  actual: readonly T[],
  label: string
): void => {
  const actualPrefix = actual.slice(0, baseline.length);
  if (
    actual.length < baseline.length ||
    JSON.stringify(actualPrefix) !== JSON.stringify(baseline)
  ) {
    throw new Error(`${label} baseline prefix changed`);
  }
};

export const affiliateRiskEventWhere = (input: {
  taskId: number;
  claimId: number;
  attributionId: number;
  rewardIds: number[];
}) => ({
  OR: [
    { taskId: input.taskId },
    { claimId: input.claimId },
    { attributionId: input.attributionId },
    ...(input.rewardIds.length === 0 ? [] : [{ rewardId: { in: input.rewardIds.slice() } }])
  ]
});
