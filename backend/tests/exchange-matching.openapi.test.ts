import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

interface Operation {
  parameters: Array<{ name: string; in: string; required?: boolean; schema: unknown }>;
  responses: Record<string, { description: string }>;
  requestBody?: unknown;
  security: Array<{ bearerAuth: unknown[] }>;
  "x-required-permission": string;
}

interface Document {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Record<string, unknown>> };
}

const document = createOpenApiDocument(env) as unknown as Document;

describe("Exchange selective exact matching OpenAPI", () => {
  it("documents the read and select endpoints with exact permissions", () => {
    expect(document.paths["/api/v1/exchange/posts/{id}/matching"]?.get).toEqual(
      expect.objectContaining({
        security: [{ bearerAuth: [] }],
        "x-required-permission": "exchange:matching:read-own"
      })
    );
    expect(document.paths["/api/v1/exchange/posts/{id}/matching/select"]?.post).toEqual(
      expect.objectContaining({
        security: [{ bearerAuth: [] }],
        "x-required-permission": "exchange:matching:select-own"
      })
    );
    expect(
      document.paths["/api/v1/exchange/posts/{id}/matching/quick/confirm-budget"]?.post
    ).toEqual(
      expect.objectContaining({
        security: [{ bearerAuth: [] }],
        "x-required-permission": "exchange:matching:select-own"
      })
    );
  });

  it("requires idempotency for selection and exposes no close or payment mutation", () => {
    const select = document.paths["/api/v1/exchange/posts/{id}/matching/select"].post;
    const quick = document.paths["/api/v1/exchange/posts/{id}/matching/quick/confirm-budget"].post;
    expect(select.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 16, maxLength: 191 }
        })
      ])
    );
    expect(document.paths).not.toHaveProperty("/api/v1/exchange/posts/{id}/matching/close");
    expect(quick.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true })
      ])
    );
    expect(document.paths).toHaveProperty("/api/v1/exchange/posts/{id}/matching/bookings.post");
    expect(JSON.stringify(document.paths)).not.toMatch(/matching\/pay/u);
  });

  it("documents strict matching and participant payloads without internal lock fields", () => {
    expect(document.components.schemas).toEqual(
      expect.objectContaining({
        ExchangeMatching: expect.any(Object),
        ExchangeMatchParticipant: expect.any(Object),
        ExchangeMatchSelectRequest: expect.any(Object),
        ExchangeQuickBudgetConfirmationRequest: expect.any(Object)
      })
    );
    expect(JSON.stringify(document.components.schemas.ExchangeMatching)).not.toMatch(
      /participantUserId|participantIdentityId|activeReservationKey|payloadFingerprint/u
    );
  });
});
