import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260831160000_im_chat_records_translation/migration.sql"),
  "utf8"
);

it.each(["message:forward", "message:favorite", "message:translate"])(
  "deploys %s to every realtime user role",
  (permission) => {
    expect(migration).toContain(`'${permission}'`);
    expect(migration).toContain("'admin', 'merchant_owner', 'merchant_staff', 'technician', 'customer'");
  }
);
