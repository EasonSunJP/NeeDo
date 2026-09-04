import { describe, expect, it } from "vitest";
import { resolveFormalMediaStorage } from "./formal-media-storage.mjs";

describe("formal media storage", () => {
  it("uses the same files from the primary checkout and a linked worktree", () => {
    const resolve = (projectRoot) => resolveFormalMediaStorage({ env: {}, projectRoot, gitCommonDirectory: "/repo/.git" });
    expect(resolve("/repo/.worktrees/feature")).toEqual(resolve("/repo"));
    expect(resolve("/repo")).toMatchObject({
      imMediaStorageDir: "/repo/backend/runtime/im-media",
      contentMediaStorageDir: "/repo/backend/runtime/content-media"
    });
  });

  it("preserves explicit absolute paths from the selected env file and process overrides", () => {
    expect(resolveFormalMediaStorage({
      env: { IM_MEDIA_STORAGE_DIR: "/mounted/im" },
      fileEnv: { IM_MEDIA_STORAGE_DIR: "/old/im", CONTENT_MEDIA_STORAGE_DIR: "/mounted/content" },
      projectRoot: "/repo", gitCommonDirectory: "/repo/.git"
    })).toMatchObject({ imMediaStorageDir: "/mounted/im", contentMediaStorageDir: "/mounted/content" });
  });

  it("anchors the legacy example env defaults to the common checkout", () => {
    expect(resolveFormalMediaStorage({
      env: {}, fileEnv: { IM_MEDIA_STORAGE_DIR: "runtime/im-media", CONTENT_MEDIA_STORAGE_DIR: "runtime/content-media" },
      projectRoot: "/repo/.worktrees/feature", gitCommonDirectory: "/repo/.git"
    }).imMediaStorageDir).toBe("/repo/backend/runtime/im-media");
  });

  it.each(["IM_MEDIA_STORAGE_DIR", "CONTENT_MEDIA_STORAGE_DIR"])("rejects ambiguous relative %s overrides", (field) => {
    expect(() => resolveFormalMediaStorage({ env: { [field]: "relative/media" }, projectRoot: "/repo" })).toThrow(`${field} must be an absolute path`);
    expect(() => resolveFormalMediaStorage({ env: {}, fileEnv: { [field]: "relative/media" }, projectRoot: "/repo" })).toThrow(`${field} must be an absolute path`);
  });

  it("reports the project fallback for a non-Git checkout", () => {
    expect(resolveFormalMediaStorage({ env: {}, projectRoot: "/srv/needo" })).toMatchObject({
      imMediaStorageDir: "/srv/needo/backend/runtime/im-media", source: "project-root-fallback"
    });
  });

  it("requires explicit persistent paths even if the formal launcher is used in production", () => {
    expect(() => resolveFormalMediaStorage({ env: {}, fileEnv: { NODE_ENV: "production" }, projectRoot: "/repo", gitCommonDirectory: "/repo/.git" })).toThrow("IM_MEDIA_STORAGE_DIR must be an absolute path");
  });

  it("rejects a nonabsolute Git common directory instead of resolving against cwd", () => {
    expect(() => resolveFormalMediaStorage({ env: {}, projectRoot: "/repo", gitCommonDirectory: "../.git" })).toThrow("gitCommonDirectory must be an absolute path");
  });
});
