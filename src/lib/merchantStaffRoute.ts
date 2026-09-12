const technicianNeedoIdPattern = /^s\d{10}$/u;

export function getMerchantStaffDetailPath(publicNeedoId: string | null | undefined) {
  const normalizedPublicNeedoId = publicNeedoId?.trim();

  if (!normalizedPublicNeedoId || !technicianNeedoIdPattern.test(normalizedPublicNeedoId)) {
    return undefined;
  }

  return `/merchant/staff/${encodeURIComponent(normalizedPublicNeedoId)}`;
}
