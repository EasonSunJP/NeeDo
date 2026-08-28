# NeeDo 联盟营销达人市场、商户端与运营后台正式设计

## 1. 状态与目标

本设计已在 2026-08-28 经用户逐段确认。目标是在现有正式 Affiliate、Booking、Social、Wallet、Ledger、RBAC 和 AuditLog 基础上，完成一个可真实使用的联盟营销平台，而不是新增展示页或浏览器本地演示。

本设计覆盖：

- 商户后台顶部“联盟营销”入口及完整工作区。
- “我的联盟营销、达人广场、达人动态、营销热榜”四个商户端一级功能。
- 达人自助开通、联盟营销资料和外部社交主页链接。
- 达人主动领取与商户定向邀请两条正式合作链路。
- 已有联盟负责人、合伙人、二级成员、权限和联盟钱包结构。
- 商户额外承担的平台服务费、预算冻结和多钱包原子结算。
- 只使用 NeeDo 可验证数据的统计、榜单和达人里程碑。
- 运营后台全平台监控、费率设置、联盟管理、风控、财务和审计。
- eKYC、同名真实银行账户及正式提现闭环。

本设计不包含：

- 外部社交平台 OAuth 绑定、粉丝数据抓取或外部内容同步。
- 以用户自报粉丝数、报价或浏览器本地数据生成榜单。
- 绕过正式订单、归因、账本或审计的手工结算。
- 在当前阶段拆分独立联盟营销微服务。
- 一次性完成全部能力的爆发式开发。

## 2. 与现有设计和实现的关系

### 2.1 保留的正式基础

继续复用现有正式能力：

- `User`、`UserIdentity`、`PublicIdentifier` 和统一登录会话。
- `AffiliateTask`、`AffiliateClaim`、`AffiliateTouch`、`AffiliateAttribution`、`AffiliateReward`、预算 Reservation 和 RiskEvent。
- `/api/v1/merchant-admin/affiliate/tasks`、`/api/v1/affiliate/tasks`、`/api/v1/affiliate/claims` 和 `/api/v1/backoffice/affiliate/tasks`。
- 联盟营销协议接受、自助身份激活、受保护银行账户和提现资格检查。
- Booking 完单、退款状态机、NDP Wallet、LedgerTransaction、WalletLedger、FinanceReconciliation 和 AuditLog。
- NeeDo Social 正式公开动态。

当前实现中的联盟营销身份内部类型为 `scout`。为避免扩大身份迁移范围，本功能继续把它作为 RBAC 和激活兼容标记；新联盟营销业务 API 不向页面暴露该内部名称，而是返回明确的 `affiliateStatus`。对外身份始终使用原用户的 `needoId`。

### 2.2 保留的联盟组织设计

`2026-08-26-affiliate-alliance-exclusive-task-profile-design.md` 中以下规则继续有效：

- 联盟是跨任务长期复用的账号级关系。
- 每个用户最多拥有或加入一个有效联盟。
- 负责人和合伙人为一级，二级成员必须直属一名有效一级成员。
- 成员从邀请人的 NeeDo 双向好友中选择，接受邀请后才生效。
- 负责人管理成员权限、默认介绍者比例、成员覆盖比例、负责人转让和联盟钱包。
- 公开任务与指定联盟专属任务并存。
- 历史成员、邀请、Claim 快照、账本和审计不物理删除。

### 2.3 被本设计替换的旧规则

本设计替换旧联盟设计中“平台费从任务原始返点内扣除”的计算方式。新规则是：

- 任务佣金预算全部属于达人或联盟侧。
- 平台服务费由商户在佣金预算之外额外承担。
- 外部社交资料只保存主页链接；未经验证的外部粉丝数不进入榜单或认证指标。

## 3. 总体架构

采用“正式交易核心 + 可重建统计投影”架构。

### 3.1 正式交易核心

以下记录是业务和资金权威：

- 联盟营销身份与协议接受。
- 达人资料、联盟、成员、权限、邀请和合作邀请。
- 任务版本、发布范围、佣金预算和费率快照。
- Claim、推广链接、Touch、Attribution、Reward 和 RewardAllocation。
- Wallet、LedgerTransaction、WalletLedger、FinanceReconciliation 和 AuditLog。

所有状态变更和资金写入经 Service 事务完成。Controller 不写业务逻辑，Repository 不承载状态机规则。

### 3.2 可重建统计投影

