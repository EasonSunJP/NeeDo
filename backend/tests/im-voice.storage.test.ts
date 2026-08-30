import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImVoiceFileStorage } from "../src/services/im-voice.storage";

const samples = [
  ["audio/webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01])],
  ["audio/mp4", Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])],
  ["audio/ogg", Buffer.from("OggS\u0000", "binary")],
] as const;

describe("ImVoiceFileStorage", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "needo-im-voice-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each(samples)("stores validated %s with a trusted extension", async (mimeType, bytes) => {
    const storage = new ImVoiceFileStorage(directory);
    const stored = await storage.save(bytes, mimeType);

    expect(stored.fileKey).toMatch(/^[a-f0-9]{64}\.(?:webm|mp4|ogg)$/);
    expect(stored).toMatchObject({ mimeType, size: bytes.length });
    await expect(access(join(directory, stored.fileKey))).resolves.toBeUndefined();
  });

  it("rejects spoofed, empty, and oversized audio before writing", async () => {
    const storage = new ImVoiceFileStorage(directory, 8);

    await expect(storage.save(Buffer.from("fake"), "audio/webm")).rejects.toMatchObject({
      message: "error.im.voice_invalid",
      statusCode: 400,
    });
    await expect(storage.save(Buffer.alloc(0), "audio/ogg")).rejects.toMatchObject({
      message: "error.im.voice_invalid",
    });
    await expect(storage.save(Buffer.alloc(9), "audio/mp4")).rejects.toMatchObject({
      message: "error.im.voice_invalid",
    });
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it("removes only a validated opaque key and treats an absent file as cleaned", async () => {
    const storage = new ImVoiceFileStorage(directory);
    const stored = await storage.save(samples[0][1], samples[0][0]);

    await storage.remove(stored.fileKey);
    await storage.remove(stored.fileKey);
    await expect(readdir(directory)).resolves.toEqual([]);
    await expect(storage.remove("../escape.webm")).rejects.toMatchObject({
      message: "error.im.voice_invalid",
    });
  });
});
