import type { CSSProperties } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { MerchantApplicationsReviewPage, TechnicianApplicationsReviewPage } from "./ReviewPages";
const theme = {
  "--client-primary": "var(--admin-accent)", "--client-primary-strong": "var(--admin-accent-strong)",
  "--client-surface": "var(--admin-surface)", "--client-elevated": "var(--admin-elevated)",
  "--client-text": "var(--admin-text)", "--client-muted": "var(--admin-muted)", "--client-line": "var(--admin-line)"
} as CSSProperties;
export function OperationsShopApplicationReviewPage() {
  const { session } = useAuth();
  return <AdminLayout><div style={theme}><MerchantApplicationsReviewPage key={session?.id} embedded /></div></AdminLayout>;
}
export function MerchantBackofficeApplicationReviewPage() {
  const { session } = useAuth();
  return <MerchantAdminLayout><div style={theme}><TechnicianApplicationsReviewPage key={`${session?.id}:${session?.activeIdentityId}`} embedded /></div></MerchantAdminLayout>;
}
