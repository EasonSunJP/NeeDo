import { useAuth } from "../../auth/AuthProvider";
import { getMerchantAdminPreview } from "../../auth/merchantAdminPreview";

export function useSosScope() {
  const { session, isAuthenticated, isRestoring, hasPermission } = useAuth();
  const preview = getMerchantAdminPreview();
  const enabled = Boolean(session && isAuthenticated && !isRestoring);
  return {
    ownerKey: `${session?.id ?? ""}:${session?.currentIdentity.id ?? ""}:${session?.merchantShopPublicId ?? ""}:${preview?.selectedShopId ?? ""}`,
    canCreate: enabled && !preview && hasPermission("sos:create"),
    canRead: enabled && hasPermission("sos:list"),
    canResolve: enabled && !preview && hasPermission("sos:resolve")
  };
}
