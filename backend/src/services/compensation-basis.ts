export type CompensationBasisVersion =
  | `shop_default:${number}`
  | `technician_override:${number}`;

const compensationBasisPattern = /^(shop_default|technician_override):([1-9]\d*)$/;

export function appendCompensationBasis(
  serviceSnapshot: Record<string, unknown>,
  basisVersion: CompensationBasisVersion | null
): Record<string, unknown> {
  return basisVersion
    ? { ...serviceSnapshot, compensationBasisVersion: basisVersion }
    : serviceSnapshot;
}

export function readCompensationBasisVersion(value: unknown): CompensationBasisVersion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).compensationBasisVersion;
  return typeof candidate === "string" && compensationBasisPattern.test(candidate)
    ? candidate as CompensationBasisVersion
    : null;
}

export function readBookingNominationSnapshot(
  value: unknown
): { nominationChargeAmountJpy: number; wasTechnicianNominated: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { nominationChargeAmountJpy: 0, wasTechnicianNominated: false };
  }
  const snapshot = value as Record<string, unknown>;
  const amount = snapshot.nominationChargeAmountJpy;
  return {
    nominationChargeAmountJpy:
      typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 ? amount : 0,
    wasTechnicianNominated: snapshot.wasTechnicianNominated === true
  };
}
