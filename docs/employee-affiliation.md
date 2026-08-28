# 员工—店铺从属关系正式地基

## 当前权威边界

NeeDo 的员工身份链路为：

```text
User
  → active UserIdentity(type=technician)
  → active PublicIdentifier(kind=S)
  → one global TechnicianProfile
  → one or more TechnicianShopAffiliation
```

- `TechnicianProfile` 是全局唯一的技师资料，不因从属多个店铺而复制。
- 员工对外账号只使用 canonical `s` 加十位数字的技师 NeeDoID。
- `TechnicianShopAffiliation` 是新员工 API 的店铺关系权威。
- `TechnicianProfile.shopId`、`employmentType`、`employmentStartedAt` 暂时保留为旧页面兼容与回滚来源；新员工 API 不从这些字段判断当前从属。
- `TechnicianProfile.status` 表示资料发布状态；`TechnicianShopAffiliation.workStatus` 表示本店在职/合作状态，两者不能互换。

## 关系与状态

`relationshipType`：

- `exclusive`：专属技师。只能有一个当前店铺关系。
- `partner`：合作技师或临时工。允许同时从属多个店铺，但不能与任一当前专属关系共存。

`workStatus`：

- `active`、`on_leave`、`suspended` 均属于当前关系。
- `ended` 为历史关系，不再出现在当前员工列表。
- 当前关系的 `activeKey` 固定为 `technician:<technicianProfileId>:shop:<shopId>`。
- 结束关系时只把状态改为 `ended`、记录 `endsAt` 并清空 `activeKey`；不得删除历史行。

创建或切换专属/合作关系时，仓库在数据库事务内对全局 `technician_profiles.id` 执行 `FOR UPDATE`，随后读取全部当前从属并检查互斥规则。相同技师/店铺的当前行还受唯一 `activeKey` 约束。

## 正式 API、作用域与权限

```text
GET /api/v1/merchant-admin/employees
GET /api/v1/merchant-admin/employees/:needoId
PUT /api/v1/merchant-admin/employees/:needoId/affiliation
```

- 列表支持 `page`、`pageSize`、`keyword`、`relationshipType`、`workStatus`。
- path 中的 `needoId` 只接受技师 `s##########`。
- 客户端不允许传 `shopId`；店铺只取自 JWT 当前 `shop` identity scope。
- 未从属当前店铺、错误类别公开号和不存在的目标使用相同安全 404，不能借错误差异枚举其他店铺员工。
- response 中的内部主键仅供服务关联，前端不得把它显示成“档案号”或“账号”；用户可见账号只有技师 NeeDoID。

权限：

- `merchant-admin:employee-affiliation:read`
- `merchant-admin:employee-affiliation:write`

默认分配给 `merchant_owner` 与 `merchant_staff`。客户、技师、平台财务、客服不获得这两个店铺从属权限。后续薪酬、结账周期和人工支付登记使用独立财务权限，不由本权限隐式授权。

审计 action：

- `merchant_admin.employee_affiliation.list`
- `merchant_admin.employee_affiliation.read`
- `merchant_admin.employee_affiliation.update`

审计 metadata 只记录店铺 ID、关系类别和状态，不写姓名、邮箱、电话或完整 NeeDoID。

## Migration 与回填

Migration：

```text
backend/prisma/migrations/20260828100000_technician_shop_affiliation_foundation/migration.sql
```

它只新增枚举、`technician_shop_affiliations` 表、索引和外键，不删除或改写旧技师字段。

在非生产本地数据库执行前，必须先创建可恢复备份。生产或共享环境还需要该环境自己的变更审批与备份流程，不能直接照搬本地命令。

```bash
cd backend
ENV_FILE=.env.dev npm run prisma:status -- --schema prisma/schema.prisma
ENV_FILE=.env.dev npm run prisma:migrate:deploy -- --schema prisma/schema.prisma
ENV_FILE=.env.dev npm run prisma:status -- --schema prisma/schema.prisma
```

回填默认是 dry-run：

```bash
cd backend
ENV_FILE=.env.dev npm run check:unified-identifier-cutover -- --batch-size=100
ENV_FILE=.env.dev npm run backfill:technician-shop-affiliations -- --mode=dry-run --batch-size=100
```

映射规则：

- legacy `FULL_TIME` → `exclusive`
- legacy `TEMPORARY` → `partner`
- legacy `INDEPENDENT` 只有在同店存在未删除的 `TechnicianService`、`Service`、`BookingOrder`、`ScheduleSlot` 或 active `TechnicianCompensationProfile` 证据时，才映射为 `partner`
- `shopId=null` 的全局档案跳过
- 私有、没有任何服务证据、同时持有同店商户身份的技师档案属于模拟/测试账号多身份切换资料，不是员工，单独计入 `skippedNonEmployeeProfiles` 并跳过

问题代码：

- `TECHNICIAN_PUBLIC_ID_MISSING`
- `TECHNICIAN_PUBLIC_ID_AMBIGUOUS`
- `SHOP_NOT_ACTIVE`
- `INDEPENDENT_RELATION_UNVERIFIED`
- `AFFILIATION_MISMATCH`
- `EXCLUSIVE_CONFLICT`

任何问题都会在写入前 fail closed。不得为了让报告变绿而猜测独立技师的店铺关系。dry-run 干净且备份存在后，才可执行：

```bash
cd backend
ENV_FILE=.env.dev npm run backfill:technician-shop-affiliations -- --mode=apply --batch-size=100
ENV_FILE=.env.dev npm run check:technician-shop-affiliation-cutover -- --batch-size=100
```

最终 checker 必须同时满足：

- `ready=true`
- `unifiedIdentifiersReady=true`
- `issues=[]`
- `pendingOperations=0`

2026-08-28 本地 `needo_dev` 验证结果：migration 已应用；121 条真实从属已创建；121 条已覆盖；2 条无店铺档案与 10 条非员工多身份切换档案被跳过；最终问题和待处理数均为 0。

## 回滚

- 代码回滚后，旧页面仍可继续读取保留的 legacy 字段。
- 新表和回填行是加法数据；回滚应用代码时可以停止读取它们。
- 回滚不包括删除从属历史、清空表或回改旧字段。
- 需要恢复本地数据库时，应使用执行 migration 前生成并校验过的完整 SQL 备份；共享/生产环境按其正式恢复流程处理。
- 不得手改已应用 migration。

## 当前未完成的后续范围

现有 `/merchant-admin/technicians` 页面和旧商户技师写路径仍是兼容层，尚未切换。下一个独立微步骤才会：

1. 将“技师正式档案”切换为“员工详细信息卡”；
2. 使用 `/merchant-admin/employees` 读取顶部身份和从属；
3. 移除可见内部档案号/账号号；
4. 接通真实基础资料编辑；
5. 完成浏览器验收后再退役旧商户雇佣写路径。

日程脱敏投影、薪酬与分成、结账周期、日本法定节假日顺延规则、财务手工支付登记和自然语言动态时间线仍分别属于后续微步骤。本地员工从属 API 不执行自动转账。
