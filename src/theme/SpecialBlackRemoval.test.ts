import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const productFiles = [
  "src/components/mobile/CategoryIcon.tsx",
  "src/components/mobile/FloatingHomeHeader.test.ts",
  "src/components/mobile/MobileShell.tsx",
  "src/components/mobile/MobileShell.test.ts",
  "src/components/mobile/OfferInfoCard.tsx",
  "src/features/settings/UnifiedSettingsPages.tsx",
  "src/features/settings/UnifiedSettingsPages.test.ts",
  "src/i18n/translations.ts",
  "src/pages/user/HomePage.tsx",
  "src/pages/user/HomePage.test.ts",
  "src/styles.css"
];

describe("special-black product removal", () => {
  it.each(productFiles)("removes special-black UI references from %s", (relativePath) => {
    const source = readFileSync(`${projectRoot}${relativePath}`, "utf8");
    expect(source).not.toMatch(/special-black|specialBlack|SpecialBlack|特殊黑/);
  });

  it("removes the dedicated component and icon directory", () => {
    expect(existsSync(`${projectRoot}src/components/mobile/SpecialBlackIcon.tsx`)).toBe(false);
    expect(existsSync(`${projectRoot}public/icons/special-black`)).toBe(false);
  });
});
