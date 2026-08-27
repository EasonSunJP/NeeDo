# LifeDance 超级管理员与正式经营数据样本设计

**日期：** 2026-08-27

**状态：** 书面规格已获用户批准，等待按微步骤实施

**适用环境：** NeeDo 本地与测试环境；禁止生产执行

## 1. 背景

本地正式数据库已经包含 Prisma/MySQL 持久化的店铺、技师、客户、排班、预约、订单状态历史、订单财务、联系人、会话和消息。2026-08-27 的只读核验确认：

- 旧超级管理员为 `admin@example.com`，用户 ID 为 `1`，NeeDoID 为 `n0000000001`。
- 旧超级管理员只有 `platform` 与 `customer` 身份。
- 技师账号 `sim.tech.001@needo.local` 至 `sim.tech.020@needo.local` 已存在，每人当前有 78 个排班时段和 16–20 笔预约。
- 本地三个月数据有 1,801 笔预约订单，其中 1,214 笔已产生订单财务记录。
- 正式 IM 表中有 213 个会话、869 条消息和 424 个联系人关系。
- 工资结算目前只存在 1 个 PayRun 与 1 份 Payslip，没有覆盖技师 1–20。
- “正社员 / 临时工”目前由移动商户端根据前端字段或列表顺序推算，不是正式数据库字段。

因此，本设计不新增演示 API、浏览器假数据或第二套业务模型，而是在现有正式账号、身份、店铺、IM、Booking、OrderFinancial 和 Payroll 边界内，建立一个可重复生成、可逐单追账、可结算、可跨端验收的本地正式经营样本。

## 2. “真实数据”的定义

本任务中的真实数据必须同时满足以下条件：

1. 数据写入正式 Prisma/MySQL 表，由现有 `/api/v1/` 接口读取。
2. 登录使用正式 Auth、JWT、Refresh Token、RBAC 与身份切换。
3. 联系人、会话、消息、排班、预约、付款、订单财务、工资单和付款记录刷新后仍存在。
4. 每个订单、收入与工资明细之间存在可验证的外键或业务键关系。
5. 所有数据生成过程可幂等重跑，并且只清理本数据集命名空间内的记录。
6. 正式页面在数据缺失或 API 失败时显示真实错误，不回退到 mock 或 localStorage。

人物姓名、工作对话、店铺经营和客户场景使用逼真的合成内容，以避免冒用真实个人资料。合成仅描述内容来源，不改变其正式数据库持久化和正式 API 边界。

## 3. 目标

### 3.1 超级管理员账号

- 正式登录邮箱为 `admin@lifedance.com`。
- 用户指定的本地测试密码为 `needotest`。
- 用户 ID `1`、NeeDoID `n0000000001`、审计历史和既有关联保持不变。
- `admin@example.com` 不再对应任何可登录的活动账号。
- 邮箱或密码变化后撤销该用户全部 Refresh Token、推进 session generation，并使旧 Access Token 在正式会话检查中失效。
- 密码只从未跟踪的本地环境变量传入并以 bcrypt cost 12 保存，禁止写入源码、提交文件、日志、账号导出和测试快照。
- `needotest` 不符合生产密码强度要求，因此该密码只能用于本地正式测试库，不能部署为生产管理员密码。

### 3.2 同一账号跨端身份

管理员账号拥有以下正式活动身份与作用域：

| 入口 | 身份 | 作用域 |
|---|---|---|
| 运营后台 | `platform` | `global` |
| 用户端 | `customer` | 管理员自己的 `customer_profile` |
| 商户后台 | `merchant_owner` | LifeDance 店铺 |
| 店铺端 | `merchant_owner` | 同一个 LifeDance 店铺 |
| 技师端 | `technician` | 管理员自己的私有 `technician_profile` |
| 联盟营销 | `scout` | `global` |

管理员的技师档案状态为 `private`，只用于技师端功能验收，不进入公开搜索、不占用店铺 1–20 的正式员工数量，也不承接客户预约。

### 3.3 店铺与人员

- 正式经营样本店铺名称为 `LifeDance Wellness 渋谷`。
- 店铺使用真实 Shop、MerchantAccount、MerchantShopMembership、商户身份和角色记录。
- 店铺在本地正式数据中处于 `published`，拥有地址、城市、电话、简介、服务项目和正式预约库存。
- 技师 1–20 使用既有正式账号和 NeeDoID，不复制为第二批账号。
- 技师 1–10 为 `FULL_TIME`，界面显示“正社员”。
- 技师 11–20 为 `TEMPORARY`，界面显示“临时工”。
- 其他技师使用 `INDEPENDENT`、`FULL_TIME` 或 `TEMPORARY` 的明确数据库值，不再由数组下标或展示标签推断。

