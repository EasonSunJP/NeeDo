# Exchange 选配模式抢单正式化设计

**日期：** 2026-09-01  
**状态：** 已获产品确认  
**实施边界：** 仅实现选配模式的抢单提交、读取、撤回与临时时间锁；不实现速配、入选、匹配成立、预约、订单或支付。

## 1. 背景与目标

NeeDo Exchange 已完成正式 Request 发布、真实数据库、正式 API、RBAC、审计、全局发布费、NDP/TEST_NDP 冻结，以及用户与服务者的数据隔离。本微步骤在该基线上增加第一段可独立运行和验收的抢单能力。

目标是让具备权限的商户或技师，对一条仍在有效期内的选配 Request 提交真实报价，并由数据库持久化一条技师级抢单记录。提交必须绑定现有店铺从属关系、服务项目和正式排班时段；有效抢单会临时锁住技师的服务时间，撤回、Request 撤回或自然到期时释放。

## 2. 已确认的产品规则

- Request 支持速配和选配；本微步骤只开放选配抢单，速配必须与后续原子匹配事务一起实现。
- 商户抢单必须指定当前店铺下的服务技师。
- 技师抢单必须选择自己的有效归属店铺。
- 每条抢单必须提交报价、服务项目、预计开始时间；留言可为空。
- 报价不得低于 Request 已设置的预算下限，也不得高于预算上限。
- 总预算模式下，单个抢单报价仍不得超过总预算；最终入选报价总和的校验和追加预算属于后续匹配微步骤。
- 抢单提交后会临时锁定技师对应时间，禁止同一技师再抢时间重叠的其他 Request。
- 抢单者在匹配成立前可以随时撤回，撤回立即释放临时时间锁。
- Request 撤回会取消其所有有效抢单；Request 自然到期会使其所有有效抢单失效。
- 本微步骤不改变 Request 发布费：显式撤回仍执行现有全额扣除，自然到期仍执行现有全额释放。
- “有人抢单但未匹配成功”“提前手动结束”“扣除一半冻结 NDP”和最短一小时规则，属于后续结束匹配动作，本微步骤不新增该动作。
- 速配只有在人数和总预算都满足时才可自动成立；超预算时等待发出者确认。该规则保留给后续速配/匹配设计。
- 匹配成功后才公开全部已填写地址；电话和邮箱永不通过 Exchange 返回。本微步骤保持当前匹配前隐私投影。

## 3. 方案选择

### 采用：选配模式完整抢单切片

本步骤交付一条真实的、端到端可验收的选配抢单路径：读取可抢选项、提交、服务端校验、持久化、分页查看、刷新恢复和撤回。

### 未采用：同时实现速配

速配人数达到目标时必须原子创建匹配关系，并处理总预算超限、失败者状态和后续预约边界。将其放入本步骤会同时跨越抢单和匹配两个状态机，不符合一次一个微步骤。

### 未采用：只做数据库或只做表单壳

数据库-only 无法完成真实浏览器验收；无提交能力的表单属于占位实现。二者均不满足正式开发边界。

## 4. 数据模型

新增 `ExchangeClaimStatus`：

- `ACTIVE`：有效抢单，同时构成临时时间锁。
- `WITHDRAWN`：抢单者主动撤回。
- `REQUEST_WITHDRAWN`：Request 被发出者撤回。
- `REQUEST_EXPIRED`：Request 自然到期。

新增 `ExchangeClaim`，核心字段：

- `exchangePostId`：只能关联一条 Demand Request。
- `claimantUserId`、`claimantIdentityId`：记录实际发起抢单的用户和当前身份。
- `shopId`、`technicianProfileId`：服务归属店铺和实际服务技师。
- `serviceId` 或 `technicianServiceId`：沿用当前店铺定价模式下的正式服务项目，二者必须且只能有一个。
- `scheduleSlotId`：复用正式 `ScheduleSlot`，其开始时间即预计开始时间，结束时间由正式服务时长决定。
- `quoteAmountJpy`、`currency`、`message`。
- `status`、`activeKey`、`idempotencyKey`、`payloadFingerprint`。
- `withdrawnAt`、`terminalAt`、`createdAt`、`updatedAt`、`deletedAt`。

约束：

- `idempotencyKey` 全局唯一；相同键和相同负载返回原结果，不同负载返回幂等冲突。
- `activeKey` 在 `ACTIVE` 时取 `request:{postId}:technician:{technicianProfileId}`，终态置空；数据库唯一约束防止同一技师重复抢同一 Request。
- 通过 CHECK 保证 `serviceId` 与 `technicianServiceId` 恰有一个非空。
- 所有关联字段和时间范围读取字段建立索引；软删除查询统一过滤 `deletedAt IS NULL`。
- Request、身份、店铺、技师、服务、排班均使用 Restrict 关系，不允许级联删除业务证据。

