import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  emailVerifiedAt: Date;
  name: string | null;
  pictureUrl: string | null;
}

interface GoogleIdTokenPayload {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  nonce?: string;
  name?: string;
  picture?: string;
}

interface GoogleIdTokenTicket {
  getPayload(): GoogleIdTokenPayload | undefined;
}

export interface GoogleTicketClient {
  verifyIdToken(input: {
    idToken: string;
    audience?: string | string[];
  }): Promise<GoogleIdTokenTicket>;
}

export interface GoogleCredentialVerifierPort {
  verify(input: { credential: string; expectedNonce: string }): Promise<VerifiedGoogleIdentity>;
}

interface GoogleCredentialVerifierConfig {
  GOOGLE_AUTH_CLIENT_ID: string;
  GOOGLE_AUTH_VERIFY_TIMEOUT_MS: number;
}

export class GoogleCredentialVerifierService implements GoogleCredentialVerifierPort {
  public constructor(
    private readonly client: GoogleTicketClient = new OAuth2Client(),
    private readonly config: GoogleCredentialVerifierConfig = env
  ) {}

  public async verify(input: {
    credential: string;
    expectedNonce: string;
  }): Promise<VerifiedGoogleIdentity> {
    let payload: GoogleIdTokenPayload | undefined;
    try {
      payload = await this.withTimeout(
        this.client
          .verifyIdToken({
            idToken: input.credential,
            audience: this.config.GOOGLE_AUTH_CLIENT_ID
          })
          .then((ticket) => ticket.getPayload())
      );
    } catch {
      throw this.invalidCredential();
    }

    const subject = payload?.sub?.trim();
    const email = payload?.email?.trim().toLowerCase();
    if (!payload || !subject || !email || payload.email_verified !== true) {
      throw this.invalidCredential();
    }
    if (payload.nonce !== input.expectedNonce) {
      throw this.invalidNonce();
    }

    return {
      subject,
      email,
      emailVerifiedAt: new Date(),
      name: this.optionalProfileValue(payload.name),
      pictureUrl: this.optionalProfileValue(payload.picture)
    };
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Google credential verification timed out")),
            this.config.GOOGLE_AUTH_VERIFY_TIMEOUT_MS
          );
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private optionalProfileValue(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private invalidCredential(): AppError {
    return new AppError({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      message: "error.auth.google_credential_invalid",
      statusCode: 401
    });
  }

  private invalidNonce(): AppError {
    return new AppError({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      message: "error.auth.google_nonce_invalid",
      statusCode: 401
    });
  }
}
