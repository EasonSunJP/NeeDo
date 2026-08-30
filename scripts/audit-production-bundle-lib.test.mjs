import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditProductionBundle } from "./audit-production-bundle-lib.mjs";

const fixtureDirectories = new Set();

afterEach(async () => {
  await Promise.all(
    [...fixtureDirectories].map((directory) => rm(directory, { recursive: true, force: true }))
  );
  fixtureDirectories.clear();
});

async function createBundleFixture({
  staticDemo = false,
  missingAsset = false,
  exchangeResidue = false,
  i18nBytes
} = {}) {
  const distDir = await mkdtemp(path.join(tmpdir(), "needo-bundle-audit-"));
  fixtureDirectories.add(distDir);
  const assetsDir = path.join(distDir, "assets");
  await mkdir(assetsDir);
  await writeFile(
    path.join(assetsDir, "main-hash.js"),
    exchangeResidue ? "console.log('needoExchangeBridge');" : "console.log('formal');"
  );
  await writeFile(
    path.join(assetsDir, "i18n-hash.js"),
    i18nBytes === undefined ? "export default {};" : "x".repeat(i18nBytes)
  );
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

  it("accepts the measured i18n artifact within the default budget", async () => {
    const report = await auditProductionBundle(
      await createBundleFixture({ i18nBytes: 3_703_026 })
    );
    expect(report.failures).toEqual([]);
  });

  it("rejects an i18n artifact one byte above the calibrated default budget", async () => {
    const report = await auditProductionBundle(
      await createBundleFixture({ i18nBytes: 3_704_097 })
    );
    expect(report.failures).toEqual([
      "i18n-hash.js is 3704097 bytes; budget is 3704096"
    ]);
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
