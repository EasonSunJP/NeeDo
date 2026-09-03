import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { register as installModuleLoader } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MAX_NODE_EXECUTABLE_BYTES = 512 * 1024 * 1024;
const MAX_LAUNCH_CONTEXT_BYTES = 64 * 1024;
const PRIVATE_NODE_EXECUTABLE_NAME = ".needo-node";
const LAUNCH_CONTEXT_NAME = ".needo-aws-staging-launch-context.json";
const failureLine = '{"gate":"aws-staging-runtime-guard","status":"failed"}\n';

function sameBigIntStat(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function matchesIdentity(stat, identity) {
  return identity.changedNanoseconds === String(stat.ctimeNs)
    && identity.device === String(stat.dev)
    && identity.group === String(stat.gid)
    && identity.inode === String(stat.ino)
    && identity.links === String(stat.nlink)
    && identity.mode === Number(stat.mode & 0o777n)
    && identity.modifiedNanoseconds === String(stat.mtimeNs)
    && identity.owner === String(stat.uid)
    && identity.size === String(stat.size);
}

function requireOwnedRegularFile(stat, expectedMode, expectedSize) {
  const currentUid = typeof process.getuid === "function" ? BigInt(process.getuid()) : stat.uid;
  if (!stat.isFile()
    || (stat.uid !== 0n && stat.uid !== currentUid)
    || stat.nlink !== 1n
    || Number(stat.mode & 0o777n) !== expectedMode
    || stat.size !== expectedSize) {
    throw new Error("rejected");
  }
}

async function readLaunchContext(contextPath) {
  const handle = await fs.open(
    contextPath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  try {
    const before = await handle.stat({ bigint: true });
    requireOwnedRegularFile(before, 0o400, before.size);
    if (before.size <= 0n || before.size > BigInt(MAX_LAUNCH_CONTEXT_BYTES)) {
      throw new Error("rejected");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (!sameBigIntStat(before, after) || BigInt(bytes.length) !== before.size) {
      throw new Error("rejected");
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    await handle.close();
  }
}

function requireNodeContext(context, snapshotRoot) {
  const expectedContextKeys = [
    "evidenceOutputDirectory",
    "nodeExecutable",
    "runtimeEntrypoint",
    "runtimeManifestSha256",
    "runtimeSourceRevision",
    "snapshotRoot",
    "sourceRepositoryIdentity",
    "sourceRepositoryRoot",
    "version"
  ];
  const expectedNodeKeys = ["byteLength", "identity", "relativePath", "sha256"];
  const expectedIdentityKeys = [
    "changedNanoseconds",
    "device",
    "group",
    "inode",
    "links",
    "mode",
    "modifiedNanoseconds",
    "owner",
    "size"
  ];
  const nodeExecutable = context?.nodeExecutable;
  const identity = nodeExecutable?.identity;
  if (!context
    || typeof context !== "object"
    || JSON.stringify(Object.keys(context).sort()) !== JSON.stringify(expectedContextKeys)
    || context.version !== 2
    || context.snapshotRoot !== snapshotRoot
    || !nodeExecutable
    || typeof nodeExecutable !== "object"
    || JSON.stringify(Object.keys(nodeExecutable).sort()) !== JSON.stringify(expectedNodeKeys)
    || nodeExecutable.relativePath !== PRIVATE_NODE_EXECUTABLE_NAME
    || !Number.isSafeInteger(nodeExecutable.byteLength)
    || nodeExecutable.byteLength <= 0
    || nodeExecutable.byteLength > MAX_NODE_EXECUTABLE_BYTES
    || !/^[0-9a-f]{64}$/.test(nodeExecutable.sha256)
    || !identity
    || typeof identity !== "object"
    || JSON.stringify(Object.keys(identity).sort()) !== JSON.stringify(expectedIdentityKeys)
    || !["changedNanoseconds", "device", "group", "inode", "modifiedNanoseconds", "owner", "size"]
      .every((key) => typeof identity[key] === "string" && /^\d+$/.test(identity[key]))
    || identity.links !== "1"
    || identity.mode !== 0o500
    || identity.size !== String(nodeExecutable.byteLength)) {
    throw new Error("rejected");
  }
  return nodeExecutable;
}

async function requireCurrentNode(nodeExecutablePath, nodeExecutable) {
  if (process.release?.name !== "node"
    || !/^22\.\d+\.\d+$/.test(process.versions?.node ?? "")
    || process.execPath !== nodeExecutablePath
    || await fs.realpath(process.execPath) !== nodeExecutablePath) {
    throw new Error("rejected");
  }
  const handle = await fs.open(
    nodeExecutablePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  try {
    const before = await handle.stat({ bigint: true });
    requireOwnedRegularFile(before, 0o500, BigInt(nodeExecutable.byteLength));
    if (!matchesIdentity(before, nodeExecutable.identity)) {
      throw new Error("rejected");
    }
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (!sameBigIntStat(before, after)
      || position !== nodeExecutable.byteLength
      || digest.digest("hex") !== nodeExecutable.sha256) {
      throw new Error("rejected");
    }
  } finally {
    await handle.close();
  }
}

async function initializeGuardedRuntime() {
  const guardPath = fileURLToPath(import.meta.url);
  const snapshotRoot = path.resolve(path.dirname(guardPath), "..");
  if (guardPath !== path.join(snapshotRoot, "scripts/aws-staging-runtime-guard.mjs")) {
    throw new Error("rejected");
  }
  const contextPath = path.join(snapshotRoot, LAUNCH_CONTEXT_NAME);
  if (await fs.realpath(contextPath) !== contextPath) {
    throw new Error("rejected");
  }
  const context = await readLaunchContext(contextPath);
  const nodeExecutable = requireNodeContext(context, snapshotRoot);
  const nodeExecutablePath = path.join(snapshotRoot, nodeExecutable.relativePath);
  await requireCurrentNode(nodeExecutablePath, nodeExecutable);

  for (const name of [
    ["bind", "ing"].join(""),
    ["dl", "open"].join(""),
    ["get", "Builtin", "Module"].join("")
  ]) {
    Object.defineProperty(process, name, {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false
    });
  }

  const loaderPath = path.join(snapshotRoot, "scripts/aws-staging-module-loader.mjs");
  installModuleLoader(pathToFileURL(loaderPath).href, import.meta.url);
}

try {
  await initializeGuardedRuntime();
} catch {
  try {
    process.stderr.write(failureLine);
  } finally {
    process.exit(1);
  }
}
