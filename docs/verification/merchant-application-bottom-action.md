# 店铺申请底部按钮

2026-09-07：移除店铺身份申请页“下一步”按钮外层的圆角底板、背景、边框、阴影和模糊效果。保留透明布局层的内边距、固定定位及底部安全区间距，按钮位置与点击行为保持一致。

验证命令：`npm test -- src/features/identity-applications/ApplicationPages.test.ts src/features/identity-applications/MerchantApplicationPage.test.tsx --maxWorkers=1`、`npm run lint`、`npm run build`。

银行与身份、收费规则与合同步骤统一使用无底板的悬浮操作区，上一步在左，下一步或提交在右。证件照片与法人登记资料复用展示图的主题上传控件，右侧操作文案统一为“上传图片”，左侧显示用途或所选文件名。正文保留底部滚动空间，文件仍由原有保存流程上传。

账户类型下拉菜单按普通預金、当座預金、貯蓄預金、その他排列，对应 ordinary/current/savings/other。店铺申请 API、Zod、Service 类型和 OpenAPI 同步支持四项；数据库原字段为 VARCHAR，无需 migration。联盟身份绑定不在本次修改范围。

本地 main 提交前复核：上述前端页面测试加 `i18n.test.ts` 共 42 项通过；后端 `identity-application-api.test.ts`、`protected-bank-account.service.test.ts`、`protected-bank-account.repository.test.ts` 共 22 项通过。新增账户类型先验证返回 400，再修正到接口测试通过。实现阶段前端 lint/build、修改范围后端 ESLint 与后端 build 通过。本记录不代表真实银行验证或生产部署。