## 4. 数据模型设计

### 4.1 正式雇佣类型

在 Prisma 中新增：

```prisma
enum TechnicianEmploymentType {
  INDEPENDENT
  FULL_TIME
  TEMPORARY
}
```

在 `TechnicianProfile` 中新增：

```prisma
employmentType      TechnicianEmploymentType @default(INDEPENDENT) @map("employment_type")
employmentStartedAt DateTime?                @map("employment_started_at")
```

当前业务模型规定一个技师档案只绑定一个当前店铺，因此雇佣类型与当前 `shopId` 保持在同一档案中是本微步骤的最小正式设计。店铺变更必须在同一事务中更新 `shopId`、`employmentType`、`employmentStartedAt`、相应身份作用域和审计记录。

本任务不引入多店同时雇佣，也不建立与当前单店技师模型并行的 Membership 表。

### 4.2 API 与前端契约

- 商户和运营技师列表、详情 DTO 返回 `employmentType` 与 `employmentStartedAt`。
- OpenAPI 将 `employmentType` 限定为 `independent | full_time | temporary`。
- 商户员工列表直接使用 API 字段显示“独立技师 / 正社员 / 临时工”。
- 正式模式删除 `getMerchantStaffEmploymentType` 的列表下标推算路径。
- 静态演示模式可保留原有兼容数据，但不得影响正式会话。
- 受保护的技师更新接口允许在既有商户作用域和 RBAC 下修改雇佣类型，并写审计日志。

### 4.3 管理员账号原位迁移

User Management seed 在事务中执行以下确定性规则：

1. 查找 `admin@lifedance.com` 与受支持的旧管理员邮箱。
2. 如果仅存在旧管理员，则原位更新同一 User 行的邮箱、用户名、密码 Hash、验证时间、活动状态和 session generation。
3. 如果仅存在新邮箱，则幂等更新该账号。
4. 如果新旧邮箱分别属于两个不同的活动用户，则拒绝 seed 并报告稳定冲突，禁止自动合并审计历史。
5. 重建管理员所需身份、角色与作用域，但不删除其他运营人员。
6. seed 完成后撤销管理员 Redis Refresh Token 索引和相关 Auth/RBAC 缓存。

管理员展示名统一为 `LifeDance 管理员`；登录标识仍是 verified email 或 immutable NeeDoID，不开放可编辑用户名登录。

## 5. 正式经营数据集

### 5.1 环境门禁

数据生成继续复用现有正式三个月 seed 入口，并保留以下硬门禁：

- 必须显式设置 `ALLOW_SIMULATION_SEED=true`。
- `NODE_ENV` 不得为 production。
- `DEPLOY_ENV` 只能为 local 或 test。
- MySQL 主机只能是 localhost、127.0.0.1 或 ::1。
- 数据库名不能包含 prod 或 production。
- 数据密码必须来自 `SIMULATION_DEFAULT_PASSWORD` 或 `TEST_USER_DEFAULT_PASSWORD`。

visible 文案、店铺简介、订单备注、消息和通知中不得出现“demo”“mock”“Simulation booking”等演示标签。内部 metadata 可使用稳定命名空间 `lifedance_real_ops_v1`，用于幂等重建和精确清理。

### 5.2 店铺与技师重新归属

- 将现有第一家三个月经营店铺原位更新为 `LifeDance Wellness 渋谷`，并把管理员设为 owner。
- 技师 1–20 绑定到该店铺；1–10 为正社员，11–20 为临时工。
- 技师 21–100 在剩余九家店铺间确定性均衡分配，每家 8–9 人，避免生成空店铺。
- 原店铺、技师、服务、排班、预约和财务之间的 shopId 必须由同一份 plan 生成，禁止在 seed 后用零散 SQL 改外键。
- 管理员自己的私有技师档案单独创建，不进入客户可预约服务和公开员工计数。

### 5.3 服务与排班

LifeDance 店铺至少有三种正式服务：门店 60 分钟、上门 90 分钟和头部护理 45 分钟。每位技师至少绑定一个可预约 TechnicianService。

时间范围为 2026-06-01 至 2026-08-31，业务时区为 Asia/Tokyo：

