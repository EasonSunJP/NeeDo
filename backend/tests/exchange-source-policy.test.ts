import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("formal Exchange source policy", () => {
  it("keeps backend Exchange runtime free of mock actors, random counters, and deferred transaction routes", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const exchangeSources = listSourceFiles(sourceRoot)
      .filter((path) => path.slice(sourceRoot.length).toLowerCase().includes("exchange"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const router = readFileSync(resolve(sourceRoot, "routes/exchange.routes.ts"), "utf8");

    expect(exchangeSources).not.toMatch(
      /Math\.random|localStorage|needoExchangeBridge|hashSystemId|getSeedPosts|getExtraPosts/iu
    );
    expect(router).not.toMatch(/offers|matches|bookings|orders|payments/iu);
    expect(router).toContain('"/exchange/posts"');
    expect(router).toContain('"/exchange/posts/:id/comments"');
  });
});
