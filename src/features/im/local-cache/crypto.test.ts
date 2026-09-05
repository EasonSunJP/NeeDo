import { describe, expect, it } from "vitest";
import {
  createImCacheKey,
  decryptImCacheValue,
  encryptImCacheValue,
} from "./crypto";

describe("IM opened-media cache cryptography", () => {
  it("uses a non-extractable AES-256-GCM key and account-bound AAD", async () => {
    const key = await createImCacheKey();
    const plaintext = new TextEncoder().encode("private-media");
    const envelope = await encryptImCacheValue(
      key,
      "account:a:media:2:9",
      plaintext,
    );

    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(key.extractable).toBe(false);
    await expect(
      decryptImCacheValue(key, "account:a:media:2:9", envelope),
    ).resolves.toEqual(plaintext);
    await expect(
      decryptImCacheValue(key, "account:b:media:2:9", envelope),
    ).rejects.toBeDefined();
  });
});
