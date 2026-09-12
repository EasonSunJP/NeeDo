import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  optimizeProductionImages,
  verifyProductionImages
} from "./production-images-cli-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const evidenceIndex = args.indexOf("--evidence-dir");
const evidenceDirectory = evidenceIndex >= 0 ? path.resolve(root, args[evidenceIndex + 1]) : undefined;
const summary = check
  ? await verifyProductionImages({ root })
  : await optimizeProductionImages({ root, evidenceDirectory });
process.stdout.write(`${JSON.stringify({ gate: "production-images-optimize", status: "passed", check, ...summary })}\n`);
