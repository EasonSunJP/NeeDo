import { describe, expect, it } from "@jest/globals";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
});
