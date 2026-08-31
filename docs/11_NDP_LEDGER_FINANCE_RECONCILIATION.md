# 11 — NDP 钱包账本与财务对账

> 本文档用于指导 Codex 执行 Step 11。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

实现 NDP 钱包、冻结、解冻、扣费、返点、违约赔付和财务对账，连接 Booking 完单与取消。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/10_BOOKING_SCHEDULE_ORDER_STATE_MACHINE.md`

---

## 3. 本步必须做

- 设计 Wallet、WalletLedger、LedgerEntry、LedgerTransaction、FinanceReconciliation，并在规则驱动优化中补齐 fee rules、fee calculation logs、wallet holds 与 order financials。
- 实现 1 NDP = 1 JPY 的整数点数账本。
- Booking 接单按当前激活费用规则冻结 B 端 NDP；默认 seed 保持 500 NDP。
- Booking 取消时解冻。
- Booking 完单时按锁定规则扣 B 端平台费，并按用户返点规则给 C 端返 NDP；默认 seed 保持扣 500 NDP、返 100 NDP。
- B 端强行取消时按 penalty/compensation 规则从 hold 中赔付 C 端；默认 seed 保持 500 NDP。
- 实现幂等键、事务、审计。
- 提供财务导出基础 API。

---

## 4. 本步禁止做

- 不要接 Stripe 充值。
- 不要做会员订阅。
- 不要做 Request 前端。
- 不要绕过 ledger 直接改余额。

### 4.1 平台使用费策略地基（2026-08-29）

- `booking_default` 是 Booking 平台使用费与用户返点的受管规则族；旧通用费用规则接口不得修改或暂停该规则族。
- 修改全局平台使用费金额时，必须关闭当前有效版本并完整复制规则、阶梯和时段到下一版本，旧版本不得覆写。Booking 平台使用费在完单 capture 时按订单 `acceptedAt` 选择有效版本，不按 `completedAt` 追溯新价格。
- 店铺未持久化 `ShopPlatformFeePolicy` 时，有效缺省值固定为：收费开启、承担者为店铺、策略版本 0。运营只能修改店铺是否收费；当前店铺或商户集团身份只能修改其有权管理店铺的承担者。
- Booking/Ledger 已在订单确认事务中消费店铺策略，并保存费用金额、收费开关、全局/店铺版本、承担者和实际钱包快照。关闭收费时零冻结、零扣费且用户返点为 `DISABLED`；技师承担使用其用户全局钱包，换店不改变既有负债。
- 余额不足第一次确认返回结构化 409 且零写入；只有携带匹配预览与唯一确认键的人工二次确认才允许完整冻结并形成负余额。取消按原钱包返还；完单按快照结算。只有审核通过的充值按接单时间 FIFO 抵扣欠费，并在 7×24 小时内一次性补发 100 NDP；到期 worker 只把仍为 `PENDING` 的返点改为 `EXPIRED`，之后补交不再补发。
- 已应用迁移：`20260828233000_platform_fee_policy_foundation`。本地正式库对账结果为：当前 `booking_default` 1 行、平台费 500 NDP、用户返点 100 NDP、店铺策略覆盖 0 行；迁移前后钱包、余额、冻结、hold、账本、订单及订单财务计数保持一致。
- 已应用迁移：`20260829010000_booking_platform_fee_debt_reward`。应用前后均为：钱包 107、可用余额合计 507,000 NDP、冻结余额 0、WalletHold 0、账本交易 103、账本明细 103、Booking 20,472、OrderFinancial 1,399；原平台费 hold 合计 500、实际平台费 699,500、用户返点 27,700，均未变化。新增缺口、欠费和返点资格合计均为 0，迁移后状态为 up to date。
- `check:booking-platform-fee-debt-flow` 在真实本地 MySQL 中创建并清理 7 个标记用户、9 个店铺和 10 个预约，已通过关闭收费、店铺/技师承担、首请求整体回滚、连续负余额欠费守恒、取消返还、即时返点、审核充值后延迟返点、过期不补发和幂等重放。验收用数据库屏障分别强制“完单先锁”和“充值先锁”：结算按钱包→OrderFinancial 顺序加锁，欠费/到期处理用单条 `SELECT ... FOR UPDATE` 读取当前行，返点截止判断统一使用 MySQL `CURRENT_TIMESTAMP(3)`；清理后全库聚合基线完全一致。
- 既有正式数据复核通过：三个月数据为 210 个账号、10 店、100 技师、100 用户、1,957 个历史预约；未来六个月为 41,193 个时段和 18,513 个预约，技师重叠、用户重叠、重复订单号、无效关系与未来终态订单均为 0。
- 尚未在本微步骤执行：集团/店铺暂停接单、普通用户单一 `PENDING` 替换、72 名多订单用户 `black` 资格 dry-run/apply、真实测试店铺批量 `feeEnabled=false`、运营/商户/技师/用户端页面和浏览器验收。

本地迁移与验收命令：

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run check:booking-platform-fee-debt-flow
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run check:simulation-data
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run check:future-operations
```

### 4.2 会员卡 NDP 返点方案地基（2026-08-31）

