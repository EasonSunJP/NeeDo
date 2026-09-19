import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translateText } from "./translations";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("route-owned translations", () => {
  it("keeps settings copy behind the settings route boundary", async () => {
    const routeTranslations = new URL(
      "../features/settings/route-i18n.ts",
      import.meta.url
    );

    expect(existsSync(routeTranslations)).toBe(true);
    expect(read("../features/settings/UnifiedSettingsPages.tsx")).toContain(
      'import "./registerRouteI18n";'
    );
    expect(read("./translations.ts")).not.toContain(
      '"只显示运营后台已发布的当前语言版本。"'
    );

    await import("../features/settings/registerRouteI18n");
    expect(translateText("只显示运营后台已发布的当前语言版本。", "ja")).toBe(
      "運営管理で公開された現在の言語版のみを表示します。"
    );
  });

  it("registers social copy only when a social route module is requested", async () => {
    const routeTranslations = new URL(
      "../features/social/route-i18n.ts",
      import.meta.url
    );

    expect(existsSync(routeTranslations)).toBe(true);
    expect(read("../features/social/route-pages.tsx")).toContain(
      'import("./registerRouteI18n")'
    );
    expect(read("./translations.ts")).not.toContain(
      '"没有匹配的联系人。"'
    );

    await import("../features/social/registerRouteI18n");
    expect(translateText("没有匹配的联系人。", "ja")).toBe(
      "一致する連絡先はありません。"
    );
  });
});
