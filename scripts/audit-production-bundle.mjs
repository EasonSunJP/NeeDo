import process from "node:process";
import { auditProductionBundle } from "./audit-production-bundle-lib.mjs";

const distDir = process.env.PRODUCTION_DIST_DIR || "dist";
const report = await auditProductionBundle(distDir);

if (report.failures.length > 0) {
  console.error("[production-bundle-audit] FAIL");
  report.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `[production-bundle-audit] PASS ${report.htmlCount} HTML entries and ${report.assetCount} assets`
  );
}
