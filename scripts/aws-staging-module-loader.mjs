import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  AWS_STAGING_APPROVED_BUILTIN_SPECIFIERS,
  AWS_STAGING_LAUNCHER_RUNTIME_FILES
} from "./aws-staging-launcher.mjs";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const approvedBuiltins = new Set(AWS_STAGING_APPROVED_BUILTIN_SPECIFIERS);
const approvedModuleUrls = new Set(
  AWS_STAGING_LAUNCHER_RUNTIME_FILES
    .filter((relativePath) => relativePath.endsWith(".mjs"))
    .map((relativePath) => pathToFileURL(path.join(moduleRoot, relativePath)).href)
);

export async function resolve(specifier, context, nextResolve) {
  if (approvedBuiltins.has(specifier)) {
    return nextResolve(specifier, context);
  }
  let resolved;
  try {
    resolved = await nextResolve(specifier, context);
  } catch {
    throw new Error("AWS Staging module resolution rejected");
  }
  if (!resolved || !approvedModuleUrls.has(resolved.url)) {
    throw new Error("AWS Staging module resolution rejected");
  }
  return resolved;
}