达人广场筛选、营销热榜和运营监控读取按日聚合的统计投影，不在每次请求中跨全量订单、触点和账本实时联表。

投影只消费与正式事务同事务落库的 Affiliate 指标事件。投影数据不是资金权威，允许从正式任务、订单、归因、Reward、退款、风控和账本重建。

### 3.3 不拆微服务

身份、Booking 和 NDP 账本当前处于同一正式后端。联盟营销继续作为该后端内的独立领域模块，避免引入分布式资金事务。后续只有在事务边界、事件契约和监控成熟后才评估服务拆分。

## 4. 账号、联盟营销身份与资料

### 4.1 唯一账号与公开 ID

- 联盟营销不创建第二个 `User`。
- 数据库关系使用内部 `User.id`。
- 达人广场、达人主页、联盟成员和合作记录展示 `User.needoId`。
- 不向前端暴露内部数字 `userId` 或 `identityId` 作为达人编号。
- 同一用户同时拥有客户、技师、商户成员或联盟营销身份时，各身份共享账号安全、eKYC 和个人钱包，但各业务权限独立。

### 4.2 自助开通

正式用户登录后读取当前联盟营销协议，勾选已阅读和同意后即时开通。开通事务必须同时：

1. 验证用户有效且未软删除。
2. 固化协议版本、正文 Hash、语言、时间和回执。
3. 创建或复用当前用户的联盟营销身份标记。
4. 创建最小 AffiliateProfile。
5. 授予正式 RBAC 角色和权限。
6. 写通知和审计。

开通不要求 eKYC，也不要求运营人工审核。运营可以通过正式权限暂停、封禁或恢复联盟营销身份，状态变化必须影响新领取、新邀请接受、新推广和提现，但不能删除历史结算。

### 4.3 AffiliateProfile

联盟营销资料与普通用户资料分离，至少包含：

- `userId` 唯一关联。
- 联盟营销简介、优势领域、服务区域和合作状态。
- 可合作状态及最后更新时间。
- 运营暂停状态、原因和审计关联。
- `createdAt / updatedAt / deletedAt`。

头像、显示名和 `needoId` 读取统一用户资料，不在 AffiliateProfile 重复保存可漂移副本。

### 4.4 外部社交主页

`AffiliateProfileChannel` 保存平台类型、显示标签、HTTPS 主页 URL、排序和更新时间。预设支持 X、Instagram、YouTube、TikTok，并允许自定义平台。

规则：

- 不要求 OAuth、授权绑定或外部账号验证。
- 后端不主动抓取 URL 内容，避免 SSRF 和外部数据污染。
- 仅接受 HTTPS URL，拒绝脚本协议、凭据嵌入和非法主机。
- 前端使用安全新窗口并设置 `noopener noreferrer`。
- 页面明确标记为“用户填写的外部主页”。
- 外部粉丝量、播放量和互动量不作为 NeeDo 认证数据。

## 5. 联盟组织与钱包

### 5.1 层级

联盟保持两级结构：

```text
一级：负责人 + 多名合伙人
二级：每人只能直属一名负责人或合伙人
```

一个用户全平台只能有一个有效联盟成员关系。有效成员使用可空唯一 ActiveKey 约束；退出后清空 ActiveKey，历史行保留。

### 5.2 邀请与权限

联盟成员邀请必须同时验证：

- 邀请人与候选人是 NeeDo 双向好友。
- 候选人账号和联盟营销身份有效。
- 候选人没有其他有效联盟。
- 没有重复待处理邀请。

接受邀请后才创建有效成员关系。负责人始终拥有全部权限；其他成员可配置领取任务、查看概览、查看成员明细、管理直属二级成员和查看联盟钱包等权限。

### 5.3 联盟钱包

新增 `WalletOwnerType.ALLIANCE`。联盟钱包是独立财务主体，不与负责人个人钱包混用。

只有负责人可以把联盟钱包可用余额转给负责人本人或当前有效合伙人。转账必须经过幂等键、余额锁、Ledger、对账和审计。联盟存在待恢复金额时禁止新转账。

### 5.4 联盟内部佣金

负责人设置默认实际推广者比例，并可为成员设置覆盖比例。联盟成员领取或接受合作时固化：

- 联盟、成员、角色和直属关系。
- 关键权限。
- 默认比例或成员覆盖比例来源。
- 最终推广者比例与联盟钱包比例。

