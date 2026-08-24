import { SocialTimelinePage } from "../../features/social/route-pages";

export function MomentsPage({ context }: { context?: "user" | "merchant" | "technician" } = {}) {
  void context;
  return <SocialTimelinePage />;
}
