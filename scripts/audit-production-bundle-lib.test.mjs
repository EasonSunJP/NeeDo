import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
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
  it.each([
    "icons/icon.psd",
    "icons/nested/source.PSD",
    "icons/source.psb",
    "icons/design.fig",
    ".DS_Store",
    "images/.DS_Store",
    "icons/development-plan.md",
    "backups/resources.zip",
    "icons/old.png.bak",
    "signing/private.pem"
  ])("rejects non-runtime file %s anywhere in the artifact", async (relativePath) => {
    const distDir = await createBundleFixture();
    const target = path.join(distDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "non-runtime fixture");
    const report = await auditProductionBundle(distDir);
    expect(report.failures).toContain(`production assets include a non-runtime file: ${relativePath}`);
  });

  it("retains ordinary nested images, manifests, map data and license text", async () => {
    const distDir = await createBundleFixture();
    for (const relativePath of ["icons/valid.png", "images/valid.svg", "maps/01.json", "app.webmanifest", "LICENSE.txt"]) {
      const target = path.join(distDir, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "runtime fixture");
    }
    expect((await auditProductionBundle(distDir)).failures).toEqual([]);
  });

  it("rejects directory symlinks without traversing their targets", async () => {
    const distDir = await createBundleFixture();
    await symlink(distDir, path.join(distDir, "loop"), "dir");
    expect((await auditProductionBundle(distDir)).failures).toContain(
      "production assets include a symbolic link: loop"
    );
  });

  it("does not turn an unreadable artifact into a passing report", async () => {
    const distDir = await createBundleFixture();
    await expect(auditProductionBundle(path.join(distDir, "absent"))).rejects.toThrow();
  });

  it("accepts a formal artifact within the size budgets", async () => {
    const report = await auditProductionBundle(await createBundleFixture());
    expect(report.failures).toEqual([]);
  });

  it("accepts the measured i18n artifact within the default budget", async () => {
    const report = await auditProductionBundle(
      await createBundleFixture({ i18nBytes: 3_705_361 })
    );
    expect(report.failures).toEqual([]);
  });

  it("rejects an i18n artifact one byte above the calibrated default budget", async () => {
    const report = await auditProductionBundle(
      await createBundleFixture({ i18nBytes: 3_706_001 })
    );
    expect(report.failures).toEqual([
      "i18n-hash.js is 3706001 bytes; budget is 3706000"
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
