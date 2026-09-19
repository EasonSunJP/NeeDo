import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("IM conversation deletion contract", () => {
  it("documents that deleting a chat preserves the contact relationship", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<
        string,
        Record<string, { description?: string; summary?: string }>
      >;
    };
    const operation = document.paths["/api/v1/im/conversations/{conversationId}"]?.delete;

    expect(`${operation?.summary ?? ""} ${operation?.description ?? ""}`).toContain(
      "contact relationship"
    );
    expect(`${operation?.summary ?? ""} ${operation?.description ?? ""}`).toContain(
      "contact list"
    );
  });
});
