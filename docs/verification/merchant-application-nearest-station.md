# 店铺申请最近车站

2026-09-07：在申请页基础信息的店铺地址后补充“最近车站”和“交通说明”两个选填字段。车站最多 160 字符，交通说明最多 255 字符，便于填写线路、出口、步行时间和路线。

字段以 `showcaseDraft.nearestStation`、`showcaseDraft.stationAccess` 通过现有正式申请创建/更新接口保存到数据库 JSON。重新打开草稿、eKYC 返回和待审核只读详情均保留并展示它们。旧草稿缺少字段时按空值显示；创建和更新接口校验字段类型、长度并去除两端空格，OpenAPI 同步记录约束。

申请预览显式使用本次填写的数据，不再读取行业示例车站、交通、简介、收藏数或优惠。交通摘要直接显示申请人填写的说明，未填写则显示“未填写”，不使用旧模板的估算行程。既有正式店铺页面的交通模式不变。

此微步骤覆盖申请资料填写、保存和预览。没有新增数据库字段或 migration，也未修改审核批准后的 Shop 资料发布映射。

验证：前端 `MerchantApplicationPage.test.tsx`、`formModel.test.ts`、`ApplicationPages.test.ts`、`i18n.test.ts`；后端 `merchant-station-draft.validator.test.ts`、`identity-application-api.test.ts`、`identity-application-repository.test.ts`。先复现缺少输入与未校验字段的失败，再验证草稿恢复、eKYC 往返、预览和保存，以及新旧草稿兼容。

2026-09-07 追加：最近车站行在手机与桌面均分为两栏，左侧车站，右侧到店时间。时间为选填的非负整数，单位固定显示“分钟”，以 `showcaseDraft.stationTravelMinutes` 的数字或 null 保存；全角数字规范化，Zod/OpenAPI 同步约束。分钟数优先显示在预览的交通摘要与最近车站行，原交通说明仍保留为路线说明；旧草稿无分钟字段时仍兼容原文字。
