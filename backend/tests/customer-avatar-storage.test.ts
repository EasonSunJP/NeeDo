import { describe, expect, it } from "@jest/globals";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CustomerAvatarFileStorage } from "../src/services/customer-avatar.storage";

describe("CustomerAvatarFileStorage", () => {
  it("writes validated image bytes under a content hash and returns the public URL", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "needo-customer-avatar-"));
    const storage = new CustomerAvatarFileStorage(
      tempDirectory,
      "http://localhost:3000/media/customer-avatars"
    );

    try {
      const result = await storage.save("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB");

      expect(result.url).toMatch(
        /^http:\/\/localhost:3000\/media\/customer-avatars\/[a-f0-9]{64}\.png$/
      );
      await expect(readFile(result.absolutePath)).resolves.toBeInstanceOf(Buffer);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("rejects bytes whose magic signature does not match the declared MIME type", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "needo-customer-avatar-"));
    const storage = new CustomerAvatarFileStorage(
      tempDirectory,
      "http://localhost:3000/media/customer-avatars"
    );

    try {
      await expect(storage.save("data:image/png;base64,SGVsbG8=")).rejects.toMatchObject({
        statusCode: 400
      });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("rejects an oversized image and treats an existing content hash as one stored avatar", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "needo-customer-avatar-"));
    const storage = new CustomerAvatarFileStorage(
      tempDirectory,
      "http://localhost:3000/media/customer-avatars"
    );
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    try {
      const oversizedPng = Buffer.concat([pngSignature, Buffer.alloc(675_001 - pngSignature.length)]);
      await expect(storage.save(`data:image/png;base64,${oversizedPng.toString("base64")}`)).rejects.toMatchObject({
        statusCode: 400
      });

      const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
      const first = await storage.save(imageDataUrl);
      const second = await storage.save(imageDataUrl);

      expect(second).toEqual(first);
      await expect(stat(first.absolutePath)).resolves.toMatchObject({ size: 24 });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
