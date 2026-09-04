import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export interface AffiliateLinkSubject {
  taskId: number;
  userId: number;
  expiresAt: Date;
  publicTokenId: string;
}

export interface AffiliateIssuedLink {
  publicTokenId: string;
  publicToken: string;
  tokenHash: string;
  promotionUrl: string;
}

export interface AffiliateLinkVerificationInput extends AffiliateLinkSubject {
  publicToken: string;
  tokenHash: string;
}

interface AffiliateLinkTokenServiceOptions {
  secret: string;
  publicBaseUrl: string;
  createPublicTokenId?: () => string;
}

const TOKEN_VERSION = "v1";

export class AffiliateLinkTokenService {
  private readonly publicBaseUrl: string;
  private readonly createPublicTokenId: () => string;

  public constructor(private readonly options: AffiliateLinkTokenServiceOptions) {
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, "");
    this.createPublicTokenId =
      options.createPublicTokenId ?? (() => randomBytes(18).toString("base64url"));
  }

  public issue(input: Omit<AffiliateLinkSubject, "publicTokenId">): AffiliateIssuedLink {
    return this.rebuild({
      ...input,
      publicTokenId: this.createPublicTokenId()
    });
  }

  public rebuild(input: AffiliateLinkSubject): AffiliateIssuedLink {
    const signature = createHmac("sha256", this.options.secret)
      .update(this.canonicalSubject(input))
      .digest("base64url");
    const publicToken = `${input.publicTokenId}.${signature}`;
    const tokenHash = createHash("sha256").update(publicToken).digest("hex");

    return {
      publicTokenId: input.publicTokenId,
      publicToken,
      tokenHash,
      promotionUrl: `${this.publicBaseUrl}/r/${encodeURIComponent(publicToken)}`
    };
  }

  public verify(input: AffiliateLinkVerificationInput): boolean {
    const [publicTokenId, signature, extra] = input.publicToken.split(".");
    if (!publicTokenId || !signature || extra || publicTokenId !== input.publicTokenId) {
      return false;
    }

    const expected = this.rebuild(input);
    return (
      this.safeEqual(input.publicToken, expected.publicToken) &&
      this.safeEqual(input.tokenHash, expected.tokenHash)
    );
  }

  private canonicalSubject(input: AffiliateLinkSubject): string {
    return [
      TOKEN_VERSION,
      String(input.taskId),
      String(input.userId),
      input.publicTokenId,
      String(input.expiresAt.getTime())
    ].join(":");
  }

  private safeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }
}
