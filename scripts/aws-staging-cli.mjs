import { execFile } from "node:child_process";

const MAX_BUFFER = 4 * 1024 * 1024;
const FORBIDDEN_ARGUMENTS = new Set([
  "getsecretvalue",
  "awssecretaccesskey",
  "awssessiontoken",
  "secretstring",
  "secretbinary",
  "password"
]);

function assertSafeArguments(args) {
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== "string")) {
    throw new TypeError("AWS CLI arguments must be an array of strings");
  }

  const canonicalArguments = args.map((argument) => argument.toLowerCase().replace(/[-_]/g, ""));
  const isAllowedConfigureList = canonicalArguments.length === 2
    && canonicalArguments[0] === "configure"
    && canonicalArguments[1] === "list";
  if (canonicalArguments.some((argument) => [...FORBIDDEN_ARGUMENTS].some((forbidden) => argument.includes(forbidden)))
    || (canonicalArguments.includes("configure") && !isAllowedConfigureList)) {
    throw new Error("forbidden AWS CLI credential or secret surface");
  }
}

function finalStderrLine(stderr) {
  const lines = String(stderr ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) ?? "unknown error").slice(0, 500);
}

function invoke(execFileImpl, profile, region, args, output) {
  assertSafeArguments(args);
  const fullArgs = [
    ...args,
    "--profile", profile,
    "--region", region,
    "--output", output,
    "--no-cli-pager"
  ];

  return new Promise((resolve, reject) => {
    execFileImpl(
      "aws",
      fullArgs,
      { shell: false, maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        if (error) {
          const code = error.code ?? "unknown";
          reject(new Error(`AWS CLI failed (${code}): ${finalStderrLine(stderr)}`));
          return;
        }
        resolve({ stdout: String(stdout ?? "") });
      }
    );
  });
}

export function createAwsCli({ profile, region, execFileImpl = execFile }) {
  return Object.freeze({
    json(args) {
      return invoke(execFileImpl, profile, region, args, "json").then(({ stdout }) => JSON.parse(stdout));
    },
    text(args) {
      return invoke(execFileImpl, profile, region, args, "text").then(({ stdout }) => stdout.trim());
    }
  });
}
