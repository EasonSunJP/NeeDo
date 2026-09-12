import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  markdownReport,
  verifyProductionImages
} from "./production-images-cli-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const reportIndex = args.indexOf("--write-report");
const summary = await verifyProductionImages({ root });
if (reportIndex >= 0) {
  const manifest = await readFile(path.join(root, "config/production-images.manifest.json"));
  const reportPath = path.resolve(root, args[reportIndex + 1]);
  await writeFile(
    reportPath,
    markdownReport(summary, createHash("sha256").update(manifest).digest("hex"))
  );
}
process.stdout.write(`${JSON.stringify({ gate: "production-images", status: "passed", ...summary })}\n`);