- 每位技师至少 26 个正式 Availability 与 ScheduleSlot。
- 每位技师均有历史、当日和未来时段。
- 排班无同技师重叠。
- 已预约时段与 BookingOrder 一一对应。
- 取消订单释放库存；已确认、服务中和已完成订单占用库存。

### 5.4 预约、履约和付款

技师 1–20 每人至少满足：

- 12 笔预约订单；
- 6 笔已完成订单；
- 至少 1 笔未来已确认订单；
- 数据集整体包含 pending、confirmed、in_service、completed 和 cancelled 状态。

每笔订单具有：

- 正式 orderNo，外观与现有正式订单编号一致；
- 客户、店铺、服务、技师、排班时段；
- 创建、预约开始和结束时间；
- 完整 OrderStatusHistory；
- 服务模式、价格和服务快照；
- 与状态一致的支付字段。

只有已完成订单产生确认收入。取消、待确认、已确认和服务中订单不能伪造已实现收入。

## 6. 通讯录与工作聊天

### 6.1 组织通讯录

- 商户身份下的组织目录继续由 `GET /api/v1/merchant-admin/technicians?status=published` 提供。
- 返回的 20 名员工必须全部属于管理员当前店铺，并显示正式 employmentType。
- 组织目录是店铺组织关系，不用联系人关系替代。

### 6.2 正式联系人与会话

管理员与技师 1–20 建立：

- 双向 Contact 记录；
- 20 个 DIRECT Conversation；
- 每个会话两名活动 ConversationParticipant；
- 每个会话 8–12 条跨三个月的 Message；
- 双方均有发言，时间顺序严格递增；
- 合理的 unread、lastRead、pin 或 mute 状态分布。

消息内容使用自然日语工作场景，覆盖：

- 下周排班确认；
- 临时替班与请假；
- 到店或上门服务前确认；
- 客户注意事项；
- 迟到和交通说明；
- 用品补充；
- 完单确认；
- 工资单和付款确认。

消息写入正式 `messages` 表，metadata 只记录内部数据集命名空间和稳定 message key。正式 IM 页面必须通过 REST/SSE 数据源读取，刷新和重新登录后仍可见。

## 7. 收入、工资与结算

### 7.1 订单财务

每笔已完成订单必须存在唯一 OrderFinancial：

- `serviceIncomeStatus = confirmed`；
- 服务金额与 BookingOrder 价格一致；
- 付款渠道为现场现金或线下刷卡；
- 记录平台费、用户奖励、收入确认人和确认时间；
- `settlementStatus` 能被 PayrollRepository 读取；
- money timeline 能解释收入与平台费。

每笔非完成订单不得创建已确认收入记录。

### 7.2 计薪规则

技师 1–10 使用 `base_plus_commission`：

- 月基础工资：230,000 JPY；
- 订单提成：20%；
- 店铺承担平台 NDP 费用。

技师 11–20 使用 `hourly`：

- 时薪：1,500 JPY；
- 工时从已完成订单的服务分钟数计算；
- 店铺承担平台 NDP 费用。

每名技师有独立、有效期明确的 TechnicianCompensationProfile。收入预览和工资生成必须通过现有 CompensationEngine 与 PayrollService 口径，不在 seed 中复制第二套计算公式。

### 7.3 三个月工资数据

为 LifeDance 店铺生成 2026-06、2026-07、2026-08 三个 PayRun：

- 每个 PayRun 覆盖 20 名员工，共 60 份 Payslip。
- 每个已完成订单在所属月份的工资单中有 sourceType=`order` 的 PayslipLine。
- 同一订单不能进入两个工资周期。
- 六月、七月 PayRun 为 `paid`，有完整 PayoutRecord 和技师确认时间。
- 八月 PayRun 为 `approved` 或 `scheduled`，保留 unpaidAmount，展示当前可支付状态。
- PayRun 汇总必须等于其 Payslip 汇总；Payslip 净额必须等于各工资行加总。
- 已纳入关闭工资周期的 OrderFinancial 更新为已结算状态；八月未付款部分保持可追踪的待结算状态。

## 8. 幂等、清理与错误处理

