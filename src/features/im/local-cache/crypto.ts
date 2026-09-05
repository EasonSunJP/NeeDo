export type ImCacheEnvelope = {
  algorithm: "AES-GCM";
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  version: 1;
};

const encoder = new TextEncoder();

function requireWebCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("error.im.local_cache_crypto_unavailable");
  }

  return globalThis.crypto;
}

export function createImCacheKey(): Promise<CryptoKey> {
  return requireWebCrypto().subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptImCacheValue(
  key: CryptoKey,
  aad: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<ImCacheEnvelope> {
  const crypto = requireWebCrypto();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(aad),
    },
    key,
    bytes,
  );

  return { algorithm: "AES-GCM", ciphertext, iv, version: 1 };
}

export async function decryptImCacheValue(
  key: CryptoKey,
  aad: string,
  envelope: ImCacheEnvelope,
): Promise<Uint8Array<ArrayBuffer>> {
  if (
    envelope.algorithm !== "AES-GCM" ||
    envelope.version !== 1 ||
    envelope.iv.byteLength !== 12
  ) {
    throw new Error("error.im.local_cache_envelope_invalid");
  }

  const plaintext = await requireWebCrypto().subtle.decrypt(
    {
      name: "AES-GCM",
      iv: envelope.iv,
      additionalData: encoder.encode(aad),
    },
    key,
    envelope.ciphertext,
  );

  return new Uint8Array(plaintext);
}
