import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

type Schema = Record<string, unknown> & {
  additionalProperties?: boolean;
  properties?: Record<string, unknown>;
  required?: string[];
};

type Operation = {
  requestBody?: { content: Record<string, { schema: unknown }> };
  responses: Record<string, { content: Record<string, { schema: unknown }> }>;
  security: Array<Record<string, string[]>>;
};

type OpenApiDocument = {
  components: { schemas: Record<string, Schema> };
  paths: Record<string, Record<string, Operation>>;
};

const document = () => createOpenApiDocument(env) as unknown as OpenApiDocument;

describe("IM contact-card OpenAPI contract", () => {
  it("documents the protected candidate and dedicated send operations", () => {
    const api = document();
    const candidates =
      api.paths["/api/v1/im/conversations/{conversationId}/contact-card-candidates"].get;
    const send = api.paths["/api/v1/im/conversations/{conversationId}/contact-cards"].post;

    expect(candidates).toMatchObject({ security: [{ bearerAuth: [] }] });
    expect(send).toMatchObject({ security: [{ bearerAuth: [] }] });
    expect(candidates.responses["200"].content["application/json"].schema).toMatchObject({
      properties: {
        data: { $ref: "#/components/schemas/ContactCardCandidatePage" }
      }
    });
    expect(send.requestBody?.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ContactCardSendRequest"
    });
    expect(send.responses["201"].content["application/json"].schema).toMatchObject({
      properties: {
        data: { $ref: "#/components/schemas/ContactCardSendResult" }
      }
    });
  });

  it("locks the immutable V2 snapshot and legacy read projection", () => {
    const schemas = document().components.schemas;
    expect(schemas.ContactCardSendResult.properties?.message).toEqual({
      $ref: "#/components/schemas/ContactCardMessage"
    });
    expect(schemas.ContactCardMessage).toMatchObject({
      allOf: [
        { $ref: "#/components/schemas/RealtimeMessage" },
        {
          properties: {
            metadata: { $ref: "#/components/schemas/ImContactCardSnapshotV2" }
          }
        }
      ]
    });
    expect(schemas.ImContactCardSnapshotV2).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["snapshotVersion", "type", "contactCard"],
      properties: {
        snapshotVersion: { type: "integer", enum: [2] },
        type: { type: "string", enum: ["contact-card"] },
        contactCard: { $ref: "#/components/schemas/ImContactCardV2" }
      }
    });
    expect(schemas.ImContactCardV2).toMatchObject({
      additionalProperties: false,
      required: [
        "targetUserPublicId",
        "needoId",
        "nickname",
        "avatarUrl",
        "entityKind",
        "entityPublicId",
        "ekycVerified",
        "level",
        "bio",
        "tierCode",
        "themeVersionPublicId",
        "simpleTopColor",
        "simpleBottomColor",
        "languages",
        "rating",
        "completedOrderCount",
        "favoriteCount",
        "shareCount",
        "specialReviewTags"
      ],
      properties: {
        entityKind: { enum: ["customer", "technician", "shop", "service"] },
        entityPublicId: { type: ["string", "null"], maxLength: 191 },
        level: { type: ["integer", "null"], minimum: 1, maximum: 100 },
        bio: { type: ["string", "null"], maxLength: 500 },
        tierCode: { enum: ["free", "silver", "gold", "black_diamond", null] },
        simpleTopColor: { pattern: "^#[0-9A-Fa-f]{6}$" },
        simpleBottomColor: { pattern: "^#[0-9A-Fa-f]{6}$" },
        languages: { type: "array", maxItems: 12 },
        rating: { type: ["number", "null"], minimum: 0, maximum: 5 },
        completedOrderCount: { type: ["integer", "null"], minimum: 0 },
        favoriteCount: { type: ["integer", "null"], minimum: 0 },
        shareCount: { type: ["integer", "null"], minimum: 0 },
        specialReviewTags: { type: "array", maxItems: 8 }
      }
    });
    expect(schemas.LegacyImContactCardMetadata).toMatchObject({
      description: expect.stringContaining("read-only")
    });
  });
});
