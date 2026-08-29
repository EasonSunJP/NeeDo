import { readFile as readSourceFile } from "node:fs/promises";
import { chmod, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContentMediaFileStorage } from "../src/services/content-media.storage";

const validPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("needo-atomic-content-media")
]);

describe("ContentMediaFileStorage crash-consistent canonical blobs", () => {
  it("reuses an existing canonical blob only when its SHA-256 is exact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-atomic-"));
    const storage = new ContentMediaFileStorage(directory);

    const first = await storage.save({ bytes: validPng, mimeType: "image/png" });
    const second = await storage.save({ bytes: validPng, mimeType: "image/png" });

    expect(first.created).toBe(true);
    expect(second).toMatchObject({ fileKey: first.fileKey, created: false });
    expect(await readdir(directory)).toEqual([first.fileKey]);
  });

  it("detects and atomically repairs a truncated canonical blob", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-repair-"));
    const storage = new ContentMediaFileStorage(directory);
    const first = await storage.save({ bytes: validPng, mimeType: "image/png" });
    await writeFile(join(directory, first.fileKey), Buffer.from("truncated"));

    const repaired = await storage.save({ bytes: validPng, mimeType: "image/png" });

    expect(repaired.created).toBe(false);
    await expect(readFile(join(directory, first.fileKey))).resolves.toEqual(validPng);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("never publishes a canonical path when the same-directory temp write fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-temp-failure-"));
    const storage = new ContentMediaFileStorage(directory);
    const prepared = storage.prepare({ bytes: validPng, mimeType: "image/png" });
    await chmod(directory, 0o500);

    await expect(storage.save({ bytes: validPng, mimeType: "image/png" })).rejects.toMatchObject({
      code: "EACCES"
    });
    await chmod(directory, 0o700);
    await expect(readFile(join(directory, prepared.fileKey))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("contains no heartbeat, stale takeover, or filesystem lock artifact", async () => {
    const source = await readSourceFile(
      join(__dirname, "../src/services/content-media.storage.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/staleLock|heartbeat|setInterval|\.locks|withChecksumLock/u);
  });
});