平台费不参与联盟内部比例。联盟侧佣金始终守恒：

```text
allianceWalletShareBps = 10000 - promoterShareBps
```

## 6. 商户后台信息架构

### 6.1 入口

在现有商户后台顶部导航新增“联盟营销”入口，沿用现有 MerchantAdminLayout、主题变量、店铺上下文和权限守卫，不创建另一套后台框架。

左侧固定四个一级功能：

1. 我的联盟营销。
2. 达人广场。
3. 达人动态。
4. 营销热榜。

### 6.2 我的联盟营销

包含：

- 总览：有效 GMV、订单、已结算佣金、平台费、预算余量和进行中合作。
- 任务：草稿、待审核、进行中、暂停、结束和版本历史。
- 候选达人：收藏、任务候选和邀请状态。
- 合作：主动领取和定向邀请产生的 Claim。
- 效果：链接、触点、归因、有效订单和退款冲正。
- 财务：佣金预算、平台费预留、捕获、释放、结算和对账。

### 6.3 达人广场

只展示联盟营销身份有效、资料允许合作且未被运营暂停的真实 NeeDo 账号。支持按 `needoId`、优势领域、地区、可合作状态、联盟归属、有效完成单量、转化率和履约率筛选。

商户可收藏达人、加入任务候选名单或向某个已审核有效任务发送定向邀请。没有可用任务时进入正式任务创建流程，不能生成无任务约束的口头合作记录。

达人卡片展示：

- 头像、显示名、`needoId` 和联盟归属。
- 优势领域、服务区域和可合作状态。
- 经过权限裁剪的 NeeDo 验证指标。
- 用户填写的外部社交主页链接。

### 6.4 达人动态

数据来源仅为：

- 该用户在 NeeDo Social 中公开发布且当前查看者有权读取的正式内容。
- 系统根据有效合作、完成订单和排名生成的可验证里程碑。

系统里程碑不能包含客户身份、订单号、其他合作店铺名称或精确跨店财务。外部社交动态不抓取、不复制。

### 6.5 营销热榜

默认展示近 30 日有效联盟归因 GMV，可切换 7、30、90 日及以下榜单：

- 有效 GMV。
- 有效完成单量。
- 有效转化率。
- 履约率。

商户查看自己合作时可读取精确数据；在全平台达人广场和热榜中只显示排名、有效订单、比率和 GMV 区间，不显示其他店铺名称或精确跨店 GMV。

### 6.6 多店铺边界

商户进入任务、财务或效果页时必须有明确店铺范围。Service 必须根据 MerchantAccount、MerchantShopMembership 和 RBAC Scope 重新校验，不能依赖前端隐藏菜单。

单个任务版本只能绑定一个确定的平台费率快照。若一个多店任务所选店铺在生效时点解析出不同费率，提交被拒绝，商户需要按费率相同的店铺拆分任务，避免结算时无法确定费率。

## 7. 合作与任务生命周期

### 7.1 双向合作

支持两条正式链路：

- 达人从公开任务市场主动领取。
- 商户从达人广场向指定达人发送定向邀请。

定向邀请状态为 `pending / accepted / rejected / cancelled / expired`。邀请必须绑定一个当前有效、已审核任务版本。达人接受时才创建 Claim；拒绝、取消和过期不创建 Claim，但保留邀请和审计。

同一用户、同一任务只能存在一个有效 Claim。主动领取与定向邀请并发时由数据库唯一约束和事务锁保证只有一个成功。

### 7.2 联盟专属任务

任务受众继续支持：

- `public`：符合条件的无联盟达人或有领取权限的联盟成员可领取。
- `alliance_exclusive`：只对指定联盟当前有效且有权限的成员可见和可领取。

联盟专属任务不能泄漏到其他达人搜索、推荐或公开详情。运营后台在具备全局读取权限时可以查看。

### 7.3 Claim 快照

Claim 创建时固化：

- 用户和 `needoId` 快照。
- 任务版本、发布主体、店铺和服务范围。
- 平台费规则版本和费率。
- 是否属于联盟、联盟和成员关系。
- 推广者/联盟钱包内部分配比例。
- 领取时关键权限和来源（主动领取或定向邀请）。

后续资料修改、联盟退出、权限变化和费率变化不修改历史 Claim。

## 8. 平台费、预算冻结与结算

### 8.1 费率规则

