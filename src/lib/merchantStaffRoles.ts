export type MerchantStaffEmploymentType = "fullTime" | "partTime";

export type MerchantManualStaffRoleRecord = {
  storeId?: string;
  roleName?: string;
};

export const merchantManualEmployeeStorageKey = "needo.merchant.manual-employees.v1";
export const merchantStaffRoleLabelStorageKey = "needo.merchant.staff-role-labels.v1";
export const merchantTechnicianRoleName = "技师";
export const merchantStaffRoleQuickOptions = ["总务", "财务", "司机", "厨师"] as const;

export function getMerchantStaffEmploymentLabel(employmentType: MerchantStaffEmploymentType) {
  return employmentType === "partTime" ? "临时工" : "正社员";
}

export function normalizeMerchantStaffEmploymentTag(tag: string) {
  if (tag === "专职") {
    return "正社员";
  }

  if (tag === "兼职") {
    return "临时工";
  }

  return tag;
}

export function getResolvedMerchantStaffRoleName(roleName: string, roleNameOverrides: Record<string, string> = {}) {
  return roleNameOverrides[roleName]?.trim() || roleName;
}

export function getMerchantStaffRoleNames(
  records: MerchantManualStaffRoleRecord[],
  options: {
    includeTechnician?: boolean;
    roleNameOverrides?: Record<string, string>;
  } = {}
) {
  const resolvedQuickRoleNames = merchantStaffRoleQuickOptions.map((roleName) => getResolvedMerchantStaffRoleName(roleName, options.roleNameOverrides));
  const roleNames = Array.from(new Set([
    ...resolvedQuickRoleNames,
    ...records.map((record) => record.roleName?.trim()).filter((roleName): roleName is string => Boolean(roleName))
  ]));

  return options.includeTechnician === false
    ? roleNames
    : [getResolvedMerchantStaffRoleName(merchantTechnicianRoleName, options.roleNameOverrides), ...roleNames];
}
