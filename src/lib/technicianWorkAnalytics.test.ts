import { describe, expect, it } from "vitest";
import { buildTechnicianWorkAnalyticsSeed } from "./technicianWorkAnalytics";

describe("technician work analytics seed", () => {
  it("builds both store and personal records around the anchor date", () => {
    const events = buildTechnicianWorkAnalyticsSeed({
      technicianId: "tech-1",
      storeName: "GINZA Calm Body Lab",
      customerNames: ["林 小雨", "Mia Chen", "佐藤 健"],
      anchorDate: "2026-04-13"
    });

    expect(events.some((event) => event.workMode === "store" && event.date === "2026-04-13")).toBe(true);
    expect(events.some((event) => event.workMode === "personal" && event.date === "2026-04-13")).toBe(true);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });

  it("includes booked, available, and blocked samples so charts and cards all have data", () => {
    const events = buildTechnicianWorkAnalyticsSeed({
      technicianId: "tech-1",
      storeName: "GINZA Calm Body Lab",
      customerNames: [],
      anchorDate: "2026-04-13"
    });

    expect(events.some((event) => event.status === "booked" && event.amount > 0)).toBe(true);
    expect(events.some((event) => event.planType === "availability")).toBe(true);
    expect(events.some((event) => event.planType === "locked" || event.planType === "leave")).toBe(true);
  });
});