`AffiliatePlatformFeeRule` 使用基点存储，包含：

- 全局默认或单店覆盖作用域。
- `feeBps`。
- 版本和生效时间。
- 创建人、原因和审计关联。
- `createdAt / updatedAt / deletedAt`。

费率解析优先使用有效单店覆盖，否则使用全局默认。规则修改只影响生效后提交的新任务版本。旧任务、Claim、Reward 和冲正继续使用原快照。

### 8.2 预算语义

`AffiliateTask.totalBudgetNdp` 表示达人/联盟侧佣金预算，不包含平台费。

任务提交时计算：

```text
platformFeeReserveNdp = ceil(totalBudgetNdp * platformFeeBps / 10000)
grossFrozenNdp = totalBudgetNdp + platformFeeReserveNdp
```

并在同一事务中完成：

1. 锁定任务、费率规则和发布者钱包。
2. 验证任务版本和商户作用域。
3. 从可用余额冻结 `grossFrozenNdp`。
4. 写 BudgetReservation、LedgerTransaction、WalletLedger、FinanceReconciliation 和 AuditLog。
5. 把任务转入待审核。

余额不足或任一步失败时全部回滚。

### 8.3 已确认示例

平台费率为 10%，达人/联盟佣金预算为 2,000,000 NDP：

```text
佣金预算          2,000,000 NDP
平台费预留          200,000 NDP
商户账户总冻结    2,200,000 NDP
```

每完成一笔约定佣金 10,000 NDP 的有效订单：

```text
达人/联盟侧佣金      10,000 NDP
平台服务费            1,000 NDP
商户冻结余额实际捕获 11,000 NDP
```

平台费计算为：

```text
platformFeeNdp = floor(rewardNdp * platformFeeBps / 10000)
grossCaptureNdp = rewardNdp + platformFeeNdp
```

保守预留产生的整数尾差在任务结束时释放给商户。

### 8.4 原子分配

无联盟达人：

```text
个人钱包 = rewardNdp
平台钱包 = platformFeeNdp
```

联盟成员：

```text
promoterNdp = floor(rewardNdp * promoterShareBps / 10000)
allianceNdp = rewardNdp - promoterNdp
平台钱包 = platformFeeNdp
```

联盟侧整数尾差归联盟钱包。推广者与联盟钱包合计必须严格等于 `rewardNdp`，平台费在其外。

一次完单事务必须同时锁定 Attribution、Reward、BudgetReservation、商户冻结钱包及全部收款钱包，并写一笔可对账的多钱包 LedgerTransaction、RewardAllocation、任务聚合和审计。任何写入失败全部回滚。

### 8.5 到期、退款与恢复

任务结束后释放：

- 未分配佣金预算。
- 未捕获的平台费预留。
- 保守预留的整数尾差。

退款和风控冲正读取原 RewardAllocation，不读取当前费率或重新计算。平台、联盟和推广者按原入账金额原路冲回。

任一收款钱包余额不足时不允许静默透支。系统记录主体级 `outstandingRecoveryNdp`，冻结相关主体后续可提现收益，并从后续收入优先恢复；历史结算和联盟转账不被篡改。

## 9. eKYC、银行账户与提现

联盟营销身份开通、领取任务、推广和收益入账不要求 eKYC。

提现前必须同时满足：

- 联盟营销身份有效。
- eKYC 状态为已验证且未过期。
- 存在用于联盟营销提现的已验证真实银行账户。
- 银行账户名义与 eKYC 姓名一致。
- 没有冻结中的风险、冲正恢复或账户限制。

银行账户敏感字段继续使用受保护存储，API 只返回掩码信息。姓名比较使用规范化后的同名验证结果或不可逆匹配 Hash，不在普通日志中写入明文账户名义。

提现流程：

1. 用户提交提现并冻结对应 NDP。
2. 后端重新检查身份、eKYC、同名银行账户和风险状态。
3. 低风险申请提交正式付款渠道；高风险或异常进入运营复核。
4. 付款成功回调后正式扣账和对账。
5. 付款失败或最终拒绝时原路解冻。

重复回调必须命中同一幂等键。

## 10. 正式指标与统计投影

### 10.1 指标口径

