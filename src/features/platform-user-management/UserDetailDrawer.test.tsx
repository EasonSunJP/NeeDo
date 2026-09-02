import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import source from "./UserDetailDrawer.tsx?raw";
import historySource from "./UserExperienceHistory.tsx?raw";

describe("formal user detail drawer", () => {
  it("localizes formal platform partner marker labels", () => {
    expect(translateText("标记为代理商", "ja")).toBe("代理店として設定");
    expect(translateText("标记为加盟商", "en")).toBe("Mark as franchisee");
    expect(translateText("标记为供货商", "ko")).toBe("공급업체로 지정");
  });

  it("shows the six required detail sections", () => {
    for (const title of ["基础信息", "平台合作方标记", "会员与经验", "预约与消费", "账号、角色与权限", "用户分组", "审计记录"]) {
      expect(source).toContain(title);
    }
  });

  it("marks an existing formal user as each supported partner type with evidence", () => {
    expect(source).toContain("platformPartnersApi.markPartnerProfile");
    expect(source).toContain('hasPermission("backoffice:partner-profile:write")');
    expect(source).toContain('markPartner("agent")');
    expect(source).toContain('markPartner("franchisee")');
    expect(source).toContain('markPartner("supplier")');
    expect(source.match(/TEST/g)).toHaveLength(2);
    expect(source).toContain("生效时间");
    expect(source).toContain("标记理由");
  });

  it("loads user and experience facts independently with permission-gated actions", () => {
    expect(source).toContain(".getUser(userId)");
    expect(historySource).toContain("platformUserManagementApi.listExperienceEntries");
    expect(historySource).toContain("page_size: 10");
    expect(source).toContain('hasPermission("backoffice:user-membership:write")');
    expect(source).toContain('hasPermission("backoffice:user-group:write")');
  });
});
