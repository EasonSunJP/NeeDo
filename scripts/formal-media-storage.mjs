import { execFileSync } from "node:child_process";
import path from "node:path";

export function readGitCommonDirectory(projectRoot) {
  try {
    return execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    if (String(error.stderr).includes("not a git repository")) return undefined;
    throw new Error("Unable to resolve shared media storage from Git", { cause: error });
  }
}

export function resolveFormalMediaStorage({ env, fileEnv = {}, projectRoot, gitCommonDirectory }) {
  if (!path.isAbsolute(projectRoot)) throw new Error("projectRoot must be an absolute path");
  if (gitCommonDirectory && !path.isAbsolute(gitCommonDirectory)) {
    throw new Error("gitCommonDirectory must be an absolute path");
  }
  const sharedRoot = gitCommonDirectory ? path.dirname(gitCommonDirectory) : projectRoot;
  let explicit = false;
  const resolveDirectory = (field, directory) => {
    const processValue = env[field]?.trim();
    const fileValue = fileEnv[field]?.trim();
    const value = processValue || fileValue;
    if ((env.NODE_ENV ?? fileEnv.NODE_ENV) === "production" && (!value || !path.isAbsolute(value))) {
      throw new Error(`${field} must be an absolute path in production`);
    }
    // Existing development examples use these defaults; bind them to the shared root.
    if (!value || (!processValue && value === `runtime/${directory}`)) {
      return path.join(sharedRoot, "backend", "runtime", directory);
    }
    if (!path.isAbsolute(value)) throw new Error(`${field} must be an absolute path`);
    explicit = true;
    return path.normalize(value);
  };
  const imMediaStorageDir = resolveDirectory("IM_MEDIA_STORAGE_DIR", "im-media");
  const contentMediaStorageDir = resolveDirectory("CONTENT_MEDIA_STORAGE_DIR", "content-media");
  return {
    imMediaStorageDir,
    contentMediaStorageDir,
    source: explicit ? "explicit" : gitCommonDirectory ? "git-common-directory" : "project-root-fallback"
  };
}
