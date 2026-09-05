import { AdminLayout } from "../../components/admin/AdminLayout";
import { OfficialNoticeManagement } from "../../features/official-notices/OfficialNoticeWorkspace";

type AdminNotificationsContentProps = {
  title?: string;
  description?: string;
  composePath?: string;
  composeLabel?: string;
  settingsLabel?: string;
  listTitle?: string;
  listInfo?: string;
  drawerTitle?: string;
};

export function AdminNotificationsContent({ title = "官方通知" }: AdminNotificationsContentProps) {
  void title;
  return <OfficialNoticeManagement composePath="/admin/notifications/compose" scope="platform" />;
}

export function AdminNotificationsPage() {
  return <AdminLayout><AdminNotificationsContent /></AdminLayout>;
}
