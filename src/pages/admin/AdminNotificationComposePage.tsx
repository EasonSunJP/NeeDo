import { AdminLayout } from "../../components/admin/AdminLayout";
import { OfficialNoticeComposer } from "../../features/official-notices/OfficialNoticeWorkspace";

type AdminNotificationComposeContentProps = {
  title?: string;
  description?: string;
  returnPath?: string;
  returnLabel?: string;
  sendLabel?: string;
  savedChannel?: string;
  deliveryTargets?: string[];
};

export function AdminNotificationComposeContent({
  title = "发送官方通知"
}: AdminNotificationComposeContentProps) {
  void title;
  return <OfficialNoticeComposer returnPath="/admin/notifications" scope="platform" />;
}

export function AdminNotificationComposePage() {
  return <AdminLayout><AdminNotificationComposeContent /></AdminLayout>;
}