- `有效 GMV`：联盟归因订单已完成、Reward 已结算且未退款、未冲正的订单实付 JPY。
- `有效完成单量`：满足有效 GMV 条件的唯一订单数。
- `有效转化率`：风控通过的唯一推广访问中形成有效归因订单的比例。
- `履约率`：进入有效合作范围的归因订单中正常完成的比例；按订单责任码排除商户、平台原因和客户主动取消。
- `有效收益`：已进入达人或联盟钱包且未冲正的 NDP。
- `退款与风险率`：退款、作弊归因、异常自购和冲正订单的比例。

取消、退款、冲正、风险无效和测试数据不得进入有效榜单。

### 10.2 样本门槛

转化率榜要求统计窗口内至少：

- 20 个有效唯一访问。
- 5 个有效订单。

未达到门槛的达人可以展示自身数据，但不进入转化率排名。

### 10.3 投影数据

新增 Affiliate 专用事务事件和按日投影：

- `AffiliateMetricEvent`：唯一 EventKey、事件类型、业务引用、发生时间、投影状态和重试信息。
- `AffiliateTalentMetricDaily`：达人日指标。
- `AffiliateAllianceMetricDaily`：联盟日指标。
- `AffiliateTaskMetricDaily`：任务日指标。
- `AffiliateShopMetricDaily`：店铺日指标。
- `AffiliateMerchantMetricDaily`：商户日指标。
- `AffiliateProjectionCheckpoint`：投影水位和重建状态。

MetricEvent 必须与产生它的正式业务变更同事务落库。Projector 使用唯一 EventKey 幂等消费。投影页面显示更新时间；投影延迟不阻止正式订单和资金结算。

### 10.4 隐私边界

- 商户可读取自己有权限店铺和任务的精确数据。
- 商户查看全平台达人时只读取排名、有效订单、转化率、履约率和 GMV 区间。
- 商户不能读取其他店铺名称、精确跨店 GMV、佣金、客户或订单明细。
- 运营后台可以读取全平台精确指标和来源，但仍需按最小必要原则隐藏客户直接身份。

## 11. 运营后台

### 11.1 导航与文案

顶部入口文案：

- 简体中文：联盟营销。
- 英文：Affiliate。
- 日文：アフィリエイト。

入口右上角显示 `TEST` 角标。角标由正式运行时功能配置控制，测试阶段结束后可以关闭，不在组件内散落硬编码判断。

### 11.2 功能范围

运营后台具备商户端相同的任务、达人广场、达人动态和营销热榜读取能力，并增加：

- 联盟营销总览。
- 全平台任务监控与审核。
- 达人身份状态和资料查看。
- 联盟、成员、权限、比例、邀请和联盟钱包管理视图。
- 平台默认费率和单店覆盖费率管理。
- 佣金预算、平台费、三方分账、冲正和恢复监控。
- 风险事件处理。
- 敏感数据导出和完整审计。

监控下钻路径固定为：

```text
平台 → 商户 → 店铺 → 任务 → 达人/联盟 → Claim → 归因订单 → RewardAllocation → 账本
```

运营人员不能直接修改 Wallet 余额、RewardAllocation 或历史 Ledger。所有修复必须通过正式调整、冲正或恢复流程。

## 12. 数据模型

在现有 Affiliate 模型旁按微步骤新增或扩展：

### 12.1 新增模型

- `AffiliateProfile`。
- `AffiliateProfileChannel`。
- `AffiliateAlliance`。
- `AffiliateAllianceMember`。
- `AffiliateAlliancePermission`。
- `AffiliateAlliancePartnerBinding`。
- `AffiliateAllianceInvitation`。
- `AffiliateAllianceTransfer`。
- `AffiliateTalentFavorite`。
- `AffiliateTaskCandidate`。
- `AffiliateCollaborationInvitation`。
- `AffiliatePlatformFeeRule`。
- `AffiliateRewardAllocation`。
- `AffiliateMetricEvent`。
- 五类 Affiliate 日统计投影和 ProjectionCheckpoint。

### 12.2 扩展模型和枚举

- `WalletOwnerType` 增加 `ALLIANCE`。
- `LedgerTransactionType` 增加联盟转账及多方结算所需正式类型。
- `AffiliateTask` 增加受众、目标联盟、平台费规则和费率快照。
- `AffiliateClaim` 增加邀请来源、联盟、成员、权限和分成快照。
- `AffiliateReward` 关联不可变 Allocation 明细。
- `AffiliateBudgetReservation` 分别记录佣金预算与平台费预留、捕获和释放聚合。

