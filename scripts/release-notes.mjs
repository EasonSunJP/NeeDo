import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

export async function collectReleaseManifest(repositoryRoot, sourceRevision) {
  if (!/^[0-9a-f]{40}$/.test(sourceRevision)) throw new Error("release.invalid_revision");
  const { stdout } = await exec("git", ["log", "--topo-order", "--format=%H%x09%P%x09%s", sourceRevision, "--"], { cwd: repositoryRoot, maxBuffer: 32 * 1024 * 1024 });
  const commits = stdout.trimEnd().split("\n").map((line) => {
    const [revision, parentText, ...summary] = line.split("\t");
    if (!/^[0-9a-f]{40}$/.test(revision) || !summary.join("\t").trim()) throw new Error("release.invalid_commit");
    return { revision, parents: parentText ? parentText.split(" ") : [], summary: summary.join("\t").trim() };
  });
  if (commits[0]?.revision !== sourceRevision || commits.length > 100000) throw new Error("release.invalid_history");
  return { sourceRevision, commits };
}
