import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("client border fallback selectors", () => {
  it("do not expose Tailwind border utility class tokens that materialize pseudo-elements inside calendar grids", () => {
    expect(styles).not.toMatch(/:where\(\.border(?:,|\))/);
    expect(styles).toContain(':where([class~="border"], [class~="border-x"], [class~="border-y"], [class~="border-t"], [class~="border-r"], [class~="border-b"], [class~="border-l"])');
  });
});
