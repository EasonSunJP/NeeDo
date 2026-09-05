import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

type RouteTuple = {
  method: string;
  path: string;
};

const exchangeMutationMethods = new Set(["post", "put", "patch", "delete"]);
const exchangeDeferredCapabilityTokens = [
  "booking",
  "order",
  "payment",
  "offer",
  "quick",
  "close",
  "cancel"
] as const;
const permittedExchangeCapabilityMutations = new Set([
  "post /exchange/posts/:id/matching/bookings"
]);

function isForbiddenExchangeCapabilityMutation(route: RouteTuple): boolean {
  const method = route.method.toLowerCase();
  const path = route.path.toLowerCase();
  const isCapabilityMutation =
    exchangeMutationMethods.has(method) &&
    exchangeDeferredCapabilityTokens.some((token) => path.includes(token));

  return isCapabilityMutation && !permittedExchangeCapabilityMutations.has(`${method} ${path}`);
}

describe("formal Exchange source policy", () => {
  const sourceRoot = resolve(process.cwd(), "src");
  const exchangeSourcePaths = listSourceFiles(sourceRoot).filter((path) =>
    path.slice(sourceRoot.length).toLowerCase().includes("exchange")
  );
  const exchangeSources = exchangeSourcePaths.map((path) => readFileSync(path, "utf8")).join("\n");
  const exchangeRouteSources = listSourceFiles(resolve(sourceRoot, "routes"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const routeInventory = [
    ...exchangeRouteSources.matchAll(/router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gu)
  ]
    .map((match) => ({ method: match[1], path: match[2] }))
    .filter((route) => route.path.toLowerCase().includes("exchange"));

  it("keeps backend Exchange runtime free of mock actors and deferred mutations", () => {
    expect(exchangeSources).not.toMatch(
      /Math\.random|localStorage|needoExchangeBridge|hashSystemId|getSeedPosts|getExtraPosts/iu
    );
    expect(routeInventory.filter(isForbiddenExchangeCapabilityMutation)).toEqual([]);
  });

  it.each([
    ["post", "/exchange/posts/:id/quick-match"],
    ["post", "/exchange/posts/:id/close"],
    ["post", "/exchange/posts/:id/cancel"],
    ["post", "/exchange/bookings/:id/cancel"],
    ["post", "/exchange/posts/:id/bookings"],
    ["patch", "/exchange/posts/:id/orders"],
    ["post", "/exchange/posts/:id/payments"],
    ["delete", "/exchange/posts/:id/offers"]
  ])("rejects deferred Exchange mutation %s %s", (method, path) => {
    expect(isForbiddenExchangeCapabilityMutation({ method, path })).toBe(true);
  });

  it("allows only the exact formal booking mutation tuple and does not block reads", () => {
    expect(
      isForbiddenExchangeCapabilityMutation({
        method: "post",
        path: "/exchange/posts/:id/matching/bookings"
      })
    ).toBe(false);
    expect(
      isForbiddenExchangeCapabilityMutation({
        method: "get",
        path: "/exchange/bookings/:id"
      })
    ).toBe(false);
    expect(
      isForbiddenExchangeCapabilityMutation({
        method: "put",
        path: "/exchange/posts/:id/matching/bookings"
      })
    ).toBe(true);
  });

  it("inventories exactly one formal mounted booking conversion POST across split route files", async () => {
    const formalPath = "/exchange/posts/:id/matching/bookings";
    expect(routeInventory.filter((route) => route.path.includes("/matching/bookings"))).toEqual([
      { method: "post", path: formalPath }
    ]);

    await request(createApp())
      .post("/api/v1/exchange/posts/42/matching/bookings")
      .set("Idempotency-Key", "source-policy-key-0001")
      .send({ expectedVersion: 7 })
      .expect(401);

    const document = createOpenApiDocument(env) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const openApiPath = "/api/v1/exchange/posts/{id}/matching/bookings";
    expect(
      Object.entries(document.paths)
        .filter(([path]) => path === openApiPath)
        .flatMap(([path, operations]) =>
          Object.keys(operations).map((method) => ({ method, path }))
        )
    ).toEqual([{ method: "post", path: openApiPath }]);
  });
});
