import { describe, expect, it } from "vitest";

async function loadRuntime() {
  return import("./dev-formal-runtime.mjs").catch(() => ({}));
}

describe("formal development runtime", () => {
  it("waits until the service detector reports healthy", async () => {
    const runtime = await loadRuntime();
    expect(runtime.waitForService).toBeTypeOf("function");

    let attempts = 0;
    await runtime.waitForService({
      name: "formal backend",
      detector: async () => {
        attempts += 1;
        return attempts === 3;
      },
      timeoutMs: 100,
      intervalMs: 0
    });

    expect(attempts).toBe(3);
  });

  it("fails when the service never becomes healthy", async () => {
    const runtime = await loadRuntime();
    expect(runtime.waitForService).toBeTypeOf("function");

    await expect(
      runtime.waitForService({
        name: "formal backend",
        detector: async () => false,
        timeoutMs: 5,
        intervalMs: 1
      })
    ).rejects.toThrow("formal backend did not become healthy within 5ms");
  });
});