所有业务表包含 `id / createdAt / updatedAt / deletedAt`，列表默认过滤软删除，关联字段建索引。已应用 migration 不修改，只新增 migration。

## 13. API 设计

保留现有正式任务和 Claim 接口，按以下分域扩展。

### 13.1 用户与达人 `/api/v1/affiliate`

- `GET/PATCH /profile`。
- `POST/PATCH/DELETE /profile/channels`。
- `GET/POST /alliances`。
- `GET /alliances/me`。
- `GET /alliances/me/eligible-contacts`。
- `POST /alliances/me/invitations`。
- `POST /alliance-invitations/:id/accept|reject`。
- `PATCH/DELETE /alliances/me/members/:id`。
- `POST/DELETE /alliances/me/partner-bindings`。
- `GET/POST /alliances/me/wallet/transfers`。
- `GET /collaboration-invitations`。
- `POST /collaboration-invitations/:id/accept|reject`。
- 现有 tasks、claims、resolve 和 code validate 接口按 Claim 快照扩展。

### 13.2 商户 `/api/v1/merchant-admin/affiliate`

- `GET /overview`。
- 现有 tasks 列表、详情、创建、修改和提交。
- `GET /talents`、`GET /talents/:needoId`。
- `GET/POST/DELETE /talent-favorites`。
- `GET/POST/DELETE /tasks/:taskId/candidates`。
- `GET/POST /tasks/:taskId/invitations`。
- `POST /invitations/:id/cancel`。
- `GET /collaborations`、`GET /collaborations/:claimId`。
- `GET /talent-dynamics`。
- `GET /rankings`。
- `GET /finance/summary`、`GET /finance/transactions`。

### 13.3 运营 `/api/v1/backoffice/affiliate`

- `GET /overview`。
- 现有 tasks 审核接口。
- `GET /talents`、`GET /talents/:needoId`。
- `POST /talents/:needoId/suspend|restore`。
- `GET /alliances`、`GET /alliances/:id`。
- `GET/POST /fee-rules`、`GET /fee-rules/history`。
- `GET /shops`、`GET /shops/:shopId/metrics`。
- `GET /settlements`、`GET /recoveries`。
- `GET /risk-events`、`POST /risk-events/:id/review`。
- `GET /rankings`、`GET /metric-projections/status`。
- 权限控制下的导出接口。

所有列表分页并支持受控筛选和排序。所有接口必须具有 Zod、OpenAPI、JWT 和明确 permission。

## 14. RBAC

至少拆分以下权限：

### 14.1 达人

- 联盟营销资料读取和修改。
- 任务市场读取和领取。
- 合作邀请读取和响应。
- 联盟创建、成员读取和按角色管理。
- 自身收益和钱包读取。
- 提现申请。

### 14.2 商户

- 联盟营销工作区读取。
- 任务创建、修改和提交。
- 达人广场读取、收藏和候选管理。
- 合作邀请创建和取消。
- 自有店铺精确效果与财务读取。

权限必须带 MerchantAccount 或 Shop Scope。

### 14.3 运营

- 全局只读监控。
- 任务审核。
- 达人身份状态管理。
- 联盟管理。
- 费率管理。
- 风控处理。
- 财务处理。
- 敏感数据导出。

前端隐藏按钮不能替代后端权限检查。所有运营写操作记录修改前值、修改后值、操作者、原因和时间。

## 15. 并发、幂等与异常

以下操作必须接受或生成稳定幂等键：

- 身份协议接受和激活。
- 任务提交和预算冻结。
- 主动领取、邀请接受和 Claim 创建。
- 完单结算。
- 退款冲正和恢复。
- 联盟钱包转账。
- 提现和付款回调。
- 指标事件消费。

状态写入使用版本号和必要的数据库行锁。重复主动领取与邀请接受通过唯一 ActiveKey 保证只有一个有效 Claim。

稳定错误至少包括：

- 商户余额不足或预算快照变化。
- 费率规则版本失效。
- 任务暂停、结束或不可见。
- 达人身份暂停。
- 用户已有有效联盟。
- 联盟成员缺少领取或管理权限。
- 邀请重复、过期或已处理。
- 归因重复、超过窗口或被风控拒绝。
- eKYC 缺失或过期。
- 银行账户未验证或姓名不一致。
- 钱包存在待恢复金额。
- 统计投影延迟或重建中。

API 不返回 Prisma、数据库、付款渠道原始异常或敏感内部字段。

