import { access, mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { ImChatRecordMediaFileStorage } from "../src/services/im-chat-record-media.storage";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

describe("ImChatRecordMediaFileStorage", () => {
  it("clones only a configured NeeDo media URL into attempt-private protected storage", async () => {
    const parent = await mkdtemp(join(tmpdir(), "needo-chat-record-media-"));
    const source = join(parent, "im");
    const target = join(parent, "records");
    await mkdir(source);
    await mkdir(target);
    await writeFile(join(source, "source.png"), png);
    const storage = new ImChatRecordMediaFileStorage({
      directory: target,
      sourceRoots: [{ directory: source, publicBaseUrl: "/media/im" }]
    });

    try {
      const first = await storage.clone("/media/im/source.png", "image/png");
      const replay = await storage.clone("/media/im/source.png", "image/png");
      expect(first).toMatchObject({
        created: true,
        mimeType: "image/png",
        size: png.length,
        checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        fileKey: expect.stringMatching(/^[a-f0-9]{64}\/[0-9a-f-]{36}\/[a-f0-9]{64}\.png$/u)
      });
      expect(first).not.toHaveProperty("url");
      expect(replay).toMatchObject({
        created: true,
        checksumSha256: first.checksumSha256,
        mimeType: first.mimeType,
        size: first.size
      });
      expect(replay.fileKey).not.toBe(first.fileKey);
      await expect(access(join(target, first.fileKey))).resolves.toBeUndefined();
      await expect(storage.read(first.checksumSha256, first.mimeType)).resolves.toMatchObject({
        bytes: png,
        checksumSha256: first.checksumSha256,
        mimeType: first.mimeType,
        size: png.length
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("never deletes a concurrent successful clone that has the same checksum", async () => {
    const parent = await mkdtemp(join(tmpdir(), "needo-chat-record-media-concurrent-"));
    const source = join(parent, "im");
    const target = join(parent, "records");
    await mkdir(source);
    await writeFile(join(source, "source.png"), png);
    const storage = new ImChatRecordMediaFileStorage({
      directory: target,
      sourceRoots: [{ directory: source, publicBaseUrl: "/media/im" }]
    });

    try {
      const [failedAttempt, successfulAttempt] = await Promise.all([
        storage.clone("/media/im/source.png", "image/png"),
        storage.clone("/media/im/source.png", "image/png")
      ]);
      expect(failedAttempt.fileKey).not.toBe(successfulAttempt.fileKey);

      await storage.delete(failedAttempt.fileKey);

      await expect(access(join(target, successfulAttempt.fileKey))).resolves.toBeUndefined();
      await expect(
        storage.read(successfulAttempt.checksumSha256, "image/png")
      ).resolves.toMatchObject({ bytes: png });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("rejects a configured-root symlink that escapes to an external file", async () => {
    const parent = await mkdtemp(join(tmpdir(), "needo-chat-record-media-symlink-"));
    const source = join(parent, "im");
    const outside = join(parent, "outside");
    const target = join(parent, "records");
    await mkdir(source);
    await mkdir(outside);
    await writeFile(join(outside, "secret.png"), png);
    await symlink(join(outside, "secret.png"), join(source, "escape.png"));
    const storage = new ImChatRecordMediaFileStorage({
      directory: target,
      sourceRoots: [{ directory: source, publicBaseUrl: "/media/im" }]
    });

    try {
      await expect(storage.clone("/media/im/escape.png", "image/png")).rejects.toMatchObject({
        message: "error.im.chat_record_media_unavailable"
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it.each([
    ["https://evil.example/media/im/source.png", "image/png"],
    ["/media/im/../outside.png", "image/png"],
    ["/media/im/missing.png", "image/png"],
    ["/media/im/source.png", "image/jpeg"]
  ])("rejects unavailable or spoofed source %s", async (url, mimeType) => {
    const parent = await mkdtemp(join(tmpdir(), "needo-chat-record-media-invalid-"));
    const source = join(parent, "im");
    const target = join(parent, "records");
    await mkdir(source);
    await mkdir(target);
    await writeFile(join(source, "source.png"), png);
    const storage = new ImChatRecordMediaFileStorage({
      directory: target,
      sourceRoots: [{ directory: source, publicBaseUrl: "/media/im" }]
    });

    try {
      await expect(storage.clone(url, mimeType)).rejects.toMatchObject({
        message: "error.im.chat_record_media_unavailable"
      });
      await expect(readdir(target)).resolves.toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("rejects content above 8 MiB and validates deletion keys", async () => {
    const parent = await mkdtemp(join(tmpdir(), "needo-chat-record-media-limit-"));
    const source = join(parent, "content");
    const target = join(parent, "records");
    await mkdir(source);
    await writeFile(join(source, "large.png"), Buffer.concat([png, Buffer.alloc(8 * 1024 * 1024)]));
    const storage = new ImChatRecordMediaFileStorage({
      directory: target,
      sourceRoots: [{ directory: source, publicBaseUrl: "/media/content" }]
    });

    try {
      await expect(storage.clone("/media/content/large.png", "image/png")).rejects.toMatchObject({
        message: "error.im.chat_record_media_unavailable"
      });
      await expect(storage.delete("../escape.png")).rejects.toMatchObject({
        message: "error.im.chat_record_media_unavailable"
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
