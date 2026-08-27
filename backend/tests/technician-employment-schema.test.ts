import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("technician employment schema", () => {
  it("persists technician employment instead of deriving it in the client", () => {
    const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");

    expect(schema).toContain("enum TechnicianEmploymentType");
    expect(schema).toContain(
      "employmentType      TechnicianEmploymentType @default(INDEPENDENT)"
    );
    expect(schema).toContain("employmentStartedAt DateTime?");
    expect(schema).toContain("@@index([shopId, employmentType])");
  });
});
