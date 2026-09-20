# AGENTS.md — NeeDo Repository Operating Guide

> 仓库级宪法、导航和不可妥协约束。详细规则按需读取 [`docs/REPOSITORY_OPERATING_GUIDE.md`](docs/REPOSITORY_OPERATING_GUIDE.md)。

## 1. 优先级与事实来源

1. 用户当前明确要求和任务边界。
2. 执行目录中更近的 `AGENTS.override.md` / `AGENTS.md`（如存在）。
3. 本文件。
4. 当前代码、测试、配置、migration 与相关正式领域文档。
5. 历史计划、审计、完成记录和旧 demo。

以当前可运行代码和配置确认技术事实；“计划”“建议”“待完成”不等于已实现。文档过时不得降低安全、权限、审计、账本或数据一致性要求。

## 2. 当前仓库基线

- 前端：React 19、TypeScript strict、Vite 7、React Router、Tailwind、Vitest；保留现有多 HTML 入口与共享 React 应用。
- 后端：`backend/` 下的 Node.js（`package.json` 要求 `>=22`）、Express、TypeScript、Prisma/MySQL、Redis、Zod、OpenAPI、Jest/Supertest。
- 正式本地入口：`npm run dev` / `npm run dev:formal`；默认前端 `5180`、client API `3000`、operations API `3001`、merchant API `3002`，可由环境变量覆盖。
- 正式数据来自 API、Prisma 与数据库。遗留 mock/local state 只可按 `docs/MOCK_RETIREMENT_MAP.md` 受控保留，禁止扩张或成为新功能真值。
- 当前有 PWA manifests、standalone/viewport 处理和客户端持久缓存；没有 Service Worker、`ios/`、`android/` 或 Capacitor 依赖。规划文档不是已落地能力。
- 当前 locale：`zh`、`zh-Hant`、`ja`、`en`、`ko`。

依赖版本、脚本、入口和运行方式以当前 package、lockfile、构建和部署配置为准。

## 3. 最小阅读与导航

不要无差别读取整个大型 `README.md` 或全部 `docs/`。先读本文件、任务涉及的实现/类型/测试，以及详细指南中的对应章节。

| 任务 | 主要文档 |
|---|---|
| 运行、环境、部署 | `README.md` 相关段落、`docs/environment.md`、`docs/deployment.md` |
| 路线与正式化边界 | `docs/00_MASTER_MICRO_STEP_PLAN.md`、对应编号文档；先核实是否已被后续实现取代 |
| Auth / Account / RBAC | `docs/User Management.md`、`docs/security.md`、`docs/api.md` |
| Database / Migration | `docs/database.md`、`backend/prisma/schema.prisma`、相关 migration |
| Booking / Schedule / Order | `docs/order-state-machine.md`、`docs/10_BOOKING_SCHEDULE_ORDER_STATE_MACHINE.md` |
| NDP / Wallet / Finance | `docs/ledger.md`、`docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md` |
| IM / Social / Notification | `docs/realtime.md`、`docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md` |
| Performance / Release | `docs/performance.md`、`docs/production-release-checklist.md` |
| Web / PWA / future native | `docs/REPOSITORY_OPERATING_GUIDE.md`；计划必须标明“已实现”或“仅计划” |

先用 `rg` 定位相关章节，仅在任务真正跨域时扩大阅读。

## 4. 标准执行循环

1. 将请求转为可观察的验收条件，并明确不做什么。
2. 检查 `git status --short`、相关实现、调用链、数据权威、既有组件/工具和测试；现有改动属于用户或其他任务，不得覆盖或顺手提交。
3. 共享业务先建立简短 Cross-Surface Impact Map；bug 先补可复现失败或回归测试，再做最小修复。
4. 复用现有架构；先搜索再新增依赖、组件、service、repository、adapter、cache 或抽象。
5. 先跑聚焦测试，再按影响扩大到 lint、typecheck、build、集成/API、浏览器或设备验证。
6. 复查 diff，清理自己的 fallout；最终分别报告代码、测试、运行时、浏览器、设备、push 和部署状态。

任务明确时持续执行。只在真实产品歧义、敏感凭据/权限、付费动作、不可逆数据风险、远程/生产操作或用户要求的审批点暂停。

## 5. 不可妥协约束

