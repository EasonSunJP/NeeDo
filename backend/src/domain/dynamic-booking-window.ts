const SELECTOR_OFFSET_RADIX = 1_048_576;

export const encodeDynamicAvailabilityId = (
  availabilityId: number,
  offsetMinutes: number
): number => {
  if (!Number.isSafeInteger(availabilityId) || availabilityId <= 0) {
    throw new Error("availabilityId must be a positive safe integer");
  }
  if (
    !Number.isInteger(offsetMinutes) ||
    offsetMinutes < 0 ||
    offsetMinutes >= SELECTOR_OFFSET_RADIX
  ) {
    throw new Error("offsetMinutes is outside the supported window");
  }
  const selector = availabilityId * SELECTOR_OFFSET_RADIX + offsetMinutes + 1;
  if (!Number.isSafeInteger(selector)) throw new Error("dynamic availability selector overflow");
  return -selector;
};

export const decodeDynamicAvailabilityId = (
  selector: number
): { availabilityId: number; offsetMinutes: number } | null => {
  if (!Number.isSafeInteger(selector) || selector >= 0) return null;
  const value = Math.abs(selector) - 1;
  const availabilityId = Math.floor(value / SELECTOR_OFFSET_RADIX);
  const offsetMinutes = value % SELECTOR_OFFSET_RADIX;
  return availabilityId > 0 ? { availabilityId, offsetMinutes } : null;
};

export type DynamicBookingStart = {
  offsetMinutes: number;
  startsAt: Date;
  endsAt: Date;
  occupiedStartsAt: Date;
  occupiedEndsAt: Date;
};

export const enumerateDynamicBookingStarts = (input: {
  windowStartsAt: Date;
  windowEndsAt: Date;
  candidateStartsAt?: Date;
  candidateStartsBefore?: Date;
  serviceDurationMinutes: number;
  preBufferMinutes: number;
  postBufferMinutes: number;
  startIntervalMinutes: number;
}): DynamicBookingStart[] => {
  const values = [
    input.serviceDurationMinutes,
    input.preBufferMinutes,
    input.postBufferMinutes,
    input.startIntervalMinutes
  ];
  if (
    !values.every(Number.isInteger) ||
    input.serviceDurationMinutes <= 0 ||
    input.preBufferMinutes < 0 ||
    input.postBufferMinutes < 0 ||
    input.startIntervalMinutes <= 0 ||
    input.windowStartsAt >= input.windowEndsAt
  ) {
    throw new Error("invalid dynamic booking window");
  }

  const minuteMs = 60_000;
  const result: DynamicBookingStart[] = [];
  const firstStartAt = new Date(
    input.windowStartsAt.getTime() + input.preBufferMinutes * minuteMs
  );
  const candidateStartsAt = input.candidateStartsAt ?? firstStartAt;
  const skippedIntervals = Math.max(
    0,
    Math.ceil(
      (candidateStartsAt.getTime() - firstStartAt.getTime()) /
        (input.startIntervalMinutes * minuteMs)
    )
  );
  for (
    let offsetMinutes = input.preBufferMinutes + skippedIntervals * input.startIntervalMinutes;
    ;
    offsetMinutes += input.startIntervalMinutes
  ) {
    const startsAt = new Date(input.windowStartsAt.getTime() + offsetMinutes * minuteMs);
    if (input.candidateStartsBefore && startsAt >= input.candidateStartsBefore) break;
    const endsAt = new Date(startsAt.getTime() + input.serviceDurationMinutes * minuteMs);
    const occupiedStartsAt = new Date(startsAt.getTime() - input.preBufferMinutes * minuteMs);
    const occupiedEndsAt = new Date(endsAt.getTime() + input.postBufferMinutes * minuteMs);
    if (occupiedEndsAt > input.windowEndsAt) break;
    result.push({ offsetMinutes, startsAt, endsAt, occupiedStartsAt, occupiedEndsAt });
  }
  return result;
};