## 5. 正式可抢选项

新增分页接口：

`GET /api/v1/exchange/posts/{id}/claim-options?page=1&page_size=20&shop_id=&technician_profile_id=&service_ref=`

返回扁平化的有效组合，每行包含店铺、技师、服务项目、排班时段和服务时长。它不是新的排班来源，只是对现有 `TechnicianShopAffiliation`、`Service`/`TechnicianService`、`Availability`、`ScheduleSlot` 和现有 Booking 冲突规则的受限投影。

服务端规则：

- Request 必须为 `published`、`demand`、`selective` 且未过期。
- 商户身份只能读取当前店铺范围内的组合，并且必须选择该店铺的有效从属技师。
- 技师身份只能读取本人技师档案在有效归属店铺中的组合。
- 排班必须为可预约、未满容量、店铺已发布且未暂停接单。
- 排班开始和结束必须完整落在 Request 服务时段内。
- 已确认/服务中的正式订单，及其他 `ACTIVE` 抢单的重叠时间，均从结果中排除。
- 普通用户、Request 发出者、其他身份和没有权限的角色不能读取可抢选项。

## 6. 写入事务与并发

新增：

- `POST /api/v1/exchange/posts/{id}/claims`
- `POST /api/v1/exchange/claims/{claimId}/withdraw`

提交事务按固定顺序锁定 Request、技师和 ScheduleSlot，然后重新校验：

1. Request 仍可抢且为选配模式。
2. 当前身份允许抢单，且不是 Request 所有者。
3. 店铺—技师从属关系仍有效。
4. 服务项目、店铺定价模式和排班关系仍一致。
5. 排班仍有容量，店铺未暂停接单。
6. 预计服务时段仍完整落在 Request 时段内。
7. 报价仍在预算范围内。
8. 不存在该技师的重叠正式订单或其他有效抢单。
9. `activeKey` 和幂等键未冲突。

所有校验与 `ExchangeClaim`、审计记录写入在同一数据库事务内完成。技师行锁序列化不同 Request 上的并发抢单，从而使“重叠临时锁”在并发下仍成立。

撤回事务锁定抢单和技师，只允许原 `claimantIdentityId` 撤回 `ACTIVE` 抢单。更新为 `WITHDRAWN`、清空 `activeKey` 并写审计后，时间即恢复可用。

现有 Request 撤回与到期事务分别批量把有效抢单更新为 `REQUEST_WITHDRAWN` 和 `REQUEST_EXPIRED`，同时清空 `activeKey`。它们不新增独立钱包动作，继续使用现有 Request 财务事务。

## 7. API、RBAC 与审计

新增权限：

- `exchange:claim-options:list`
- `exchange:claims:create`
- `exchange:claims:read-own`
- `exchange:claims:list-owned-request`
- `exchange:claims:withdraw-own`

角色分配：

- `merchant_owner`、`merchant_staff`、`technician`：可读取选项、创建、读取本人抢单、撤回本人抢单。
- 现有 Demand 发布者角色：可分页读取自己 Request 的抢单。
- 其他角色不新增写权限。

读取接口：

- `GET /api/v1/exchange/posts/{id}/claims?page=1&page_size=20`：仅 Request 所有者读取收到的抢单。
- `GET /api/v1/exchange/posts/{id}/claims/mine`：返回 `{ claim: ExchangeClaim | null }`，其中 `claim` 是当前身份在该 Request 下的有效或最近一条抢单；使用非空对象包装，避免与统一失败响应的 `data: null` 冲突；该接口不是列表接口。

审计动作：

- `exchange.claim.create`
- `exchange.claim.withdraw`
- `exchange.claim.request_withdrawn`
- `exchange.claim.request_expired`

审计元数据只记录业务 ID、状态、报价和时间，不记录地址、留言正文、电话、邮箱或令牌。

## 8. 返回数据与隐私

抢单者读取自己的抢单时可以看到全部已提交字段。Request 所有者读取收到的抢单时可以看到：服务者公开身份、归属店铺、技师、服务项目、报价、预计服务时间和留言。

其他服务者不能读取竞争者抢单；其他 Request 发布者不能读取不属于自己的抢单；跨店商户不能读取其他店铺的选项或抢单。

Request 详情的当前匹配前地址投影保持不变。抢单记录不复制 Request 地址，避免形成第二个隐私数据源。

## 9. 前端交互

在现有高保真 `ExchangePostDetailPage` 中增加独立组件，不重做页面：

