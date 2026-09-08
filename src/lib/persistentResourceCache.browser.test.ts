// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { persistentResourceCache } from "./persistentResourceCache";

describe("browser persistent resource cache", () => {
  it("loads a value in the browser runtime", async () => {
    await persistentResourceCache.clearScope("browser-test");
    await expect(persistentResourceCache.load({
      key: "one",
      load: async () => ({ ok: true }),
      scope: "browser-test"
    })).resolves.toEqual({ ok: true });
  });
});
