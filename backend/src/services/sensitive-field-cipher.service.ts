import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;

export class SensitiveFieldCipherService {
  private readonly key: Buffer;

  public constructor(secret: string) {
    if (secret.length < 32) {
      throw new Error("error.sensitive_data.invalid_key");
    }
    this.key = createHash("sha256").update(secret).digest();
  }

  public seal(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();

    return [
      ENVELOPE_VERSION,
      iv.toString("base64url"),
      authenticationTag.toString("base64url"),
      ciphertext.toString("base64url")
    ].join(".");
  }

  public open(envelope: string): string {
    try {
      const [version, encodedIv, encodedTag, encodedCiphertext, extra] = envelope.split(".");
      if (
        version !== ENVELOPE_VERSION ||
        !encodedIv ||
        !encodedTag ||
        !encodedCiphertext ||
        extra
      ) {
        throw new Error("invalid envelope");
      }

      const iv = Buffer.from(encodedIv, "base64url");
      const authenticationTag = Buffer.from(encodedTag, "base64url");
      const ciphertext = Buffer.from(encodedCiphertext, "base64url");
      if (iv.length !== IV_BYTES || authenticationTag.length !== 16 || ciphertext.length === 0) {
        throw new Error("invalid envelope bytes");
      }

      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(authenticationTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new Error("error.sensitive_data.invalid_ciphertext");
    }
  }

  public matchHash(normalizedValue: string): string {
    return createHmac("sha256", this.key).update(normalizedValue).digest("hex");
  }

  public maskAccountNumber(accountNumber: string): string {
    const finalFour = accountNumber.replace(/\D/gu, "").padStart(4, "0").slice(-4);
    return `•••${finalFour}`;
  }
}
