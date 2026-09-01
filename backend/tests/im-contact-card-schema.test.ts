import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";

describe("formal IM contact-card persistence schema", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

  it("defines one formal Lv account per user instead of deriving levels from scores", () => {
    expect(schema).toMatch(/model UserExperienceAccount \{[\s\S]*?userId\s+Int[\s\S]*?currentLevel\s+Int[\s\S]*?totalExpUnits\s+BigInt[\s\S]*?@@map\("user_experience_accounts"\)/);
    expect(schema).toMatch(/userId\s+Int\s+@unique/);
  });

  it("defines a unique per-identity contact-card send command for concurrent retry safety", () => {
    const match = schema.match(/model ImContactCardSendCommand \{([\s\S]*?)\n\}/);
    expect(match?.[1]).toMatch(/messageId\s+Int/);
    expect(match?.[1]).toMatch(/idempotencyKey\s+String/);
    expect(match?.[1]).toMatch(/requestFingerprint\s+String/);
    expect(match?.[1]).toContain("@@unique([actorIdentityId, idempotencyKey])");
  });

  it("ships an additive migration with existing-customer Lv.1 backfill", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "prisma/migrations/20260901030000_im_contact_card_formalization/migration.sql"),
      "utf8"
    );
    expect(migration).toContain("CREATE TABLE `user_experience_accounts`");
    expect(migration).toContain("CREATE TABLE `im_contact_card_send_commands`");
    expect(migration).toMatch(/INSERT INTO `user_experience_accounts`[\s\S]*FROM `customer_profiles`/);
  });
});
