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
});
