import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { OfficialNoticeComposer, OfficialNoticeInbox, OfficialNoticeManagement } from "../../features/official-notices/OfficialNoticeWorkspace";

export function MerchantAdminNotificationsPage({ view }: { view: "list" | "compose" | "inbox" }) {
  return <MerchantAdminLayout>
    {view === "list" ? <OfficialNoticeManagement composePath="/merchant-admin/notifications/compose" scope="merchant" /> : null}
    {view === "compose" ? <OfficialNoticeComposer returnPath="/merchant-admin/notifications" scope="merchant" /> : null}
    {view === "inbox" ? <OfficialNoticeInbox /> : null}
  </MerchantAdminLayout>;
}
