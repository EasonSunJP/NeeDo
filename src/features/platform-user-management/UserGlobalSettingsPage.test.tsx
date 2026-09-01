import { describe, expect, it } from "vitest";
import source from "./UserGlobalSettingsPage.tsx?raw";
import campaignSource from "./NdpExperienceCampaignEditor.tsx?raw";

describe("global user policy and NDP experience campaigns", () => {
  it("separates effective policy, unsaved edits, draft and publication", () => {
    for (const text of ["要求绑定手机", "要求绑定邮箱", "上门服务必须通过 eKYC", "到店服务必须通过 eKYC", "当前生效", "未保存修改", "保存草稿", "发布"]) expect(source).toContain(text);
    expect(source).toContain("platformUserManagementApi.getGlobalSettings");
    expect(source).toContain("platformUserManagementApi.saveGlobalSettingsDraft");
    expect(source).toContain("platformUserManagementApi.publishGlobalSettings");
  });

  it("supports Japan-time scheduled multipliers and explicit 409 recovery", () => {
    expect(campaignSource).toContain("Asia/Tokyo");
    expect(campaignSource).toContain("100 NDP = 1 EXP");
    expect(campaignSource).toContain("platformUserManagementApi.saveCampaignDraft");
    expect(campaignSource).toContain("platformUserManagementApi.publishCampaign");
    expect(campaignSource).toContain("error.status === 409");
    expect(campaignSource).toContain("重新读取服务端");
    expect(campaignSource).toContain("保留本地草稿");
    expect(campaignSource).toContain("scheduled");
    expect(campaignSource).toContain("published");
  });
});
