export const TECHNICIAN_PLATFORM_RATING_PRIOR = 5;

export const calculateTechnicianPlatformRating = (
  reviewAverage: number,
  reviewCount: number
): number => {
  if (!Number.isFinite(reviewAverage) || reviewAverage < 0 || reviewAverage > 5) {
    throw new RangeError("Technician review average must be between 0 and 5.");
  }
  if (!Number.isInteger(reviewCount) || reviewCount < 0) {
    throw new RangeError("Technician review count must be a non-negative integer.");
  }
  if (reviewCount === 0) return TECHNICIAN_PLATFORM_RATING_PRIOR;

  return (
    (TECHNICIAN_PLATFORM_RATING_PRIOR + reviewAverage * reviewCount) /
    (reviewCount + 1)
  );
};
