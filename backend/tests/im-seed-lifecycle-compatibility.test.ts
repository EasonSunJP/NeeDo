import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const schemaSource = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const seedSource = readFileSync(
  resolve(__dirname, "../scripts/seed-three-month-simulation.ts"),
  "utf8"
);
const repositorySource = readFileSync(
  resolve(__dirname, "../src/repositories/realtime.repository.ts"),
  "utf8"
);

describe("formal IM lifecycle compatibility", () => {
  it("tracks the already-applied lifecycle migrations and Prisma contract", () => {
    expect(
      existsSync(
        resolve(
          __dirname,
          "../prisma/migrations/20260826132000_im_message_lifecycle_policy/migration.sql"
        )
      )
    ).toBe(true);
    expect(
      existsSync(
        resolve(__dirname, "../prisma/migrations/20260826133000_im_deletion_sync/migration.sql")
      )
    ).toBe(true);
    expect(
      existsSync(
        resolve(__dirname, "../prisma/migrations/20260826134000_group_privacy_mode/migration.sql")
      )
    ).toBe(true);
    expect(schemaSource).toContain("enum MessageRecallMode");
    expect(schemaSource).toContain("recallDeadlineAt");
    expect(schemaSource).toContain("model ImPolicy");
    expect(schemaSource).toContain("model ImDeletionSync");
    expect(schemaSource).toContain("privacyPolicyVersionAtSend");
  });

  it("always supplies message lifecycle facts in formal sends and persisted seed chats", () => {
    expect(repositorySource).toContain("recallWindowSeconds");
    expect(repositorySource).toContain("recallDeadlineAt");
    expect(seedSource).toContain("recallDeadlineAt");
    expect(seedSource).toContain("privacyPolicyVersionAtSend");
  });
});
