import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("technician automation trigger wiring", () => {
  it("evaluates booking automation after a booking is created", () => {
    const source = readFileSync(
      join(process.cwd(), "src/controllers/booking.controller.ts"),
      "utf8"
    );

    expect(source).toContain("automationProcessor?.processBooking(created.id)");
  });

  it("keeps Booking and Request automation processors isolated in dependency injection", () => {
    const bookingRoutes = readFileSync(
      join(process.cwd(), "src/routes/booking.routes.ts"),
      "utf8"
    );
    const exchangeRoutes = readFileSync(
      join(process.cwd(), "src/routes/exchange.routes.ts"),
      "utf8"
    );
    const app = readFileSync(join(process.cwd(), "src/app.ts"), "utf8");

    expect(app).toContain("technicianBookingAutomationProcessor?: TechnicianAutomationProcessor");
    expect(app).toContain("technicianRequestAutomationProcessor?: TechnicianAutomationProcessor");
    expect(bookingRoutes).toContain("dependencies.technicianBookingAutomationProcessor ??");
    expect(exchangeRoutes).toContain("dependencies.technicianRequestAutomationProcessor ??");
  });

  it("evaluates request automation after a demand is published", () => {
    const source = readFileSync(
      join(process.cwd(), "src/controllers/exchange.controller.ts"),
      "utf8"
    );

    expect(source).toContain('if (input.type === "demand")');
    expect(source).toContain("automationProcessor?.processRequest(created.id)");
  });

  it("keeps automated request applications in the candidate pool", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/exchange.routes.ts"),
      "utf8"
    );

    expect(source).toContain("suppressQuickMatching: true");
  });

  it("injects request automation into the formal server Exchange runtime", () => {
    const source = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");

    expect(source).toContain("createExchangeRequestAutomationProcessor(exchangeClaimService)");
    expect(source).toContain("technicianRequestAutomationProcessor,");
    expect(source.indexOf("const technicianRequestAutomationProcessor =")).toBeLessThan(
      source.indexOf("const app = createApp")
    );
  });
});
