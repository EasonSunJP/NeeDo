import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import userScheduleSource from "../pages/user/UserSchedulePage.tsx?raw";
import userTechnicianScheduleSource from "../pages/user/UserTechnicianScheduleDetailPage.tsx?raw";
import technicianScheduleRoutesSource from "../features/technician-schedule/route-pages.tsx?raw";
import technicianScheduleResourceSource from "../features/technician-schedule/formal-resource.tsx?raw";
import technicianScheduleInventorySource from "../components/scheduling/FormalScheduleInventoryPanel.tsx?raw";
import technicianOrdersSource from "../components/technician/FormalTechnicianOrdersPanel.tsx?raw";

const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

function listProductionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listProductionSources(path);
    if (!entry.isFile() || ![".ts", ".tsx"].includes(extname(entry.name))) return [];
    return /\.(?:test|spec)\.[^.]+$/u.test(entry.name) ? [] : [path];
  });
}

describe("legacy mock retirement", () => {
  it("keeps formal user schedule pages free of browser business stores", () => {
    for (const source of [userScheduleSource, userTechnicianScheduleSource]) {
      expect(source).not.toMatch(
        /entityStore|scheduleStore|technicianScheduleStore|shiftPlanningStore|dispatch-center\/store/
      );
      expect(source).not.toMatch(/customers\[0\]|technicians\[0\]|localStorage/);
    }
    expect(userScheduleSource).toContain("formalOnly");
  });

  it("keeps accepted technician schedule and order surfaces on formal APIs only", () => {
    const forbidden =
      /entityStore|scheduleStore|technicianScheduleStore|shiftPlanningStore|dispatch-center\/store|localStorage|customers\[0\]|technicians\[0\]|emptyOrders|formalRuntimeFallbacks/;
    for (const source of [
      technicianScheduleRoutesSource,
      technicianScheduleResourceSource,
      technicianScheduleInventorySource,
      technicianOrdersSource
    ]) {
      expect(source).not.toMatch(forbidden);
    }

    expect(technicianScheduleRoutesSource).toContain("schedulingApi");
    expect(technicianScheduleRoutesSource).toContain("bookingApi");
    expect(technicianScheduleRoutesSource).toContain("parsePositiveRouteId");
    expect(technicianScheduleRoutesSource).toContain("重新加载");
    expect(technicianScheduleRoutesSource).toContain("班次转让暂未开放");
  });

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

  it("keeps every formal Exchange entry free of retired mock and capability-gate paths", () => {
    const exchangeSourcePaths = [
      ...listProductionSources(join(sourceRoot, "features", "exchange")),
      join(sourceRoot, "pages", "mobile", "NeedoExchangePage.tsx"),
      join(sourceRoot, "pages", "mobile", "NeedoRoutePages.tsx")
    ];
    const forbiddenMarkers = [
      "data/mock",
      "localStorage",
      "needoExchangeBridge",
      "hashSystemId",
      "getSeedPosts",
      "getExtraPosts",
      "error.feature_unavailable",
      "needo.exchange.composed",
      "正式需求与情报功能尚未启用"
    ];
    const offenders = exchangeSourcePaths.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return forbiddenMarkers
        .filter((marker) => source.includes(marker))
        .map((marker) => ({ marker, path: path.replace(repositoryRoot, "").replace(/^[/\\]/u, "") }));
    });

    expect(offenders).toEqual([]);
    expect(readFileSync(join(sourceRoot, "App.tsx"), "utf8")).not.toContain("NeedoPostCustomerRoutePage");
  });

  it("does not generate Exchange identities, static business records, counters, or hidden fallbacks", () => {
    const exchangeSources = [
      ...listProductionSources(join(sourceRoot, "features", "exchange")),
      join(sourceRoot, "pages", "mobile", "NeedoExchangePage.tsx"),
      join(sourceRoot, "pages", "mobile", "NeedoRoutePages.tsx")
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(exchangeSources).not.toMatch(
      /Math\.random|formalRuntimeFallbacks|generated identity|static (?:post|comment)|mock (?:post|comment)|random counter/iu
    );
    expect(exchangeSources).toContain('"/exchange/posts"');
    expect(exchangeSources).toContain("listExchangeComments");
    expect(exchangeSources).toContain("publishExchangePost");
  });
});
