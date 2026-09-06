import type { ComponentProps } from "react";
import { ContactEventTimelinePanel } from "../mobile/ContactEventTimeline";
import "./AdminEventTimeline.css";

export function AdminEventTimeline(props: ComponentProps<typeof ContactEventTimelinePanel>) {
  return <div className="admin-event-timeline"><ContactEventTimelinePanel {...props} bubbleMaxLines={10} headerVariant="plain" layout="three-column" /></div>;
}
