import { describe, expect, it } from "vitest";
// @ts-expect-error -- Vitest runs this source guard in Node; frontend tsconfig intentionally omits Node types.
import { readFileSync } from "node:fs";
import appSource from "../../App.tsx?raw";
import adminLoginSource from "./AdminLoginPage.tsx?raw";
import loginSource from "./LoginPage.tsx?raw";

const sourceFiles = [loginSource, adminLoginSource, appSource];
const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const splashVersionBadgeStyles = stylesSource.match(/\.needo-splash-version-badge\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

describe("login copyright copy", () => {
  it("uses LifeDance across login and splash surfaces", () => {
    sourceFiles.forEach((source) => {
      expect(source).toContain("Copyright © 2026 LifeDance. All rights reserved.");
      expect(source).not.toContain("NeeDo Co., Ltd. All rights reserved.");
    });
  });

  it("keeps splash entry loading copy minimal", () => {
    expect(appSource).toContain('const splashVersionLabel = "1.235";');
    expect(appSource).toContain('className="needo-splash-version-badge"');
    expect(appSource).toContain("ver：{splashVersionLabel}");
    expect(appSource).not.toContain("ver：2604170914");
    expect(appSource).not.toContain("正在进入当前端口。");
    expect(appSource).not.toContain("正在载入界面");
    expect(appSource).not.toContain("启动页加载中");
    expect(appSource).toContain("<NeedoPetRunningSprite />");
  });

  it("keeps the completed splash runner inside the loading area", () => {
    expect(stylesSource).toContain(".needo-splash-version-badge");
    expect(stylesSource).toContain("--needo-splash-runner-size");
    expect(stylesSource).toContain("overflow-x: hidden;");
    expect(stylesSource).toContain("calc(100% - (var(--needo-splash-runner-size) / 2))");
  });

  it("renders the splash version as plain text without a capsule frame", () => {
    expect(splashVersionBadgeStyles).not.toContain("border:");
    expect(splashVersionBadgeStyles).not.toContain("border-radius:");
    expect(splashVersionBadgeStyles).not.toContain("background:");
    expect(splashVersionBadgeStyles).not.toContain("box-shadow:");
    expect(splashVersionBadgeStyles).not.toContain("backdrop-filter:");
  });
});