- 仅对具备 `viewer.canClaim` 的选配 Request 显示正式“抢单”操作。
- 商户表单按店铺固定范围选择技师、服务项目和预计开始时间。
- 技师表单先选择归属店铺，再选择服务项目和预计开始时间。
- 报价、服务项目、技师/店铺、预计开始时间均显示 `*`；留言明确为选填。
- 表单数据来自分页 `claim-options`，无静态数组、localStorage 或假数据。
- 提交成功后展示服务器返回的抢单卡片；刷新或重新登录通过 `claims/mine` 恢复。
- 有效抢单显示“撤回抢单”；撤回后二次读取服务器状态。
- Request 所有者看到分页“收到的抢单”列表，但本步骤没有选择、追加预算或完成匹配按钮。
- 速配 Request 不新增可点击抢单入口，避免出现无法兑现的半成品流程。
- 新增文案覆盖简体中文、繁体中文、日语、英语和韩语；用户留言保持原文。

## 10. 错误语义

使用稳定错误键，不返回 Prisma 或 Node 原生错误：

- `error.exchange.claim_not_allowed`
- `error.exchange.claim_selective_only`
- `error.exchange.claim_option_not_found`
- `error.exchange.claim_quote_below_budget`
- `error.exchange.claim_quote_above_budget`
- `error.exchange.claim_schedule_unavailable`
- `error.exchange.claim_time_conflict`
- `error.exchange.claim_duplicate`
- `error.exchange.claim_idempotency_conflict`
- `error.exchange.claim_not_found`
- `error.exchange.claim_invalid_state`

## 11. 验收标准

- Prisma schema、migration 和真实数据库物理表一致。
- Repository、Service、Controller、Zod、OpenAPI、RBAC、审计齐全。
- 所有列表分页；没有跨用户、跨身份或跨店泄露。
- 并发提交不能产生重复抢单或重叠技师时间锁。
- 报价越界、排班不足、非从属技师、非正式服务项目和速配 Request 均被服务端拒绝。
- Request 撤回/到期和抢单撤回会持久化终态并释放临时锁。
- 前端五语言、必填星号、高保真窄屏布局和真实错误反馈可见。
- 真实测试账号完成商户或技师提交、刷新持久化、重复拦截、时间冲突、撤回和发出者查看的浏览器验收。
- 不创建 Match、BookingOrder、Payment 或新的钱包扣款；不推送、不部署、不发起真实支付。

## 12. 已验证实现边界（2026-09-01）

本微步骤已经实现并自动化验证：

- migration `20260901100000_exchange_selective_claim` 在本机 `needo_dev` 物理落表；独立检查确认 21 列、13 个索引（含主键）、3 个 CHECK、8 个 `RESTRICT/RESTRICT` 外键、5 个 permission 及 19 条有效角色授权关系。
- 增量 migration `20260901130000_exchange_claim_withdraw_idempotency` 已独立核验 2 个 nullable 字段、1 个唯一索引和 1 个成对空值 CHECK；合计为 23 列、14 个索引和 4 个 CHECK。
- 较早且与本步骤无关的 migration `20260831160000_im_chat_records_translation` 仍保持 pending；本步骤未执行会连带应用它的全量 `migrate deploy`。
- `ExchangeClaimRepository`、`ExchangeClaimService`、Controller、Zod、OpenAPI、RBAC 与审计已接通；五个正式接口均位于 `/api/v1`，两个列表均分页。
- 本地 claim lifecycle fixture 检查器以具名、精确的 Prisma fixture 建立 Request、排班、服务与身份，再通过正式 Repository/Service 证明排班投影、创建持久化、幂等重放、重复拦截、跨 Request 技师时间冲突、抢单者撤回释放、Request 到期释放和审计持久化，并按捕获 ID 精确清理；它不单独证明正式发布与 TEST_NDP 冻结。
- 撤回写入通过 migration `20260901130000_exchange_claim_withdraw_idempotency` 持久化幂等键与负载指纹；同键重试返回首次成功结果，不重复写审计。
- MySQL 并发集成测试证明同一技师重叠时段的两个并发尝试只产生一条有效抢单。
- 前端仅在服务端 `viewer.canClaim` / `viewer.canViewClaims` 授权时组合正式抢单面板或发布者只读列表；五语言、必填星号、原文留言、分页和服务端错误反馈均已覆盖测试。
- 后端相关 12 个测试套件共 119 项通过；前端 Exchange 与移动路由 11 个测试文件共 60 项通过；前后端 lint/build 和 production bundle audit 通过，未提高 bundle budget。

明确未实现：速配自动匹配、发布者选择服务者、总预算追加、未满员提前结束与半额 NDP 规则、匹配成立、成立后双方同意取消、预约、`BookingOrder`、订单支付、钱包结算或真实扣款。
