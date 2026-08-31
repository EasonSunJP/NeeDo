import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

type OpenApiSchema = Record<string, unknown> & {
  properties?: Record<string, unknown>;
  required?: string[];
};
type OpenApiOperation = {
  security: Array<Record<string, string[]>>;
  requestBody: { content: Record<string, { schema: unknown }> };
  responses: Record<
    string,
    {
      content: Record<string, { schema: unknown }>;
      headers?: Record<string, unknown>;
    }
  >;
};
type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, OpenApiSchema> };
};

const document = (): OpenApiDocument => createOpenApiDocument(env) as unknown as OpenApiDocument;

describe("chat-record OpenAPI contract", () => {
  it("documents all eight protected operations and their formal schemas", () => {
    const api = document();
    const expected = [
      ["/api/v1/im/conversations/{targetConversationId}/chat-records", "post"],
      ["/api/v1/im/chat-records/{publicId}", "get"],
      ["/api/v1/im/chat-records/{publicId}/items", "get"],
      ["/api/v1/im/chat-records/{publicId}/media/{checksumSha256}", "get"],
      ["/api/v1/im/chat-record-favorites", "post"],
      ["/api/v1/im/chat-record-favorites", "get"],
      ["/api/v1/im/chat-record-favorites/{favoriteId}", "delete"],
      ["/api/v1/im/conversations/{conversationId}/messages/delete-for-me", "post"]
    ] as const;
    for (const [path, method] of expected) {
      expect(api.paths[path]?.[method]).toMatchObject({ security: [{ bearerAuth: [] }] });
      expect(api.paths[path][method].responses).toEqual(
        expect.objectContaining({ "401": expect.any(Object), "403": expect.any(Object) })
      );
    }
    for (const schema of [
      "ImChatRecordSummary",
      "ImChatRecordItem",
      "ImChatRecordItemPage",
      "ImChatRecordFavoritePage",
      "ImBatchDeleteRequest",
      "ImChatRecordDeliveryResult",
      "ImChatRecordFavoriteMutationResult",
      "ImChatRecordFavoriteDeleteResult",
      "ImBatchDeleteResult"
    ]) {
      expect(api.components.schemas).toHaveProperty(schema);
    }
  });

  it("documents strict bounded commands, standard pages, cursor pagination, and binary media", () => {
    const api = document();
    const commandReference =
      api.paths["/api/v1/im/chat-record-favorites"].post.requestBody.content["application/json"]
        .schema;
    expect(commandReference).toEqual({ $ref: "#/components/schemas/ImChatRecordCommand" });
    const commandSchema = api.components.schemas.ImChatRecordCommand;
    expect(commandSchema).toMatchObject({
      additionalProperties: false,
      required: ["idempotencyKey", "messageIds", "sourceConversationId"],
      properties: {
        idempotencyKey: { type: "string", format: "uuid" },
        messageIds: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
          items: { type: "integer", minimum: 1 }
        }
      }
    });
    expect(api.components.schemas.ImChatRecordItemPage.required).toEqual(
      expect.arrayContaining(["list", "total", "page", "page_size", "nextCursor"])
    );
    expect(api.components.schemas.ImChatRecordFavoritePage.required).toEqual(
      expect.arrayContaining(["list", "total", "page", "page_size"])
    );
    expect(api.components.schemas.ImChatRecordSummary).toMatchObject({
      required: expect.arrayContaining(["senderNames"]),
      properties: {
        senderNames: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { type: "string", minLength: 1, maxLength: 120 }
        }
      }
    });
    expect(api.components.schemas.ImChatRecordFavorite).toMatchObject({
      required: expect.arrayContaining(["senderNames"]),
      properties: {
        senderNames: api.components.schemas.ImChatRecordSummary.properties?.senderNames
      }
    });
    const safeMaximum = 2_147_483_647;
    expect(commandSchema).toMatchObject({
      properties: {
        messageIds: { items: { maximum: safeMaximum } },
        sourceConversationId: { type: "integer", minimum: 1, maximum: safeMaximum }
      }
    });
    expect(api.components.schemas.ImBatchDeleteRequest).toMatchObject({
      properties: { messageIds: { items: { maximum: safeMaximum } } }
    });
    expect(api.components.schemas.ImChatRecordItem).toMatchObject({
      properties: { id: { maximum: safeMaximum } }
    });
    expect(api.components.schemas.ImChatRecordFavorite).toMatchObject({
      properties: { id: { maximum: safeMaximum } }
    });
    expect(api.components.schemas.ImChatRecordItemPage).toMatchObject({
      properties: { nextCursor: { maximum: safeMaximum } }
    });
    for (const [path, method, parameterName] of [
      [
        "/api/v1/im/conversations/{targetConversationId}/chat-records",
        "post",
        "targetConversationId"
      ],
      ["/api/v1/im/chat-records/{publicId}/items", "get", "beforePosition"],
      ["/api/v1/im/chat-record-favorites", "get", "page"],
      ["/api/v1/im/chat-record-favorites/{favoriteId}", "delete", "favoriteId"],
      ["/api/v1/im/conversations/{conversationId}/messages/delete-for-me", "post", "conversationId"]
    ] as const) {
      const parameters = (
        api.paths[path][method] as unknown as {
          parameters: Array<{ name: string; schema: unknown }>;
        }
      ).parameters;
      expect(
        parameters.find((parameter) => parameter.name === parameterName)?.schema
      ).toMatchObject({
        type: "integer",
        minimum: 1,
        maximum: safeMaximum
      });
    }
    const media =
      api.paths["/api/v1/im/chat-records/{publicId}/media/{checksumSha256}"].get.responses["200"];
    expect(Object.keys(media.content).sort()).toEqual(
      ["audio/mp4", "audio/ogg", "audio/webm", "image/jpeg", "image/png", "image/webp"].sort()
    );
    for (const response of Object.values(media.content))
      expect(response.schema).toEqual({ type: "string", format: "binary" });
    expect(media.headers).toEqual(
      expect.objectContaining({
        "Content-Length": expect.objectContaining({ schema: { type: "integer", minimum: 0 } })
      })
    );
  });

  it("documents exact standard envelopes and result schemas for all four mutations", () => {
    const api = document();
    const mutations = [
      [
        "/api/v1/im/conversations/{targetConversationId}/chat-records",
        "post",
        "201",
        "ImChatRecordDeliveryResult"
      ],
      ["/api/v1/im/chat-record-favorites", "post", "201", "ImChatRecordFavoriteMutationResult"],
      [
        "/api/v1/im/chat-record-favorites/{favoriteId}",
        "delete",
        "200",
        "ImChatRecordFavoriteDeleteResult"
      ],
      [
        "/api/v1/im/conversations/{conversationId}/messages/delete-for-me",
        "post",
        "200",
        "ImBatchDeleteResult"
      ]
    ] as const;

    for (const [path, method, status, resultSchema] of mutations) {
      expect(
        api.paths[path][method].responses[status].content["application/json"].schema
      ).toMatchObject({
        type: "object",
        required: ["code", "message", "data"],
        properties: {
          code: { type: "integer", enum: [0] },
          message: { type: "string", enum: ["success"] },
          data: { $ref: `#/components/schemas/${resultSchema}` }
        }
      });
    }

    expect(api.components.schemas.ImChatRecordDeliveryResult).toMatchObject({
      additionalProperties: false,
      required: ["replayed", "bundle", "message"],
      properties: {
        replayed: { type: "boolean" },
        bundle: { $ref: "#/components/schemas/ImChatRecordSummary" },
        message: { $ref: "#/components/schemas/RealtimeMessage" }
      }
    });
    expect(api.components.schemas.ImChatRecordFavoriteMutationResult).toMatchObject({
      additionalProperties: false,
      required: ["replayed", "favorite"],
      properties: {
        replayed: { type: "boolean" },
        favorite: { $ref: "#/components/schemas/ImChatRecordFavorite" }
      }
    });
    expect(api.components.schemas.ImChatRecordFavoriteDeleteResult).toMatchObject({
      additionalProperties: false,
      required: ["deleted"],
      properties: { deleted: { type: "boolean", enum: [true] } }
    });
    expect(api.components.schemas.ImBatchDeleteResult).toMatchObject({
      additionalProperties: false,
      required: ["conversationId", "messageIds", "count", "deleted", "replayed"],
      properties: {
        conversationId: { type: "integer", minimum: 1 },
        messageIds: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
          items: { type: "integer", minimum: 1 }
        },
        count: { type: "integer", minimum: 1, maximum: 100 },
        deleted: { type: "boolean", enum: [true] },
        replayed: { type: "boolean" }
      }
    });
  });

  it("documents validation errors for every UUID, checksum, and numeric ID boundary", () => {
    const api = document();
    for (const [path, method] of [
      ["/api/v1/im/conversations/{targetConversationId}/chat-records", "post"],
      ["/api/v1/im/chat-records/{publicId}", "get"],
      ["/api/v1/im/chat-records/{publicId}/items", "get"],
      ["/api/v1/im/chat-records/{publicId}/media/{checksumSha256}", "get"],
      ["/api/v1/im/chat-record-favorites", "post"],
      ["/api/v1/im/chat-record-favorites", "get"],
      ["/api/v1/im/chat-record-favorites/{favoriteId}", "delete"],
      ["/api/v1/im/conversations/{conversationId}/messages/delete-for-me", "post"]
    ] as const) {
      expect(api.paths[path][method].responses).toHaveProperty("400");
    }
  });
});
