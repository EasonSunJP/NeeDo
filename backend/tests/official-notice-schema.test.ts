import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("formal official notice Prisma schema", () => {
  const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
  const migrationPath = resolve(
    __dirname,
    "../prisma/migrations/20260902143000_official_notice_delivery/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  const modelBlock = (name: string): string => {
    const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing model ${name}`);
    return match[1];
  };

  it.each(["OfficialNotice", "OfficialNoticeTranslation", "NoticeAudience", "NoticeDelivery"])(
    "defines %s with lifecycle timestamps and soft deletion",
    (name) => {
      const model = modelBlock(name);
      expect(model).toMatch(/id\s+Int\s+@id\s+@default\(autoincrement\(\)\)/);
      expect(model).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/);
      expect(model).toMatch(/updatedAt\s+DateTime\s+@updatedAt\s+@map\("updated_at"\)/);
      expect(model).toMatch(/deletedAt\s+DateTime\?\s+@map\("deleted_at"\)/);
      expect(model).toMatch(/@@index\(\[deletedAt\]\)/);
    }
  );

  it("maps the aggregate, translation, audience snapshot, and delivery contracts", () => {
    expect(schema).toMatch(/enum OfficialNoticeLevel\s*\{/);
    expect(schema).toMatch(/enum OfficialNoticeStatus\s*\{/);
    expect(schema).toMatch(/enum OfficialNoticeAudienceType\s*\{/);
    expect(schema).toMatch(/enum NoticeDeliveryStatus\s*\{/);
    expect(modelBlock("OfficialNotice")).toMatch(
      /publicId\s+String\s+@unique[\s\S]*status\s+OfficialNoticeStatus[\s\S]*lockVersion\s+Int\s+@default\(1\)/
    );
    expect(modelBlock("OfficialNoticeTranslation")).toMatch(
      /noticeId\s+Int[\s\S]*locale\s+ContentLocale[\s\S]*blocks\s+Json[\s\S]*@@unique\(\[noticeId, locale\]\)/
    );
    expect(modelBlock("NoticeAudience")).toMatch(
      /noticeId\s+Int[\s\S]*recipientUserId\s+Int[\s\S]*recipientIdentityId\s+Int[\s\S]*snapshotNeedoId\s+String\?[\s\S]*@@unique\(\[noticeId, recipientIdentityId\]\)/
    );
    expect(modelBlock("NoticeDelivery")).toMatch(
      /audienceId\s+Int\s+@unique[\s\S]*notificationId\s+Int\?\s+@unique[\s\S]*idempotencyKey\s+String\s+@unique[\s\S]*status\s+NoticeDeliveryStatus[\s\S]*attemptCount\s+Int[\s\S]*readAt\s+DateTime\?/
    );
  });

  it("declares every required inverse relation", () => {
    const user = modelBlock("User");
    const identity = modelBlock("UserIdentity");
    const notification = modelBlock("Notification");

    for (const relation of [
      "OfficialNoticeCreatedBy",
      "OfficialNoticeUpdatedBy",
      "OfficialNoticeSubmittedBy",
      "OfficialNoticeApprovedBy",
      "OfficialNoticeCancelledBy",
      "OfficialNoticeArchivedBy",
      "NoticeAudienceRecipient",
      "NoticeDeliveryRecipient"
    ]) {
      expect(user).toContain(`@relation("${relation}")`);
    }
    expect(identity).toContain('@relation("NoticeAudienceRecipientIdentity")');
    expect(identity).toContain('@relation("NoticeDeliveryRecipientIdentity")');
    expect(notification).toMatch(/noticeDelivery\s+NoticeDelivery\?/);
  });

  it("preserves the additive physical tables, restrictive foreign keys, and short index names", () => {
    for (const table of [
      "official_notices",
      "official_notice_translations",
      "notice_audiences",
      "notice_deliveries"
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }
    expect(migration).toContain("FOREIGN KEY (`recipient_identity_id`)");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE CASCADE");
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN|INDEX)\b/i);

    const indexNames = [...migration.matchAll(/(?:UNIQUE )?INDEX `([^`]+)`/gu)].map(
      (match) => match[1]
    );
    expect(indexNames.length).toBeGreaterThan(0);
    expect(indexNames.filter((name) => name.length > 64)).toEqual([]);
    expect(modelBlock("NoticeDelivery")).toContain(
      '@@index([noticeId, status, nextAttemptAt, deletedAt], map: "notice_deliveries_dispatch_idx")'
    );
    expect(modelBlock("NoticeDelivery")).toContain(
      '@@index([recipientIdentityId, status, readAt, deletedAt], map: "notice_deliveries_inbox_idx")'
    );
  });
});
