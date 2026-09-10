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
});
