import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { z } from "zod";
import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export type AuthTokenType = "access" | "refresh";

export interface AuthTokenSubject {
  id: number;
  email: string;
  currentIdentityId?: number;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  type: AuthTokenType;
  jti: string;
  iat: number;
  exp: number;
  currentIdentityId?: number;
}

export interface IssuedAuthToken {
  token: string;
  jti: string;
  expiresAt: number;
  expiresIn: number;
}

const jwtHeader = {
  alg: "HS256",
  typ: "JWT"
};

const jwtHeaderSchema = z.object({
  alg: z.literal("HS256"),
  typ: z.literal("JWT")
});

const jwtPayloadSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  email: z.string().email(),
  type: z.enum(["access", "refresh"]),
  jti: z.string().min(1),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  currentIdentityId: z.number().int().positive().optional()
});

const toBase64Url = (input: string | Buffer): string => Buffer.from(input).toString("base64url");

const fromBase64UrlJson = (segment: string): unknown =>
  JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

const createSignature = (input: string, secret: string): string =>
  createHmac("sha256", secret).update(input).digest("base64url");

const assertSignature = (expected: string, actual: string): void => {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new AppError({
      code: ERROR_CODES.TOKEN_INVALID,
      message: "error.auth.token_invalid",
      statusCode: 401
    });
  }
};

export class AuthTokenService {
  public constructor(private readonly config: AppConfig) {}

  public issueAccessToken(subject: AuthTokenSubject): IssuedAuthToken {
    return this.issueToken(subject, "access", this.config.AUTH_ACCESS_TOKEN_TTL_SECONDS);
  }

  public issueRefreshToken(subject: AuthTokenSubject): IssuedAuthToken {
    return this.issueToken(subject, "refresh", this.config.AUTH_REFRESH_TOKEN_TTL_SECONDS);
  }

  public verifyAccessToken(token: string): AuthTokenPayload {
    return this.verifyToken(token, "access");
  }

  public verifyRefreshToken(token: string): AuthTokenPayload {
    return this.verifyToken(token, "refresh");
  }

  private issueToken(
    subject: AuthTokenSubject,
    type: AuthTokenType,
    ttlSeconds: number
  ): IssuedAuthToken {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + ttlSeconds;
    const payload: AuthTokenPayload = {
      sub: String(subject.id),
      email: subject.email,
      type,
      jti: randomUUID(),
      iat: issuedAt,
      exp: expiresAt,
      ...(subject.currentIdentityId ? { currentIdentityId: subject.currentIdentityId } : {})
    };
    const token = this.sign(payload, type);

    return {
      token,
      jti: payload.jti,
      expiresAt,
      expiresIn: ttlSeconds
    };
  }

  private sign(payload: AuthTokenPayload, type: AuthTokenType): string {
    const encodedHeader = toBase64Url(JSON.stringify(jwtHeader));
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = createSignature(signingInput, this.getSecret(type));

    return `${signingInput}.${signature}`;
  }

  private verifyToken(token: string, expectedType: AuthTokenType): AuthTokenPayload {
    const [encodedHeader, encodedPayload, signature, extra] = token.split(".");

    if (!encodedHeader || !encodedPayload || !signature || extra) {
      throw new AppError({
        code: ERROR_CODES.TOKEN_INVALID,
        message: "error.auth.token_invalid",
        statusCode: 401
      });
    }

    try {
      jwtHeaderSchema.parse(fromBase64UrlJson(encodedHeader));
      const payload = jwtPayloadSchema.parse(fromBase64UrlJson(encodedPayload));
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const expectedSignature = createSignature(signingInput, this.getSecret(expectedType));
      assertSignature(expectedSignature, signature);

      if (payload.type !== expectedType) {
        throw new AppError({
          code: ERROR_CODES.TOKEN_INVALID,
          message: "error.auth.token_invalid",
          statusCode: 401
        });
      }

      if (payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new AppError({
          code: ERROR_CODES.TOKEN_EXPIRED,
          message: "error.auth.token_expired",
          statusCode: 401
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError({
        code: ERROR_CODES.TOKEN_INVALID,
        message: "error.auth.token_invalid",
        statusCode: 401,
        cause: error
      });
    }
  }

  private getSecret(type: AuthTokenType): string {
    return type === "access"
      ? this.config.AUTH_ACCESS_TOKEN_SECRET
      : this.config.AUTH_REFRESH_TOKEN_SECRET;
  }
}
