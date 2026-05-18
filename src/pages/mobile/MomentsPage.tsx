import { SocialTimelinePage } from "../../features/social/pages/SocialTimelinePage";

export function MomentsPage({ context }: { context?: "user" | "merchant" | "technician" } = {}) {
  void context;
  return <SocialTimelinePage />;
}
