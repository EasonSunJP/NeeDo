import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkTimeline, workEventEntry } from "./WorkTimeline";
import type { WorkStatusEvent } from "./api";
const event: WorkStatusEvent = {
  id: "late-1",
  at: "2026-09-06T01:00:00Z",
  kind: "late",
  basis: "booking",
  actorName: "System",
  actorAvatarUrl: null,
  fromStatus: null,
  toStatus: null,
  plannedAt: "2026-09-06T01:00:00Z",
  actualAt: "2026-09-06T01:00:01Z",
  delaySeconds: 1,
  reason: null,
  order: {
    id: 4,
    orderNo: "ND004",
    serviceName: "Massage",
    customerName: "Aya",
  },
};
describe("business timeline messages", () => {
  it("uses the current unified administration timeline without changing the technician layout", () => {
    for (const scope of ["backoffice", "merchant-admin"] as const) {
      expect(
        renderToStaticMarkup(
          <WorkTimeline target={{ scope, technicianProfileId: 31 }} />,
        ),
      ).toContain('class="admin-event-timeline"');
    }
    expect(
      renderToStaticMarkup(<WorkTimeline target={{ scope: "technician" }} />),
    ).not.toContain('class="admin-event-timeline"');
  });

  it("inherits the active client theme when embedded in the mobile merchant surface", () => {
    const html = renderToStaticMarkup(
      <WorkTimeline
        appearance="client"
        target={{ scope: "merchant-admin", technicianProfileId: 31 }}
      />,
    );

    expect(html).toContain('class="admin-event-timeline is-client-themed"');
    expect(html).not.toContain("--client-surface:var(--admin-surface");
  });
  it("keeps affected booking links in a persisted early-departure incident", () => {
    const entry = workEventEntry(
      {
        ...event,
        kind: "early_leave",
        basis: "shift",
        order: null,
        affectedOrders: [
          {
            id: 8,
            orderNo: "ND008",
            serviceName: "Care",
            startsAt: event.at,
            endsAt: event.at,
          },
          {
            id: 9,
            orderNo: "ND009",
            serviceName: null,
            startsAt: event.at,
            endsAt: event.at,
          },
        ],
      },
      "zh",
      { scope: "backoffice", technicianProfileId: 31 },
    );
    const html = renderToStaticMarkup(<>{entry.message}</>);
    expect(html).toContain("受影响预约");
    expect(html).toContain("/admin/orders?orderId=8");
    expect(html).toContain("ND009");
  });
  it("shows red lateness with planned/actual time, precise deviation and linked order", () => {
    const entry = workEventEntry(event, "zh", { scope: "technician" });
    const html = renderToStaticMarkup(<>{entry.message}</>);
    expect(entry.tone).toBe("red");
    expect(html).toContain("0 分 1 秒");
    expect(html).toContain("10:00:01");
    expect(html).toContain("/technician/orders/4");
    expect(html).toContain("ND004");
    expect(html).toContain("Aya");
  });
  it("keeps actual time absent for unresolved incidents", () => {
    const entry = workEventEntry(
      { ...event, actualAt: null, delaySeconds: null, order: null },
      "en",
      { scope: "backoffice", technicianProfileId: 31 },
    );
    expect(renderToStaticMarkup(<>{entry.message}</>)).toContain(
      "Awaiting arrival",
    );
  });
});
