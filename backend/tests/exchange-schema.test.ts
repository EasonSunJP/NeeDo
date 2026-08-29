import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const migrationPath = resolve(
  __dirname,
  "../prisma/migrations/20260830040000_formal_needo_exchange/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

const modelSource = (name: string): string => {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`, "m"));
  return match?.[0] ?? "";
};

describe("formal NeeDo Exchange schema", () => {
  it("defines the three database enums with lowercase mappings", () => {
    expect(schema).toContain("enum ExchangePostType");
    expect(schema).toContain('DEMAND       @map("demand")');
    expect(schema).toContain('INTELLIGENCE @map("intelligence")');
    expect(schema).toContain("enum ExchangePostStatus");
    expect(schema).toContain('WITHDRAWN @map("withdrawn")');
    expect(schema).toContain("enum ExchangeServiceMode");
    expect(schema).toContain('FLEXIBLE @map("flexible")');
  });

  it.each([
    "ExchangePost",
    "ExchangeDemand",
    "ExchangeIntelligence",
    "ExchangeComment",
    "ExchangeLike",
    "ExchangeShare"
  ])("gives %s the formal lifecycle columns", (model) => {
    const source = modelSource(model);
    expect(source).toMatch(/\bid\s+Int\s+@id/);
    expect(source).toContain("createdAt");
    expect(source).toContain("updatedAt");
    expect(source).toContain("deletedAt");
  });

  it("ties posts and interactions to real users and identities", () => {
    const post = modelSource("ExchangePost");
    expect(post).toContain("authorUserId");
    expect(post).toContain("authorIdentityId");
    expect(post).toContain("publisherPublicId");
    expect(post).toContain("publisherIdentityType");

    for (const model of ["ExchangeComment", "ExchangeLike", "ExchangeShare"]) {
      const source = modelSource(model);
      expect(source).toMatch(/(author|actor)UserId/);
      expect(source).toMatch(/(author|actor)IdentityId/);
    }
  });

  it("enforces one subtype and one actor like/share per post", () => {
    expect(modelSource("ExchangeDemand")).toContain("postId");
    expect(modelSource("ExchangeDemand")).toContain("@unique");
    expect(modelSource("ExchangeIntelligence")).toContain("@unique");
    expect(modelSource("ExchangeLike")).toContain("@@unique([postId, actorUserId])");
    expect(modelSource("ExchangeShare")).toContain("@@unique([postId, actorUserId])");
  });

  it("ships an additive migration with all Exchange tables and foreign keys", () => {
    expect(migration).toContain("CREATE TABLE `exchange_posts`");
    expect(migration).toContain("CREATE TABLE `exchange_demands`");
    expect(migration).toContain("CREATE TABLE `exchange_intelligences`");
    expect(migration).toContain("CREATE TABLE `exchange_comments`");
    expect(migration).toContain("CREATE TABLE `exchange_likes`");
    expect(migration).toContain("CREATE TABLE `exchange_shares`");
    expect(migration).toContain("ADD CONSTRAINT");
    expect(migration).not.toMatch(/(?:^|\n)\s*(?:DROP|DELETE|TRUNCATE)\b/i);
  });
});
