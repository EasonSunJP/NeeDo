import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("backoffice user review amendment schema", () => {
  it("defines immutable review and tag amendment rows", () => {
    expect(schema).toMatch(
      /model OrderReviewAmendment \{[\s\S]*orderReviewId[\s\S]*version[\s\S]*rating[\s\S]*comment[\s\S]*reason[\s\S]*revisedById/
    );
    expect(schema).toMatch(/model OrderReviewAmendmentTag \{[\s\S]*amendmentId[\s\S]*label/);
    expect(schema).toContain("@@unique([orderReviewId, version]");
    expect(schema).toContain('@@map("order_review_amendments")');
    expect(schema).toContain('@@map("order_review_amendment_tags")');
  });
});
