import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditProductionBundle } from "./audit-production-bundle-lib.mjs";

async function createBundleFixture({ staticDemo = false, missingAsset = false, exchangeResidue = false } = {}) {
  const distDir = await mkdtemp(path.join(tmpdir(), "needo-bundle-audit-"));
  const assetsDir = path.join(distDir, "assets");
  await mkdir(assetsDir);
  await writeFile(
    path.join(assetsDir, "main-hash.js"),
    exchangeResidue ? "console.log('needoExchangeBridge');" : "console.log('formal');"
  );
  await writeFile(path.join(assetsDir, "i18n-hash.js"), "export default {};");
  if (staticDemo) {
    await writeFile(path.join(assetsDir, "staticDemo-hash.js"), "needoStaticDemo");
  }
  await writeFile(
    path.join(distDir, "user.html"),
    `<script src="./assets/${missingAsset ? "missing.js" : "main-hash.js"}"></script>`
  );
  return distDir;
}

describe("production bundle audit", () => {
  it("accepts a formal artifact within the size budgets", async () => {
    const report = await auditProductionBundle(await createBundleFixture());
    expect(report.failures).toEqual([]);
  });

  it("rejects static demo runtime assets and broken references", async () => {
    const report = await auditProductionBundle(
      await createBundleFixture({ staticDemo: true, missingAsset: true })
    );
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("staticDemo JavaScript chunk"),
        expect.stringContaining("forbidden static runtime marker"),
        expect.stringContaining("references missing asset")
      ])
    );
  });

  it("rejects retired Exchange runtime markers", async () => {
    const report = await auditProductionBundle(await createBundleFixture({ exchangeResidue: true }));
    expect(report.failures).toEqual([
      expect.stringContaining("forbidden static runtime marker needoExchangeBridge")
    ]);
  });
});
