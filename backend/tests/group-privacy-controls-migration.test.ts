import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("formal group privacy controls migration", () => {
  it("persists hidden profiles and countdown start mode instead of keeping UI-only state", () => {
    const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      resolve(
        __dirname,
        "../prisma/migrations/20260829180000_group_privacy_controls/migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("hideMemberProfiles");
    expect(schema).toContain("disappearingStartMode");
    expect(migration).toContain("hide_member_profiles");
    expect(migration).toContain("disappearing_start_mode");
  });
});
