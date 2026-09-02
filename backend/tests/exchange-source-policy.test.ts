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

describe("formal Exchange source policy", () => {
  const sourceRoot = resolve(process.cwd(), "src");
  const exchangeSourcePaths = listSourceFiles(sourceRoot).filter((path) =>
    path.slice(sourceRoot.length).toLowerCase().includes("exchange")
  );
  const exchangeSources = exchangeSourcePaths
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const exchangeRouteSources = exchangeSourcePaths
    .filter((path) => path.includes(`${join("src", "routes")}`))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const routeInventory = [...exchangeRouteSources.matchAll(
    /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gu
  )].map((match) => ({ method: match[1], path: match[2] }));

  it("keeps backend Exchange runtime free of mock actors and deferred mutations", () => {
    expect(exchangeSources).not.toMatch(/Math\.random|localStorage|needoExchangeBridge|hashSystemId|getSeedPosts|getExtraPosts/iu);
    expect(routeInventory.map((route) => route.path)).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/offers?|orders?|payments?|matching\/(?:quick|close|cancel)/iu)
      ])
    );
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
        .flatMap(([path, operations]) => Object.keys(operations).map((method) => ({ method, path })))
    ).toEqual([{ method: "post", path: openApiPath }]);
  });
});
