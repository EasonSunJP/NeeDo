import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import {
  affiliateAllianceTranslations,
  translateAffiliateAllianceText
} from "./i18n";

const workflowKeys = [
  "联盟营销",
  "我的联盟身份",
  "我的权限",
  "合作伙伴",
  "下级成员",
  "成员名单",
  "成员数据读取失败",
  "重试成员名单",
  "暂无成员",
  "上级",
  "加入时间",
  "邀请成员",
  "在双方已互为联系人且均已开通联盟营销身份的账号中选择。",
  "搜索NeeDo用户ID或姓名",
  "候选账号读取失败",
  "重试候选账号",
  "没有符合条件的联系人",
  "选择",
  "邀请角色",
  "指定上级",
  "请选择所有者或合作伙伴",
  "已选择",
  "发送邀请",
  "发送中",
  "邀请已发送",
  "邀请发送失败",
  "发出的邀请",
  "邀请记录读取失败",
  "重试邀请记录",
  "暂无邀请记录",
  "等待回应",
  "已接受",
  "已拒绝",
  "已过期",
  "邀请对象",
  "到期时间",
  "收到的邀请",
  "你可以先处理邀请，再决定是否创建自己的联盟。",
  "收到的邀请读取失败",
  "重试收到的邀请",
  "暂无待处理邀请",
  "邀请方",
  "接受邀请",
  "拒绝邀请",
  "处理中",
  "邀请已接受",
  "邀请已拒绝",
  "上一页",
  "下一页",
  "当前页",
  "状态冲突，请刷新后重试",
  "邀请已过期",
  "没有权限执行此操作",
  "操作失败，请稍后重试"
] as const;

describe("affiliate alliance scoped translations", () => {
  it.each(workflowKeys)("provides all five languages for %s", (source) => {
    expect(source.trim()).not.toBe("");
    expect(affiliateAllianceTranslations[source]).toBeDefined();
    for (const language of ["zh", "zh-Hant", "ja", "en", "ko"] as const) {
      expect(translateAffiliateAllianceText(source, language).trim()).not.toBe("");
    }
  });

  it("does not override unrelated global generic words", () => {
    expect(affiliateAllianceTranslations).not.toHaveProperty("保存");
    expect(translateAffiliateAllianceText("保存", "ja")).toBe(translateText("保存", "ja"));
  });
});
