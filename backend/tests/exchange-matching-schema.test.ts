import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Exchange selective exact matching persistence contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260901232000_exchange_selective_exact_matching/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  const modelBlock = (name: string): string => {
    const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing model ${name}`);
    return match[1];
  };

  const enumBlock = (name: string): string => {
    const match = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing enum ${name}`);
    return match[1];
  };

  it("defines matched and closed post states plus terminal claim states", () => {
    expect(enumBlock("ExchangePostStatus")).toMatch(/MATCHED\s+@map\("matched"\)/);
    expect(enumBlock("ExchangePostStatus")).toMatch(/CLOSED\s+@map\("closed"\)/);
    expect(enumBlock("ExchangeClaimStatus")).toMatch(/MATCHED\s+@map\("matched"\)/);
    expect(enumBlock("ExchangeClaimStatus")).toMatch(/NOT_SELECTED\s+@map\("not_selected"\)/);
    expect(enumBlock("ExchangeClaimStatus")).toMatch(/MATCHING_CLOSED\s+@map\("matching_closed"\)/);
  });

  it("defines one matching aggregate per request with optimistic versioning", () => {
    const matching = modelBlock("ExchangeRequestMatching");

    expect(matching).toMatch(/exchangePostId\s+Int\s+@unique/);
    expect(matching).toMatch(/status\s+ExchangeMatchingStatus\s+@default\(OPEN\)/);
    expect(matching).toMatch(/effectiveTargetProviderCount\s+Int/);
    expect(matching).toMatch(/effectiveBudgetMaxJpy\s+Int/);
    expect(matching).toMatch(/selectedQuoteTotalJpy\s+Int\s+@default\(0\)/);
    expect(matching).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(matching).toMatch(/@@map\("exchange_request_matchings"\)/);
  });

  it("persists selected participants and the active technician reservation lock", () => {
    const participant = modelBlock("ExchangeMatchParticipant");

    expect(participant).toMatch(/exchangeClaimId\s+Int\s+@unique/);
    expect(participant).toMatch(/participantUserId\s+Int/);
    expect(participant).toMatch(/participantIdentityId\s+Int/);
    expect(participant).toMatch(/activeReservationKey\s+String\s+@unique/);
    expect(participant).toMatch(/estimatedStartsAt\s+DateTime/);
    expect(participant).toMatch(/estimatedEndsAt\s+DateTime/);
    expect(participant).toMatch(/@@map\("exchange_match_participants"\)/);
  });

  it("defines append-only matching events with sequence and idempotency uniqueness", () => {
    const event = modelBlock("ExchangeMatchEvent");

    expect(event).toMatch(/type\s+ExchangeMatchEventType/);
    expect(event).toMatch(/idempotencyKey\s+String\?\s+@unique/);
    expect(event).toMatch(/payloadFingerprint\s+String\?/);
    expect(event).toMatch(/@@unique\(\[matchingId, sequence\]/);
    expect(event).toMatch(/@@map\("exchange_match_events"\)/);
  });

  it("creates, backfills, and restricts the three matching tables", () => {
    expect(migration).toContain("CREATE TABLE `exchange_request_matchings`");
    expect(migration).toContain("CREATE TABLE `exchange_match_participants`");
    expect(migration).toContain("CREATE TABLE `exchange_match_events`");
    expect(migration).toContain("INSERT INTO `exchange_request_matchings`");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE RESTRICT");
    expect(migration).toContain("exchange_match_participants_exactly_one_service_ref");
    expect(migration).toContain("exchange_match_events_idempotency_pair");
    expect(migration).not.toMatch(/ON DELETE CASCADE/);
  });
});
