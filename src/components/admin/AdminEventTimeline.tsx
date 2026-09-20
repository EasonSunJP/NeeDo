import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { ContactEventTimelinePanel } from "../mobile/ContactEventTimeline";
import "./AdminEventTimeline.css";

type AdminEventTimelineProps = ComponentProps<
  typeof ContactEventTimelinePanel
> & {
  appearance?: "admin" | "client";
};

export function AdminEventTimeline({
  appearance = "admin",
  ...props
}: AdminEventTimelineProps) {
  return (
    <div
      className={cn(
        "admin-event-timeline",
        appearance === "client" && "is-client-themed",
      )}
    >
      <ContactEventTimelinePanel
        {...props}
        bubbleMaxLines={10}
        headerVariant="plain"
        layout="three-column"
      />
    </div>
  );
}
