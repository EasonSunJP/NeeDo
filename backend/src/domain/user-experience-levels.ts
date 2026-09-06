export const USER_EXPERIENCE_UNITS_PER_EXP = 10_000n;

export const USER_EXPERIENCE_THRESHOLDS = [
  0, 5, 18, 37, 62, 93, 129, 170, 216, 267, 323, 383, 448, 518, 591, 670, 752, 839, 930, 1025, 1124,
  1227, 1334, 1445, 1561, 1679, 1802, 1929, 2060, 2194, 2332, 2474, 2619, 2768, 2921, 3078, 3238,
  3401, 3569, 3739, 3914, 4092, 4273, 4458, 4646, 4838, 5033, 5232, 5434, 5639, 5848, 6061, 6276,
  6495, 6717, 6943, 7172, 7404, 7639, 7878, 8120, 8365, 8614, 8865, 9120, 9378, 9640, 9904, 10172,
  10443, 10717, 10994, 11274, 11558, 11844, 12134, 12427, 12722, 13021, 13323, 13629, 13937, 14248,
  14562, 14880, 15200, 15523, 15850, 16179, 16512, 16847, 17185, 17527, 17871, 18219, 18569, 18922,
  19279, 19638, 20000
] as const;

const toTotalUnits = (value: bigint | number): bigint => {
  if (typeof value === "bigint") {
    if (value < 0n) throw new RangeError("experience total cannot be negative");
    return value;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("experience total must be a non-negative safe integer");
  }
  return BigInt(value);
};

export const resolveLevel = (totalUnitsInput: bigint | number): number => {
  const totalUnits = toTotalUnits(totalUnitsInput);
  let low = 0;
  let high = USER_EXPERIENCE_THRESHOLDS.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const thresholdUnits =
      BigInt(USER_EXPERIENCE_THRESHOLDS[middle]) * USER_EXPERIENCE_UNITS_PER_EXP;
    if (thresholdUnits <= totalUnits) low = middle + 1;
    else high = middle - 1;
  }
  return Math.min(Math.max(high + 1, 1), 100);
};

export const formatExperienceUnits = (units: bigint): string => {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / USER_EXPERIENCE_UNITS_PER_EXP;
  const fraction = (absolute % USER_EXPERIENCE_UNITS_PER_EXP)
    .toString()
    .padStart(4, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
};