- 一次只完成一个可运行、可测试、可回滚的微步骤；不得爆发式重构或越过未满足的领域前置条件。
- 每一行变更必须服务当前请求或维持其正确性；不重构、格式化、删除或提交无关内容。
- 保留 React/TSX/Vite、多入口、路由与主题；未经明确批准不得迁移框架或引入 Capacitor、React Native、Flutter。
- 不新增 mock、fake API、静态价格、fake admin、免登录捷径或内存持久化来替代正式数据。
- 后端遵守现有 `Route → Controller → Service → Repository → Prisma/Database`；信任边界使用现有验证，受保护接口保留身份范围、RBAC、分页、稳定错误和必要审计。
- schema 变化必须新增并审查 migration；不得手改已应用 migration。软删除、不可变历史或物理删除按现有领域模型，不用通用规则强改所有表。
- Booking、NDP、支付、退款、佣金、结算使用既有整数最小单位/Decimal 约定，并具备事务、幂等、并发保护、重试语义、审计和来源引用。
- 禁止在 API、日志、缓存、文档或前端产物泄漏 password、OTP、token、secret、raw eKYC 或其他私密数据。
- 疑似死代码/资产先审计 static/dynamic/runtime/database 引用、构建、migration、平台入口和回滚；清理必须可恢复。
- 不主动 commit、push、deploy、运行远程 migration、写生产数据、上传商店或购买资源，除非用户明确授权当前动作。

## 6. Cross-Surface Impact Map

Booking、Request、Schedule、Order、NDP、Wallet、Payment、Refund、Commission、Settlement、Pricing、Account、Role、Permission、IM、Social、Notification 的行为、状态或契约变化，至少检查：

```text
Actor/action
→ User / Technician / Shop / Merchant Admin / Operations
→ API + Auth/RBAC
→ Service/state machine/transaction
→ Database/ledger/audit
→ Cache/invalidation/realtime/notification
→ report/reconciliation/rollback
```

标明“受影响 / 确认不受影响 / 未验证”。共享状态以服务端为权威；禁止当前页面显示成功而其他端、账本、排班、通知或后台仍错误。

## 7. Web-first、缓存与本地化

- 保护 desktop、mobile web 和现有 PWA；复用 breakpoint、max-width、safe-area、dynamic viewport、keyboard、scroll 与 header 设施，核心操作不得依赖 hover。
- 相关 UI 至少覆盖 320–375、390–430、768–1024、1280+ 和更宽桌面；浏览器模拟不等于 installed PWA 或真机验收。
- 原则是 **Local-first for UX, server-authoritative for transactions**。有效缓存先渲染、后台增量刷新；不得清空可用内容、重置输入/滚动/选择或每次全量 refetch。
- 缓存按账号/身份隔离，并处理 schema/version、TTL、容量/淘汰、损坏、换号/退出/删号。Booking、Wallet、Payment、Refund、RBAC、eKYC 和最终 Order 状态必须由服务端确认。
- 离线不得伪造交易成功或静默排队/重放 mutation。未来 Service Worker 必须独立设计版本、更新、回退和 Old JS/New API 兼容，禁止永久缓存全部内容。
- Store-sensitive 功能开发或 release 前重新核对 Apple/Google 当时最新规则；固定原则是最小权限/数据、明确 consent、secure storage、账号/数据删除和第三方 SDK 合规。
- 新文案进入现有 i18n 并覆盖当前五个 locale。非本地化任务发现的翻译、术语、截断或 typo 不顺手改，记录到 [`docs/LOCALIZATION_ISSUES.md`](docs/LOCALIZATION_ISSUES.md)；仅安全、法律、支付、隐私、权限、consent、删号或 Store 合规问题阻断当前任务。

完整 PWA/native readiness、cache-first、prefetch、Booking snapshot、弱网、server pressure、dependency 与财务规则见详细指南。

## 8. 验证与证据边界

按影响选择，不机械跑全仓，也不跳必要门禁：

```bash
# frontend / repository
npm run lint
npm test -- <path-or-pattern>
npm run build
npm run verify:production-build

# backend
npm --prefix backend run lint
npm --prefix backend test -- --runTestsByPath <related-tests>
npm --prefix backend run build

# guarded local database flow only
ENV_FILE=.env.dev npm --prefix backend run <check:domain-flow>
```

- 使用现有 12-shard backend runner；不得因资源问题跳过或弱化测试。
- UI/交互补真实浏览器验证；PWA/键盘/native 声明需要对应设备证据。
- 运行时先证明 listener PID、cwd/worktree、branch/commit、proxy，再检查 health/ready 和受保护业务链路；health/ready 不证明交易成功。
- 本地代码通过、local main merge、push、deployment、staging、browser acceptance、device acceptance 是不同状态，禁止相互推断。
- 纯文档任务验证链接、命令、事实与 diff；不为形式运行无关全量测试。

## 9. 完成标准

- 请求行为与相关回归已验证，最终集成状态没有因当前改动破坏。
- 没有新增假实现、重复状态源、第二套业务系统、未授权依赖或无必要抽象。
- 权限、交易、审计、缓存隔离和隐私未被削弱。
- 当前事实、历史证据、计划与未验证项使用明确时态；最终报告列出修改文件、命令结果、未验证项、风险和回退。

核心原则：**先理解，复用后新增；选择最小正确方案；以正式数据和真实证据验证；在真实阻塞前持续完成。**
