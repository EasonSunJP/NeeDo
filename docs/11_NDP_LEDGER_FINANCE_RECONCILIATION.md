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
- 店铺策略已通过正式 API、RBAC、乐观锁和事务内审计持久化，但 **Booking/Ledger 尚未消费店铺策略**。在消费链路完成前，不得给真实测试店铺批量写入“关闭平台费”覆盖行。
- 下一微步骤必须在订单接单事务中保存费用金额、收费开关和承担者快照，并补齐：不收费时零冻结/零扣费、技师钱包承担、负余额与补款、7 天用户返点状态。完成这些后，才可继续实现暂停接单、普通用户单一 PENDING 替换、真实测试店铺策略 apply 和前端页面验收。
- 已应用迁移：`20260828233000_platform_fee_policy_foundation`。本地正式库对账结果为：当前 `booking_default` 1 行、平台费 500 NDP、用户返点 100 NDP、店铺策略覆盖 0 行；迁移前后钱包、余额、冻结、hold、账本、订单及订单财务计数保持一致。

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
