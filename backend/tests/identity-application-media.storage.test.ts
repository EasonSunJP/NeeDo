import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityApplicationMediaFileStorage } from "../src/services/identity-application-media.storage";

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("needo-test-image")
]);

describe("IdentityApplicationMediaFileStorage", () => {
  it("validates the signature and stores the same image under an application-isolated hash", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-identity-media-"));
    const storage = new IdentityApplicationMediaFileStorage(directory);
    const first = await storage.save({ applicationId: 41, bytes: png, mimeType: "image/png" });
    const secondApplication = await storage.save({
      applicationId: 42,
      bytes: png,
      mimeType: "image/png"
    });

    expect(first.fileKey).toMatch(/^[a-f0-9]{64}\.png$/u);
    expect(secondApplication.fileKey).not.toBe(first.fileKey);
    await expect(readFile(first.absolutePath)).resolves.toEqual(png);
    await expect(storage.read(first.fileKey)).resolves.toEqual(png);
  });

  it("rejects a MIME/signature mismatch and oversized content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-identity-media-"));
    const storage = new IdentityApplicationMediaFileStorage(directory, 16);
    await expect(
      storage.save({ applicationId: 41, bytes: Buffer.from("not-png"), mimeType: "image/png" })
    ).rejects.toMatchObject({ message: "error.identity_application.media_invalid" });
    await expect(
      storage.save({ applicationId: 41, bytes: png, mimeType: "image/png" })
    ).rejects.toMatchObject({ message: "error.identity_application.media_invalid" });
  });
});
