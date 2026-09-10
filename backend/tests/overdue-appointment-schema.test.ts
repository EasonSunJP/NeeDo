import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260911160000_overdue_appointment_gate/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

const modelBlock = (name: string): string => {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`missing model ${name}`);
  return match[1];
};

describe("overdue appointment persistence", () => {
  it("stores one immutable participant resolution per booking order", () => {
    const block = modelBlock("OrderOverdueResolution");

    expect(block).toContain("bookingOrderId");
    expect(block).toContain("resolution");
    expect(block).toContain("resolvedByUserId");
    expect(block).toContain("resolvedByIdentityId");
    expect(block).toContain("idempotencyKey");
    expect(block).toContain("requestFingerprint");
    expect(block).toContain("version");
    expect(block).toContain("serviceNameSnapshot");
    expect(block).toContain("startsAtSnapshot");
    expect(block).toContain("endsAtSnapshot");
    expect(block).toContain("systemReviewId");
    expect(block).toContain('@unique(map: "order_overdue_resolutions_booking_order_key")');
    expect(block).toContain('@unique(map: "order_overdue_resolutions_idempotency_key_key")');
  });

  it("distinguishes immutable system ratings from participant reviews", () => {
    const review = modelBlock("OrderReview");

    expect(review).toContain("authorType");
    expect(review).toContain("reviewerUserId      Int?");
    expect(review).toContain("systemSourceKey");
    expect(review).toContain("@@unique([bookingOrderId, targetType, systemSourceKey]");
  });

  it("uses a restrictive reviewer foreign key before checking nullable system authors", () => {
    const review = modelBlock("OrderReview");
    const dropForeignKeyAt = migration.indexOf(
      "DROP FOREIGN KEY `order_reviews_reviewer_user_id_fkey`"
    );
    const addRestrictiveForeignKeyAt = migration.indexOf(
      "CONSTRAINT `order_reviews_reviewer_user_id_fkey` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT"
    );
    const addAuthorCheckAt = migration.indexOf(
      "ADD CONSTRAINT `order_reviews_author_check` CHECK"
    );

    expect(review).toContain(
      '@relation("OrderReviewReviewer", fields: [reviewerUserId], references: [id], onDelete: Restrict, onUpdate: Restrict)'
    );
    expect(dropForeignKeyAt).toBeGreaterThanOrEqual(0);
    expect(addRestrictiveForeignKeyAt).toBeGreaterThan(dropForeignKeyAt);
    expect(addAuthorCheckAt).toBeGreaterThan(addRestrictiveForeignKeyAt);
  });

  it("ships additive constraints and participant indexes", () => {
    expect(migration).toContain("CREATE TABLE `order_overdue_resolutions`");
    expect(migration).toContain("`version` INTEGER NOT NULL DEFAULT 1");
    expect(migration).toContain("ALTER TABLE `order_reviews`");
    expect(migration).toContain("`author_type`");
    expect(migration).toContain("`system_source_key`");
    expect(migration).toContain("UNIQUE INDEX `order_overdue_resolutions_booking_order_key`");
    expect(migration).toContain("CHECK (`rating` BETWEEN 0 AND 5)");
    expect(migration).toContain("FOREIGN KEY (`system_review_id`)");
  });
});
