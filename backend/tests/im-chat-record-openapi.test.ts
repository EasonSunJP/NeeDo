import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

type OpenApiSchema = Record<string, unknown> & {
  properties?: Record<string, unknown>;
  required?: string[];
};
type OpenApiOperation = {
  security: Array<Record<string, string[]>>;
  requestBody: { content: Record<string, { schema: unknown }> };
  responses: Record<string, { content: Record<string, { schema: unknown }> }>;
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
      "ImBatchDeleteRequest"
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
    const media =
      api.paths["/api/v1/im/chat-records/{publicId}/media/{checksumSha256}"].get.responses["200"];
    expect(Object.keys(media.content).sort()).toEqual(
      ["audio/mp4", "audio/ogg", "audio/webm", "image/jpeg", "image/png", "image/webp"].sort()
    );
    for (const response of Object.values(media.content))
      expect(response.schema).toEqual({ type: "string", format: "binary" });
  });
});