## 16. 前端体验与 i18n

- 复用现有商户和运营后台布局、主题 Token、表格、抽屉、筛选和分页组件。
- 不复制巨量星图品牌、商标、颜色或页面像素布局；只参考功能信息架构和工作流。
- 用户可见文案全部进入现有 i18n。
- 联盟营销术语：简体中文“联盟营销”、英文“Affiliate”、日文“アフィリエイト”。
- 加载、空状态、权限不足、数据延迟、重建中和错误重试均有明确状态。
- 资金提交前展示佣金预算、平台费率、平台费预留和总冻结金额。
- 页面刷新、重新登录和服务重启后所有正式状态保持一致。

## 17. 验收标准

必须使用真实 NeeDo 正式账号、正式 MySQL/Redis、正式 API 和真实本地服务完成验收。

### 17.1 身份与资料

- 无 eKYC 用户接受协议后可即时开通联盟营销。
- 达人页面显示原用户 `needoId`，不生成第二个公开 ID。
- 外部主页链接可保存、读取和安全打开，刷新后仍存在。
- 暂停身份后不能新领取或接受邀请，历史收益保持。

### 17.2 联盟

- 每个用户最多一个有效联盟。
- 非双向好友不能发送联盟成员邀请。
- 两级限制、成员权限和负责人转让由后端强制执行。
- 退出联盟后旧 Claim 仍按原快照结算。
- 联盟钱包与负责人个人钱包完全分离。

### 17.3 预算与结算

- 2,000,000 NDP 佣金预算、10%费率准确冻结 2,200,000 NDP。
- 单笔 10,000 NDP 佣金准确捕获 11,000 NDP。
- 无联盟达人完整获得 10,000 NDP，平台获得 1,000 NDP。
- 联盟内部两方合计获得完整 10,000 NDP，平台另外获得 1,000 NDP。
- 重复完单事件不重复入账。
- 任务结束释放剩余佣金和对应平台费。
- 退款按原 Allocation 冲正，费率变化不影响历史。

### 17.4 提现

- 未完成 eKYC 可以获得收益但不能提现。
- eKYC 过期、银行账户未验证或姓名不一致时提现被拒绝。
- 低风险付款成功后账本闭环；失败回调原路解冻。
- 重复付款回调不重复扣账。

### 17.5 商户与运营

- 商户顶部和左侧入口可进入四个正式功能区。
- 收藏、候选、邀请、接受和 Claim 全链路可刷新恢复。
- 达人动态只出现有权限的 NeeDo Social 内容和脱敏里程碑。
- 榜单排除取消、退款、冲正和风控无效数据。
- 商户不能读取其他店铺精确 GMV、佣金和订单。
- 运营可以按平台到账本路径下钻并追溯费率版本。
- 中文、英文和日文入口文案正确，TEST 角标受配置控制。

## 18. 测试要求

每个微步骤至少包含：

- 纯规则和 Service 单元测试。
- Repository 与 Prisma 约束测试。
- API 鉴权、Zod、分页和 RBAC 集成测试。
- 预算、结算、冲正、恢复和提现账本测试。
- 并发、幂等和重复事件测试。
- 投影事件消费、重建和榜单排除测试。
- 前端 API 契约、交互、i18n 和权限测试。
- 正式前后端 build。
- 用户端、商户端和运营后台浏览器验收及截图证据。

测试通过不替代浏览器验收；浏览器页面能打开也不替代正式 API、数据库、账本和重启持久性证明。

## 19. 微步骤交付顺序

本设计批准后，由独立实施计划进一步拆分为可运行、可测试、可回滚的微步骤。推荐顺序：

1. 对齐现有联盟营销身份、`needoId`、AffiliateProfile 和外部主页链接。
2. 联盟主体、成员、权限、邀请和独立钱包。
3. 平台费规则、单店覆盖和任务预算双重冻结。
4. RewardAllocation、多钱包结算、冲正和恢复。
5. 达人收藏、候选和定向邀请。
6. 商户端达人广场与我的联盟营销。
7. Social 达人动态。
8. MetricEvent、统计投影和营销热榜。
9. 运营后台全平台监控、费率、联盟、风控和财务。
10. 三端真实账号端到端验收和 TEST 角标退出条件。

每次只执行一个微步骤。任何一步没有通过当前阶段验收，不进入下一步，不把未完成能力包装成已可用功能。
