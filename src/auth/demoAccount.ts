export type PortalScope = "user" | "merchant" | "technician" | "business" | "admin";

export const demoAuthAccount = {
  username: "admin",
  password: "Admin.2026",
  adminEmail: "admin@needo.jp",
  merchantAdminEmail: "store-admin@needo.jp",
  businessCpsEmail: "afirieito@needo.jp",
  verificationCode: "260417",
  linkedCustomerId: "cus-1",
  linkedTechnicianId: "tech-1",
  linkedStoreId: "store-1"
} as const;
