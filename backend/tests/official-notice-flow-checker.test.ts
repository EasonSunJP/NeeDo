import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("official notice local flow checker", () => {
  it("loads the public NeeDo ID used by exact-account delivery", () => {
    const source = readFileSync(
      resolve(__dirname, "../scripts/check-official-notice-flow.ts"),
      "utf8"
    );

    expect(source).toContain(
      "select: {\n            id: true,\n            needoId: true,\n            identities:"
    );
    expect(source).toContain('needoId: { startsWith: "u" }');
    expect(source).toContain('/^u[0-9]{10}$/u.test(account.needoId)');
    expect(source).toContain("needoIds: [sender.needoId]");
  });
});
