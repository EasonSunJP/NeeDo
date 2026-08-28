import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("..", import.meta.url));

function listProductionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listProductionSources(path);
    if (!entry.isFile() || ![".ts", ".tsx"].includes(extname(entry.name))) return [];
    return /\.(?:test|spec)\.[^.]+$/u.test(entry.name) ? [] : [path];
  });
}

describe("legacy mock retirement", () => {
  it("has no production import of the old mock dataset", () => {
    const offenders = listProductionSources(sourceRoot).filter((path) =>
      /(?:data\/mock|\.\/mock)["']/u.test(readFileSync(path, "utf8"))
    );

    expect(offenders).toEqual([]);
  });

  it("deletes retired browser datasets and account bypasses", () => {
    const retiredPaths = [
      ["auth", "demoAccount.ts"],
      ["components", "mobile", "MobileMessageCenter.tsx"],
      ["data", "demoAppointmentSeeds.ts"],
      ["data", "mock.ts"],
      ["features", "business-cps", "model.ts"],
      ["features", "im", "account-sync.ts"],
      ["features", "im", "api.ts"],
      ["features", "im", "seed.ts"],
      ["lib", "detailProfiles.ts"],
      ["lib", "needoExchangeBridge.ts"]
    ];

    expect(retiredPaths.filter((segments) => existsSync(join(sourceRoot, ...segments)))).toEqual([]);
  });

  it("does not ship known legacy identities, credentials, or client-approved login tokens", () => {
    const retiredMarkers = [
      "u0000000001",
      "n0000000237",
      "customer-demo",
      "session-demo",
      "qr-table-a08",
      "scan=approved",
      "admin / 123456",
      "演示验证码 260417"
    ];
    const offenders = listProductionSources(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return retiredMarkers.filter((marker) => source.includes(marker)).map((marker) => ({ marker, path }));
    });

    expect(offenders).toEqual([]);
  });
});
