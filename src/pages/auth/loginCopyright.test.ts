import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import adminLoginSource from "./AdminLoginPage.tsx?raw";
import loginSource from "./LoginPage.tsx?raw";

const sourceFiles = [loginSource, adminLoginSource, appSource];

describe("login copyright copy", () => {
  it("uses LifeDance across login and splash surfaces", () => {
    sourceFiles.forEach((source) => {
      expect(source).toContain("Copyright © 2026 LifeDance. All rights reserved.");
      expect(source).not.toContain("NeeDo Co., Ltd. All rights reserved.");
    });
  });

  it("keeps splash entry loading copy minimal", () => {
    expect(appSource).toContain('const splashVersionLabel = "1.001";');
    expect(appSource).not.toContain("ver：2604170914");
    expect(appSource).not.toContain("正在进入当前端口。");
    expect(appSource).not.toContain("正在载入界面");
    expect(appSource).not.toContain("启动页加载中");
    expect(appSource).toContain("<NeedoPetRunningSprite />");
  });
});
