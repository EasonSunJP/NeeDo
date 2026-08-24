import {
  OfficialNotificationCapabilityGate,
  OfficialNotificationCapabilityGateContent
} from "./OfficialNotificationCapabilityGate";

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
  return <OfficialNotificationCapabilityGateContent title={title} />;
}

export function AdminNotificationComposePage() {
  return <OfficialNotificationCapabilityGate title="发送官方通知" />;
}
