import { describe, expect, it } from "vitest";
import { resolveFormalDevConfig } from "./dev-formal-config.mjs";

describe("formal development launcher config", () => {
  it("uses the formal backend and frontend defaults", () => {
    expect(resolveFormalDevConfig({})).toEqual({
      backendPort: 3000,
      frontendPort: 5180,
      proxyTarget: "http://127.0.0.1:3000"
    });
  });

  it("accepts valid local port overrides and rejects invalid values", () => {
    expect(
      resolveFormalDevConfig({ FORMAL_BACKEND_PORT: "3102", FRONTEND_PORT: "5181" })
    ).toEqual({
      backendPort: 3102,
      frontendPort: 5181,
      proxyTarget: "http://127.0.0.1:3102"
    });
    expect(() => resolveFormalDevConfig({ FORMAL_BACKEND_PORT: "70000" })).toThrow(
      "FORMAL_BACKEND_PORT"
    );
  });
});
