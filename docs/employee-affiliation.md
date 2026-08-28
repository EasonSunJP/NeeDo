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
PATCH /api/v1/merchant-admin/employees/:needoId/profile
PUT /api/v1/merchant-admin/employees/:needoId/affiliation
```

- 列表支持 `page`、`pageSize`、`keyword`、`relationshipType`、`workStatus`。
- path 中的 `needoId` 只接受技师 `s##########`。
- 客户端不允许传 `shopId`；店铺只取自 JWT 当前 `shop` identity scope。
- 未从属当前店铺、错误类别公开号和不存在的目标使用相同安全 404，不能借错误差异枚举其他店铺员工。
- response 中的内部主键仅供服务关联，前端不得把它显示成“档案号”或“账号”；用户可见账号只有技师 NeeDoID。
- `PATCH .../profile` 只允许修改 `displayName`、`bio`、`city`、`serviceArea`、`yearsExperience`；邮箱、手机号码、头像、账号状态、档案验证状态和 NeeDoID 在本步骤保持只读。
- 基础资料写入前再次确认员工仍从属 JWT 当前店铺，写入与读取均不接受客户端 `shopId`。

权限：

- `merchant-admin:employee-affiliation:read`
- `merchant-admin:employee-affiliation:write`

默认分配给 `merchant_owner` 与 `merchant_staff`。客户、技师、平台财务、客服不获得这两个店铺从属权限。后续薪酬、结账周期和人工支付登记使用独立财务权限，不由本权限隐式授权。

审计 action：

- `merchant_admin.employee_affiliation.list`
- `merchant_admin.employee_affiliation.read`
- `merchant_admin.employee_affiliation.update`
- `merchant_admin.employee_profile.update`

审计 metadata 只记录店铺 ID、关系类别、状态或经过排序的变更字段名，不写姓名、邮箱、电话、字段值或完整 NeeDoID。

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

## 商户员工详细信息卡

商户后台“人员与顾客 / 员工列表”现已完成正式切换：

1. 列表、搜索和详情只使用 `/merchant-admin/employees`，选中员工使用 canonical 技师 NeeDoID，不再使用可见数字档案号。
2. 抽屉名称统一为“员工详细信息卡”，顶部展示头像、姓名、NeeDoID、当前店铺、联系方式、账号状态、档案验证状态、技师分类和本店工作状态。
3. “基础信息”通过独立 `PATCH .../profile` 保存；“从属关系”继续通过审计后的 `PUT .../affiliation` 保存。
4. 保存成功后重新读取详情和服务端分页列表；服务端拒绝时保留用户草稿并显示本地化错误。
5. 商户页不再调用旧 `/merchant-admin/technicians` 的更新、审核或全局软删除能力。旧 API 和旧字段暂作为其他后台与回滚兼容层保留。
6. 当前卡片只展示已经真实接通的“基础信息”“从属关系”和“工资结算周期”；未接后端的薪资金额、分成编辑、支付确认或时间线不放置空入口。

## 店铺与员工工资结算周期

工资结算周期是薪酬金额和支付结果之外的独立正式合同。它只计算并保存“何时应结算、遇休息日如何调整”，不执行资金转账，也不把计划支付日当成已经支付。

正式 API：

```text
GET /api/v1/merchant-admin/payroll-schedule-policy
PUT /api/v1/merchant-admin/payroll-schedule-policy
GET /api/v1/merchant-admin/employees/:needoId/payroll-schedule-policy
PUT /api/v1/merchant-admin/employees/:needoId/payroll-schedule-policy
```

- 客户端不传 `shopId`；四个接口都从 JWT 当前 `shop` identity scope 取得店铺。
- 员工接口只接受 canonical 技师 NeeDoID `s##########`，并再次确认该员工当前从属本店；其他店铺员工统一安全 404。
- 店铺规则支持 `daily`、`weekly`、`monthly`。周规则保存 ISO 周一至周日 `1–7`；月规则保存 `1–31`，短月自动落到当月最后一天。
- 时区固定为 `Asia/Tokyo`。支付日若遇日本法定节假日或周末，可选择提前至前一个营业日，或顺延至下一个营业日。
- 员工规则绑定 `TechnicianShopAffiliation`，默认 `inheritShopPolicy=true`。管理员或具有财务写权限的人员可以创建员工独立覆盖，也可以恢复继承店铺规则。
- GET 返回存储规则、最终生效来源、规则版本、本期范围、自然结算日和计划支付日；前端不自行推算日期。
- 商户“门店设置”维护店铺默认规则；员工详细信息卡维护该员工在当前店铺的继承或覆盖规则。两个入口均使用服务端返回值刷新，失败时保留编辑草稿。

权限：

- 读取：`merchant-admin:payroll:read`
- 写入：`merchant-admin:payroll:write`

审计 action：

- `merchant_admin.payroll_schedule_policy.update`
- `merchant_admin.employee_payroll_schedule_override.update`

数据表和 migration：

```text
shop_payroll_schedule_policies
technician_payroll_schedule_overrides
business_calendar_dates
backend/prisma/migrations/20260829123000_employee_payroll_schedule_policy/migration.sql
```

规则采用不可变版本行；更新时归档上一 active 版本并创建下一版本。日本法定节假日来自[日本内阁府官方祝日 CSV](https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv)，本 migration 固定导入 2025–2027 共 54 条，`sourceVersion=cabinet-office-2026-08-29`。周末由纯计算层判断，不重复写入节假日表。

2026-08-29 本地 `needo_dev` 已在完整 SQL 备份后部署 migration；checker 返回 `ready=true`、`officialJapanHolidayRows=54`、`issues=[]`。规则表保持空表起步，没有为现有店铺或员工伪造默认结算规则。

## 当前未完成的后续范围

员工日程与现有统一日程系统的接入、跨店灰色锁定投影、薪资金额与分成编辑、财务人员手工登记实际支付结果和自然语言审计时间线仍分别属于后续微步骤。员工从属、资料和结算周期 API 都不执行资金转账。
