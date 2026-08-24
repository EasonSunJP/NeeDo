import {
  OfficialNotificationCapabilityGate,
  OfficialNotificationCapabilityGateContent
} from "./OfficialNotificationCapabilityGate";

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
  return <OfficialNotificationCapabilityGateContent title={title} />;
}

export function AdminNotificationsPage() {
  return <OfficialNotificationCapabilityGate title="官方通知" />;
}