- 会员权益不提供折扣、实物礼物、赠送服务或赠送次数；所有奖励统一表达为 NDP 返点。
- 店铺可配置三类基础返点：每次完成固定 NDP、按符合条件金额比例返点、每满指定消费金额返固定 NDP；可叠加首次用卡、指定服务范围、完成次数里程碑、消费金额里程碑、生日月、指定时段和连续活跃月奖励。
- 每条规则可限制服务/分类范围、排除项与生效区间；方案还支持单笔、单日、单月和生命周期 NDP 上限。服务范围引用必须属于当前 JWT 店铺。
- 方案发布时保存平台费率不可变快照。默认平台费率为 10%（1000 bps）；客户应得 1000 NDP 时，平台费向上取整为 100 NDP，未来结算节点从店铺钱包合计扣 1100 NDP。
- 保存或发布规则不会冻结钱包。真正完成服务并命中返点规则时，后续结算微步骤才按已发布版本快照扣除；余额不足应登记待结算负债并在未来充值节点处理，不允许绕过账本直接改余额。
- 本微步骤只建立方案、规则、费率版本、RBAC、审计和服务端试算，没有接入开卡、充值、核销、退款或实际 NDP 账本写入。上述行为必须分别作为后续独立微步骤实现并复用这里的已发布版本。
- 已应用迁移：`20260831150000_shop_membership_card_rule_configuration` 与 `20260831151000_membership_reward_fee_policy_utc_bootstrap`。后者只纠正非 UTC MySQL 会话下初始费率时间，不修改已应用 migration 历史。
- `check:shop-membership-card-plan-flow` 在本地 `needo_dev` 的真实事务中验证十类规则、跨店隔离、发布快照、费率新版本与审计；试算为客户 1000、平台 100、店铺合计 1100 NDP。事务故意回滚后，费率、方案、版本、规则、会员卡、钱包、账本交易、账本明细和审计计数均为 0 变化。

本地迁移与验收命令：

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run check:shop-membership-card-plan-flow
```

### 4.3 会员卡正式发卡（2026-08-31）

- 店铺负责人或管理员可使用 `shop.member.card.issue`，从当前店铺的有效会员和仍启用的当前已发布方案正式发卡；`merchant_staff` 默认保持只读。会员、方案和版本均由后端再次按 JWT 店铺范围校验。
- 储值卡把线下已确认的初始本金同时写入 `initialPrincipalJpy` 和当前本金余额，赠送余额固定为 0；次卡把初始次数同时写入 `initialUses`、剩余次数和总次数；权益卡不写金额或次数。有效期严格由发布版本计算，客户端不能覆盖。
- 每张新卡保存方案、方案版本、操作人、开卡来源、初始值、平台费率和幂等指纹快照。卡、`merchant.shop_membership_card.issue` 审计和用户 `SYSTEM` 通知在同一事务中写入；相同幂等键和相同内容返回原卡且不重复通知，内容变化则返回冲突。
- 发卡只是登记线下付款或历史卡的最终初始状态，不是线上充值或返点节点。本步骤不改店铺/客户 NDP 钱包，不创建 `LedgerTransaction` 或 `WalletLedger`；方案中的平台费只在以后实际完成服务并发生返点时扣除。
- 已应用 migration：`20260831160000_shop_membership_card_issuance`。物理库已独立确认 11 个新增快照字段、3 个 CHECK、3 个外键和开卡幂等唯一索引，并确认默认授权只有 `admin`、`merchant_owner`。
- `check:shop-membership-card-issuance-flow` 在本地 `needo_dev` 的真实事务中验证储值卡 5000 JPY、次卡 4 次和权益卡三种发卡，验证有效期、1000 bps 费率快照、3 条审计、3 条通知、幂等重放和变更冲突；钱包与 NDP 账本不变，事务主动回滚后全库保护基线完全一致。

本地验收命令：

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run check:shop-membership-card-issuance-flow
```

---

## 5. 交付物

- `Wallet/Ledger Prisma models`
- ledger service
- wallet APIs
- finance reconciliation APIs
- Booking 与 ledger 集成
- `tests/ledger*.test.ts`
- `docs/ledger.md`

---

## 6. 验收标准

- [ ] 所有余额变化都有 ledger。
- [ ] 冻结/解冻/扣费/返点事务一致。
- [ ] 重复回调或重复请求不会重复扣费。
- [ ] Booking 完单自动结算。
- [ ] 财务流水可分页查询和导出。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md。本次只执行 Step 11：NDP 钱包账本与财务对账。请实现 Wallet、WalletLedger、LedgerTransaction、冻结、解冻、扣费、返点、违约赔付、幂等键、事务和审计。请将 Booking 接单/取消/完单与 ledger service 打通：接单按费用规则冻结 B 端 NDP，取消解冻，完单按规则扣 B 端平台费并按规则给 C 端返点。默认 seed 保持历史 500 NDP 平台费与 100 NDP 用户返点。不要接 Stripe，不要做会员订阅，不要开放 Request 前端。完成后运行 migration、lint、test、build，并更新 docs/ledger.md。
```

---

## 8. 完成后必须回复的内容

Codex 完成本步后，必须输出：

1. 本次修改的文件清单。
2. 新增或修改的接口清单。
3. 新增或修改的数据表 / migration 清单。
4. 运行过的命令和结果。
5. 已通过的验收项。
6. 未完成项与原因。

若某项没有完成，必须明确说明，不得假装完成。
