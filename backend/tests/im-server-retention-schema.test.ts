import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("IM server retention default migration", () => {
  it("publishes the 30-day default without rewriting historical message expiries", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260906110000_im_server_retention_defaults/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("`text_retention_seconds` IS NULL");
    expect(migration).toContain("2592000");
    expect(migration).toContain("`version` + 1");
    expect(migration).not.toMatch(/UPDATE\s+`messages`/iu);
  });
});
