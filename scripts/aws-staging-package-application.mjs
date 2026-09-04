import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  assertCleanRevision,
  releaseKey,
  requireAcceptedEnvironment,
  sha256Hex
} from "./aws-staging-application-lib.mjs";

const execFileAsync = promisify(execFile);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(moduleDir, "..");
const outputDirectory = path.join(repositoryRoot, "outputs", "aws-staging");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith("--") || !["--source-revision", "--environment-evidence"].includes(flag)) {
      throw new Error("Expected --source-revision and --environment-evidence");
    }
    if (parsed[flag]) throw new Error(`Duplicate argument: ${flag}`);
    parsed[flag] = value;
  }
  if (!/^[0-9a-f]{40}$/.test(parsed["--source-revision"] ?? "")) {
    throw new Error("--source-revision must be a full Git revision");
  }
  if (!parsed["--environment-evidence"]) {
    throw new Error("--environment-evidence is required");
  }
  return {
    environmentEvidencePath: path.resolve(repositoryRoot, parsed["--environment-evidence"]),
    revision: parsed["--source-revision"]
  };
}

async function run(file, args, cwd = repositoryRoot) {
  await execFileAsync(file, args, {
    cwd,
    env: {
      ...process.env,
      CI: "1",
      NEEDO_BUILD_TARGET: "production",
      VITE_AUTH_GOOGLE_ENABLED: "false",
      VITE_AUTH_REGISTRATION_ENABLED: "false"
    },
    maxBuffer: 16 * 1024 * 1024
  });
}

const repository = {
  resolveRevision: async () => (await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot
  })).stdout.trim(),
  statusPorcelain: async () => (await execFileAsync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: repositoryRoot }
  )).stdout
};

async function collectFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, child));
    } else if (entry.isFile()) {
      files.push(child);
    } else {
      throw new Error(`Release input must not contain links or special files: ${child}`);
    }
  }
  return files;
}

async function normalizeTree(root, epochSeconds) {
  const visit = async (relative = "") => {
    const absolute = path.join(root, relative);
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(relative, entry.name);
      const childAbsolute = path.join(root, child);
      if (entry.isDirectory()) {
        await visit(child);
        await fs.chmod(childAbsolute, 0o755);
      } else if (entry.isFile()) {
        await fs.chmod(
          childAbsolute,
          child === "deploy/staging/deploy-release.sh" ? 0o755 : 0o644
        );
      } else {
        throw new Error(`Release input must not contain links or special files: ${child}`);
      }
      await fs.utimes(childAbsolute, epochSeconds, epochSeconds);
    }
  };
  await visit();
  await fs.utimes(root, epochSeconds, epochSeconds);
}

async function copyReleaseInputs(stageRoot) {
  const inputs = [
    "dist",
    "backend/dist",
    "backend/package.json",
    "backend/package-lock.json",
    "backend/prisma",
    "backend/prisma.config.ts",
    "deploy/staging"
  ];
  for (const relative of inputs) {
    const source = path.join(repositoryRoot, relative);
    const destination = path.join(stageRoot, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false });
  }
}

async function fileManifest(stageRoot, files) {
  const manifest = [];
  for (const relative of files) {
    const bytes = await fs.readFile(path.join(stageRoot, relative));
    const stat = await fs.stat(path.join(stageRoot, relative));
    manifest.push({ path: relative.split(path.sep).join("/"), bytes: stat.size, sha256: sha256Hex(bytes) });
  }
  return manifest;
}

async function main() {
  const { environmentEvidencePath, revision } = parseArgs(process.argv.slice(2));
  await assertCleanRevision(repository, revision);

  const evidenceBytes = await fs.readFile(environmentEvidencePath);
  const acceptedEnvironment = requireAcceptedEnvironment(JSON.parse(evidenceBytes.toString("utf8")));

  await run("npm", ["run", "build", "--", "--mode", "formal"]);
  await run("npm", ["run", "prisma:generate"], path.join(repositoryRoot, "backend"));
  await run("npm", ["run", "build"], path.join(repositoryRoot, "backend"));
  await assertCleanRevision(repository, revision);

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-staging-release-"));
  try {
    const stageRoot = path.join(temporaryRoot, "root");
    await fs.mkdir(stageRoot, { recursive: true });
    await copyReleaseInputs(stageRoot);
    const commitEpochText = (await execFileAsync(
      "git",
      ["show", "-s", "--format=%ct", revision],
      { cwd: repositoryRoot }
    )).stdout.trim();
    const commitEpoch = Number(commitEpochText);
    if (!Number.isSafeInteger(commitEpoch) || commitEpoch <= 0) {
      throw new Error("Git commit timestamp is invalid");
    }
    await normalizeTree(stageRoot, commitEpoch);
    const files = await collectFiles(stageRoot);
    const manifest = {
      formatVersion: 1,
      sourceRevision: revision,
      sourceDateEpoch: commitEpoch,
      files: await fileManifest(stageRoot, files)
    };
    await fs.writeFile(
      path.join(stageRoot, "release-manifest.json"),
      `${JSON.stringify(manifest)}\n`,
      { mode: 0o644, flag: "wx" }
    );
    await fs.utimes(path.join(stageRoot, "release-manifest.json"), commitEpoch, commitEpoch);

    const archiveFiles = (await collectFiles(stageRoot)).map((item) => item.split(path.sep).join("/"));
    const fileListPath = path.join(temporaryRoot, "files.txt");
    const tarPath = path.join(temporaryRoot, "release.tar");
    await fs.writeFile(fileListPath, `${archiveFiles.join("\n")}\n`, { mode: 0o600 });
    await run("tar", [
      "-cf", tarPath,
      "--format", "ustar",
      "--uid", "0",
      "--gid", "0",
      "--uname", "root",
      "--gname", "root",
      "-C", stageRoot,
      "-T", fileListPath
    ]);
    const archiveBytes = gzipSync(await fs.readFile(tarPath), { level: 9, mtime: 0 });
    const archiveSha256 = sha256Hex(archiveBytes);
    const objectKey = releaseKey(revision, archiveSha256);
    await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    const archivePath = path.join(outputDirectory, `${archiveSha256}.tar.gz`);
    await fs.writeFile(archivePath, archiveBytes, { mode: 0o600, flag: "wx" });
    const packageEvidence = {
      gate: "aws-staging-application-package",
      status: "passed",
      timestamp: new Date().toISOString(),
      accountId: acceptedEnvironment.accountId,
      region: acceptedEnvironment.region,
      hostname: acceptedEnvironment.hostname,
      sourceRevision: revision,
      archiveSha256,
      archiveBytes: archiveBytes.length,
      archivePath,
      releaseBucketName: acceptedEnvironment.releaseBucketName,
      releaseObjectKey: objectKey,
      environmentEvidenceSha256: createHash("sha256").update(evidenceBytes).digest("hex"),
      manifestFileCount: archiveFiles.length
    };
    const evidencePath = path.join(outputDirectory, "application-package.json");
    await fs.writeFile(evidencePath, `${JSON.stringify(packageEvidence, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify({
      gate: packageEvidence.gate,
      status: packageEvidence.status,
      sourceRevision: revision,
      archiveSha256,
      releaseObjectKey: objectKey,
      evidenceFile: path.relative(repositoryRoot, evidencePath)
    })}\n`);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch(() => {
  process.stderr.write('{"gate":"aws-staging-application-package","status":"failed"}\n');
  process.exitCode = 1;
});
