export const MIN_TECHNICIAN_SETTLEMENT_SHARE_PERCENT = 10;
export const MAX_TECHNICIAN_SETTLEMENT_SHARE_PERCENT = 100;

const normalizeInteger = (value: number) =>
  Number.isFinite(value) ? Math.round(value) : MAX_TECHNICIAN_SETTLEMENT_SHARE_PERCENT;

export function normalizeTechnicianSettlementShare(value: number) {
  return Math.min(
    MAX_TECHNICIAN_SETTLEMENT_SHARE_PERCENT,
    Math.max(MIN_TECHNICIAN_SETTLEMENT_SHARE_PERCENT, normalizeInteger(value)),
  );
}

export function resolveSettlementSplit(technicianSharePercent: number) {
  const normalizedTechnicianShare = normalizeTechnicianSettlementShare(
    technicianSharePercent,
  );

  return {
    shopSharePercent: 100 - normalizedTechnicianShare,
    technicianSharePercent: normalizedTechnicianShare,
  };
}

export function adjustTechnicianSettlementShare(current: number, delta: number) {
  return normalizeTechnicianSettlementShare(current + delta);
}
