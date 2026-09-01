import { describe, expect, it } from "vitest";
import source from "./UserDetailDrawer.tsx?raw";
import historySource from "./UserExperienceHistory.tsx?raw";

describe("formal user detail drawer", () => {
  it("shows the six required detail sections", () => {
    for (const title of ["基础信息", "会员与经验", "预约与消费", "账号、角色与权限", "用户分组", "审计记录"]) {
      expect(source).toContain(title);
    }
  });

  it("loads user and experience facts independently with permission-gated actions", () => {
    expect(source).toContain("platformUserManagementApi.getUser");
    expect(historySource).toContain("platformUserManagementApi.listExperienceEntries");
    expect(historySource).toContain("page_size: 10");
    expect(source).toContain('hasPermission("backoffice:user-membership:write")');
    expect(source).toContain('hasPermission("backoffice:user-group:write")');
  });
});