- 生成器使用稳定 email、activeKey、orderNo、conversation key、message key、pay period 和 namespace。
- 重跑时更新同一账号与主记录，先按 namespace 精确删除或软删除依赖记录，再按外键顺序重建。
- 清理顺序覆盖 MessageReaction、Message、ConversationParticipant、Conversation、Contact、PayoutRecord、PayslipLine、Payslip、PayRun、OrderFinancial、OrderStatusHistory、BookingOrder、ScheduleSlot 和 Availability。
- 不使用 `deleteMany({})`、宽泛邮箱前缀或无命名空间清理其他本地业务数据。
- 事务失败时回滚本次数据集写入，不留下部分工资、孤立会话或不一致订单。
- 旧管理员和新管理员冲突、技师账号缺失、角色缺失、服务缺失、订单财务不完整、工资总额不平或远程/生产数据库都会使命令失败。

## 9. 分阶段微步骤

### 微步骤 A：雇佣类型正式化

- Prisma enum、字段和 migration。
- Repository、Service、Zod、OpenAPI、API DTO 与审计。
- 商户正式员工列表读取 persisted employmentType。
- 先写失败测试，覆盖正社员、临时工、独立技师和跨店拒绝。

### 微步骤 B：管理员账号与跨端身份

- 管理员原位邮箱迁移、密码 Hash 更新和 session 撤销。
- LifeDance Shop、MerchantAccount、Membership 与五类业务身份。
- 旧邮箱登录失败、新邮箱通过正式登录和 identity switch。

### 微步骤 C：LifeDance 经营数据重建

- 技师 1–20 归属、服务、排班、预约、状态历史、付款和订单财务。
- 技师 21–100 均衡到其余店铺。
- 更新正式数据 checker，验证每名技师和每笔订单。

### 微步骤 D：店内通讯录与工作聊天

- 组织目录、双向联系人、20 个直接会话和自然工作消息。
- 正式 IM API、刷新持久化和跨店隔离验收。

### 微步骤 E：收入与工资结算

- 20 个计薪档案、3 个 PayRun、60 份 Payslip、逐单工资行与付款记录。
- 商户、技师和运营三侧读取与 CSV/明细校验。

每个微步骤独立运行测试、lint、类型检查和相关数据库 checker。前一步未通过不得进入下一步。

## 10. 验收矩阵

### 10.1 自动化验收

- 管理员旧邮箱登录返回统一 invalid credentials。
- `admin@lifedance.com` 使用用户指定密码登录成功。
- `/auth/me` 返回 platform、customer、merchant_owner、technician、scout 身份。
- 六类入口均能选到对应正式身份；商户后台和店铺端使用同一 shop scope。
- 店铺员工列表恰好包含技师 1–20；1–10 为 full_time，11–20 为 temporary。
- 管理员与 20 名技师均存在双向 Contact、直接会话和消息。
- 每名技师满足排班、预约和已完成订单下限。
- 所有 BookingOrder 的最终状态与最后一条 OrderStatusHistory 一致。
- 每笔完成订单有且只有一个 OrderFinancial；非完成订单无确认收入。
- 每笔完成订单可从运营订单、商户订单、财务和工资明细追踪。
- 三个 PayRun、60 份 Payslip、逐单工资行和 PayoutRecord 总额一致。
- checker 输出账户、身份、店铺、员工类型、联系人、消息、排班、订单状态、收入、工资和付款的精确计数。

### 10.2 浏览器验收

使用正式本地后端和 Vite 前端逐项检查：

1. 运营后台：登录、用户、店铺、技师、订单、订单财务、PayRun。
2. 商户后台：LifeDance 概览、员工 1–20、预约、收入、工资中心。
3. 店铺端：组织通讯录、工作聊天、排班和预约。
4. 技师端：管理员私有技师身份可进入；抽查正社员与临时工账号的日程、订单、收入和工资单。
5. 用户端：管理员 customer 身份可进入；抽查客户订单与店铺详情。
6. 联盟营销：管理员 scout 身份可进入正式能力范围。
7. 刷新页面、退出重登后联系人、消息、预约和工资数据仍存在。

浏览器可见通过不能替代数据库和 API 验收；数据库 checker 通过也不能替代各入口的实际页面检查。

## 11. 非目标

- 不向生产数据库写入本数据集。
- 不使用真实个人的身份证、银行账户、邮箱或其他个人资料。
- 不发送真实邮件、短信、付款或银行转账。
- 不新增 mock API、frontend bypass、localStorage 经营记录或简化平行页面。
- 不把取消、待确认或尚未完成的订单计为收入。
- 不在本任务中改造成多店同时雇佣模型。
- 不推送、部署或发布；本地完成、提交、推送、部署和生产验收分别报告。
