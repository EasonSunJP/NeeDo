import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("order service expiry server wiring", () => {
  it("constructs the formal runtime and starts and stops it with the server", () => {
    const source = readFileSync(resolve(__dirname, "../src/server.ts"), "utf8");

    expect(source).toContain("new OrderServiceExpiryRepository(");
    expect(source).toContain("new OrderServiceExpiryService(");
    expect(source).toContain("new OrderServiceExpiryWorker(");
    expect(source).toContain("env.ORDER_SERVICE_EXPIRY_INTERVAL_MS");
    expect(source).toContain("env.ORDER_SERVICE_EXPIRY_BATCH_SIZE");
    expect(source).toContain("orderServiceExpiryWorker.start();");
    expect(source).toContain("orderServiceExpiryWorker.stop();");
  });
});
