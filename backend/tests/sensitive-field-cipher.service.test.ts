import { SensitiveFieldCipherService } from "../src/services/sensitive-field-cipher.service";

describe("SensitiveFieldCipherService", () => {
  const createService = (): SensitiveFieldCipherService =>
    new SensitiveFieldCipherService("test-sensitive-data-key-with-at-least-32-characters");

  it("round-trips authenticated ciphertext without exposing plaintext", () => {
    const service = createService();
    const sealed = service.seal("1234567");

    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("1234567");
    expect(service.open(sealed)).toBe("1234567");
  });

  it("uses a random nonce for the same plaintext", () => {
    const service = createService();

    expect(service.seal("1234567")).not.toBe(service.seal("1234567"));
  });

  it("rejects tampered ciphertext and unsupported envelope versions", () => {
    const service = createService();
    const sealed = service.seal("1234567");
    const segments = sealed.split(".");
    const encodedCiphertext = segments[3];
    segments[3] = `${encodedCiphertext.startsWith("A") ? "B" : "A"}${encodedCiphertext.slice(1)}`;
    const tampered = segments.join(".");

    expect(() => service.open(tampered)).toThrow("error.sensitive_data.invalid_ciphertext");
    expect(() => service.open(sealed.replace(/^v1/, "v2"))).toThrow(
      "error.sensitive_data.invalid_ciphertext"
    );
  });

  it("creates a deterministic keyed match hash without exposing the normalized name", () => {
    const service = createService();

    expect(service.matchHash("ヤマモトタロウ")).toMatch(/^[a-f0-9]{64}$/);
    expect(service.matchHash("ヤマモトタロウ")).toBe(service.matchHash("ヤマモトタロウ"));
    expect(service.matchHash("ヤマモトタロウ")).not.toBe(service.matchHash("ヤマモトジロウ"));
    expect(service.matchHash("ヤマモトタロウ")).not.toContain("ヤマモト");
  });

  it("masks account numbers to the final four digits", () => {
    const service = createService();

    expect(service.maskAccountNumber("1234567")).toBe("•••4567");
    expect(service.maskAccountNumber("123")).toBe("•••0123");
  });
});
