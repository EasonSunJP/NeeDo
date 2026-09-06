# Step 12 — 分组抽屉、账号日志与动态

## 实现范围

- [x] 运营成员分组提供“添加运营成员”，后台生成官方 `needo` + 10 位标识。
- [x] 正式创建 API 校验字段、双权限与全局平台身份；bcrypt 12；事务创建账号、身份、标识、operator 角色及审计。原因必填，响应和审计不包含密码。
- [x] 所有分组成员增加统一用户详情入口，关闭详情后保留分组和页码。
- [x] 共享 Drawer 显式清零外边距，避免父级 space-y 样式使遮罩顶部留下 20px 空隙，覆盖运营与商户后台。
- [x] 技师时间线复用账号 LOG 与日期查询，不展示利用详细列表；用户日志同样支持全部、近 7/30 天、本周、本月、今年和自定义日期。
- [x] 后端以真实 User.createdAt 投影账号生成首条记录，纳入日期区间、总数和分页。其余审计保持新近顺序，不写入虚构审计记录。
- [x] 用户及技师详情增加“动态”插页，读取该账号正式发布内容，展示文本、图片、视频与分页。
- [x] 补齐后台专用只读日志/动态接口，保留商户店铺隔离及原有 Social 可见性。

## API 与权限

- `POST /api/v1/users/operations-members`：`user:create` 与 `user:assign-role`，当前身份必须为 global platform。
- `GET /api/v1/{backoffice|merchant-admin}/technicians/:id/user-log`：对应技师读取权限；id 是技师资料 ID，后台解析关联账号。
- `GET /api/v1/{backoffice|merchant-admin}/{users|technicians}/:id/posts`：对应用户/技师目录读取权限，作者固定为已授权对象。分页只允许 page/pageSize，拒绝任意 authorUserId/shopId 覆盖。
- managed-user 详情与技师 LOG 使用 `audit_page`、`audit_page_size`、成对的 `audit_from`/`audit_to`。UTC 区间为左闭右开；前端按浏览器本地日历转换。
- 商户技师按 profile.shopId 授权，无需具备客户订单；商户用户仍要求本店客户订单。商户审计只返回本店相关记录。
- 动态仍使用现有 public/own/followed 可见性规则。没有新增 Social 发布、互动或查看私密内容的权限。

## 验证（2026-09-07）

- 前端 27 个文件 / 120 项测试通过，涵盖抽屉外边距回归、创建交互、分组详情回退、日志日期、动态作者与分页。
- 后端 12 个测试套件 / 69 项通过，涵盖验证、授权、跨店拒绝、日期边界、首条记录跨页、OpenAPI。
- `npm run lint`、`npm --prefix backend run lint`、`npm --prefix backend run build`、`npm run build -- --mode formal` 通过。
- `backend/scripts/check-operations-member-transaction.ts` 在真实本地 MySQL 事务验证账号/官方标识/角色/密码哈希/审计/分组归属及重复邮箱 409，整体回滚不保留 QA 账号。
- 独立只读代码复查发现的商户技师日志、operator 动态权限、生日日期过滤问题均修复并复查闭合。
- 正式构建保留仓库已有的大体积 bundle 与 Zod 注释警告。

## 交付边界

隔离工作树 `.worktrees/operations-member-drawers`，分支 `codex/operations-member-drawers`，基于 `79b19471`。无 schema 变更、无 migration。本次收尾仅提交独立分支并在共享 main 干净、可用时本地集成；不上传远端、不部署 staging 或生产。staging 登录后的浏览器验收仍待发布后执行。现有本地其他工作树的服务没有重启或替换。
