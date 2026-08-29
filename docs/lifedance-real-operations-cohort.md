# LifeDance 正式经营数据集：本地运行与验收记录

**验收日期：** 2026-08-28（Asia/Tokyo）
**数据集命名空间：** `lifedance_real_ops_v1`
**经营店铺：** `LifeDance Wellness 渋谷`（Shop ID `16`）

## 1. 数据性质与安全边界

本数据集写入 NeeDo 正式 Prisma/MySQL 表，并由现有 Auth、RBAC、`/api/v1/`、Booking、OrderFinancial、IM 与 Payroll 链路读取。账号、身份、排班、预约、履约、收入、工资单和付款记录均为数据库持久化记录，不是浏览器 mock、localStorage 或并行假 API。

人物姓名、工作聊天和经营场景是为测试而设计的合成内容，不对应或冒用现实个人。这里的“真实”指真实账号、真实数据库外键、真实业务状态机及刷新后仍存在的数据，不指现实个人资料或现实支付。

此 Seed 只允许本地或测试 MySQL：

- `NODE_ENV` 不得为 `production`；
- `DEPLOY_ENV` 只能为 `local` 或 `test`；
- MySQL 主机只能是 `localhost`、`127.0.0.1` 或 `::1`；
- 数据库名不得包含 `prod` 或 `production`；
- 必须显式设置 `ALLOW_SIMULATION_SEED=true`；
- 禁止在生产库运行，禁止将本地弱密码带入部署环境。

所需环境变量只列名称，不在本文记录值：

```text
DATABASE_URL
REDIS_URL
ADMIN_DEFAULT_PASSWORD
SIMULATION_DEFAULT_PASSWORD
NODE_ENV
DEPLOY_ENV
ALLOW_SIMULATION_SEED
```

## 2. 管理员与入口

正式管理员登录邮箱为 `admin@lifedance.com`。密码只存在于忽略跟踪的本地环境文件中，不得写入源码、本文、测试快照、命令行参数或账号导出。

管理员继续使用原 User 行、不可变 NeeDoID 和既有审计历史；旧邮箱 `admin@example.com` 已不再对应可登录账号。管理员拥有以下正式身份：

| 入口 | 推荐本地 URL | 正式身份 | 作用域 |
|---|---|---|---|
| 运营后台 | `/pf-admin.html#/login/admin` | `platform` | `global` |
| 商户后台 | `/merchant.html#/login/merchant-admin` | `merchant_owner` | LifeDance Shop `16` |
| 商户组织管理 | `/merchant.html#/login/merchant-admin` | `merchant_organization` | `lifedance-real-ops` MerchantAccount |
| 用户端 | `/user.html#/login/user` | `customer` | 管理员自己的客户档案 |
| 技师端 | `/technician.html#/login/technician` | `technician` | 管理员自己的私有技师档案 |
| 店铺端 | `/merchant.html#/login/merchant` | `merchant_owner` | LifeDance Shop `16` |
| 联盟营销端 | `/afirieito.html#/login/afirieito` | `scout` | `global` |
| 联盟管理后台 | `/afirieito.html#/login/afirieito-admin` | `scout` | `global` |

本地 Vite 开发服务器应使用上表中的入口 HTML 加 Hash 路由。直接打开 `/login/merchant-admin` 会让相对的 `portal-entry.js` 被解析为 `/login/portal-entry.js` 并返回 404；这属于开发服务器直达 URL 边界，不是账号、Auth API 或生产构建失败。

## 3. 迁移、生成与校验

在仓库根目录执行：

```bash
cd backend
ENV_FILE=.env.dev npm run prisma:status
ENV_FILE=.env.dev npm run prisma:migrate:deploy
npm run prisma:generate
ENV_FILE=.env.dev npm run migrate:lifedance-admin-ownership
npm run check:lifedance-admin-ownership
npm run seed:lifedance-operations
npm run check:lifedance-operations
```

幂等验收必须再运行一次最后两条命令：

```bash
cd backend
npm run seed:lifedance-operations
npm run check:lifedance-operations
```

`seed:lifedance-operations` 与 `check:lifedance-operations` 的 npm alias 已显式绑定本地环境门禁和 `.env.dev`。不得去掉门禁后另写宽泛 Seed。

本次数据库状态：37 个 migration，`migrate deploy` 无待应用 migration。经营数据 Seed 与 checker 连续运行两次，第二次业务计数与第一次一致。

## 4. 最终精确计数

最终 checker 两次均返回 `status: ok`，固定业务计数如下：

| 数据 | 数量 |
|---|---:|
| 店铺 / 店主 | 10 / 10 |
| 技师账号 | 100 |
| 客户账号 / 客户钱包 | 100 / 100 |
| 服务 | 30 |
| 排班时段 | 2,600 |
| 预约订单 | 1,957 |
| 订单状态历史 | 6,703 |
| 完成订单 | 1,398 |
| 取消 / 已确认 / 服务中 / 待确认 | 449 / 37 / 33 / 40 |
| 完成订单财务 | 1,398 |
| 服务收入合计 | JP¥13,828,250 |
| 通知 | 1,957 |
| 会话 / 消息 / 联系人关系 | 230 / 1,060 / 460 |
| Social 帖子 / 好友关系 | 3,225 / 3,870 |
| 薪酬档案 | 20 |
| PayRun / Payslip | 3 / 60 |
| LifeDance 订单工资明细 | 427 |
| PayoutRecord | 40 |
| 可导出的普通测试账号 | 214（不包含超级管理员） |

LifeDance 店铺单独校验：

- 员工恰好 20 人；技师 1–10 为 `FULL_TIME`（正社员），11–20 为 `TEMPORARY`（临时工）；
- 20 个员工会话、200 条日常工作消息、40 个双向联系人关系；
- 订单财务中 300 单为 `settled`，127 单为 `payroll_approved`；
- 2026 年 6 月、7 月 PayRun 已付款；8 月 PayRun 已批准但未付款；
- 40 条付款记录全部属于 6 月和 7 月工资单，8 月没有付款记录。

## 5. 代表订单全链路

以下记录由 Prisma 只读查询直接从本地 MySQL 取得，均属于 Shop `16`。

### 5.1 6 月正社员完成单

```text
BookingOrder 25501 / LD2026-000001 / COMPLETED / JP¥8,000
  → ScheduleSlot 36608 / BOOKED
  → OrderStatusHistory: PENDING → CONFIRMED → IN_SERVICE → COMPLETED
  → OrderFinancial 17249 / income=confirmed / settlement=settled
  → PayslipLine 491 / sourceType=order / sourceId=25501 / commission=JP¥1,600
  → Payslip 62 / paid
  → PayRun 5 / paid
  → PayoutRecord 42 / completed / JP¥242,800 / technicianConfirmedAt 非空
```

技师为佐藤 美咲，雇佣类型 `FULL_TIME`。PayoutRecord 金额是该技师整张月度工资单的支付额，不是单笔订单佣金。

### 5.2 7 月临时工完成单

```text
BookingOrder 25770 / LD2026-000270 / COMPLETED / JP¥12,300
  → ScheduleSlot 36878 / BOOKED
  → OrderStatusHistory: PENDING → CONFIRMED → IN_SERVICE → COMPLETED
  → OrderFinancial 17471 / income=confirmed / settlement=settled
  → PayslipLine 737 / sourceType=order / sourceId=25770 / hourly wage=JP¥2,250
  → Payslip 92 / paid
  → PayRun 6 / paid
  → PayoutRecord 72 / completed / JP¥15,750 / technicianConfirmedAt 非空
```

技师为吉田 拓海，雇佣类型 `TEMPORARY`。

### 5.3 8 月已批准未付款完成单

```text
BookingOrder 25519 / LD2026-000019 / COMPLETED / JP¥8,000
  → ScheduleSlot 36626 / BOOKED
  → OrderStatusHistory: PENDING → CONFIRMED → IN_SERVICE → COMPLETED
  → OrderFinancial 17264 / income=confirmed / settlement=payroll_approved
  → PayslipLine 811 / sourceType=order / sourceId=25519 / commission=JP¥1,600
  → Payslip 102 / approved
  → PayRun 7 / approved
  → PayoutRecord: 0
```

### 5.4 取消单

```text
BookingOrder 25502 / LD2026-000002 / CANCELLED / payment=PENDING / JP¥0
  → ScheduleSlot 36609 / AVAILABLE（库存已释放）
  → OrderStatusHistory: PENDING → CANCELLED
  → OrderFinancial: 0
  → PayslipLine(orderId=25502): 0
```

## 6. 浏览器验收

本地服务：Backend `http://127.0.0.1:3000`，Frontend `http://127.0.0.1:5180`。`/api/v1/health`、`/api/v1/ready` 和前端代理健康检查均返回成功。

已确认：

- 旧邮箱通过正式登录返回通用 `error.auth.invalid_credentials`；
- 新邮箱在运营后台、商户后台、用户端、技师端、店铺端、联盟营销端和联盟管理后台均登录成功；
- 运营后台退出后重新登录成功；
- 用户端未显示后台红名、内部备注或 `backofficeTags`；
- `/admin/merchants` 显示 `LifeDance Wellness 渋谷` 和 20 名技师；
- `/admin/technicians` 显示 100 名公开经营技师，管理员私有技师档案单独显示且不占 LifeDance 的 20 人；
- `/admin/orders` 显示数据库订单；
- `/admin/finance` 显示 LifeDance 6 月、7 月已付和 8 月已批准工资周期；
- `/merchant-admin/people` 显示 LifeDance 正式员工邮箱及“正社员 / 临时工”数据库字段；
- `/merchant/contacts/organization` 的“正社员”和“临时工”筛选各显示 10 人；组织标签直接来自正式 `employmentType`，不再把临时工硬编码为正社员；
- `/merchant/messages/2557` 显示与临时工吉田 拓海的 10 条持久化工作消息，内容覆盖下周排班、上门预约、物资补充、完单确认和工资单确认；
- 正社员账号 `sim.tech.001@needo.local` 与临时工账号 `sim.tech.011@needo.local` 均可登录技师端；正式排班页只渲染数据库排班库存，不再混入旧日程或旧状态记录；
- 两个抽查技师的工资页均显示 LifeDance 三个工资周期、订单行项目、6–7 月已支付和 8 月已批准未支付状态；
- 联盟管理后台进入 `/NDA-admin`，联盟营销端进入 `/afirieito`。

自动化在一分钟内快速切换大量后台路由时触发了正式全局限流（本地配置窗口 60 秒、上限 100 个请求），页面正确显示 `error.rate_limited`，没有回退到假数据。浏览器低频重试和数据库 checker 用于完成数据验收；不得通过关闭限流来让验收脚本“变绿”。

## 7. 回滚与重跑边界

- 不使用 `prisma migrate reset`、全库清空或手写宽泛 SQL。
- Seed 的幂等清理只识别稳定订单前缀、记录键和 metadata 中的 `namespace=lifedance_real_ops_v1`，并按外键顺序重建该数据集。
- 如果需要完整撤销本地经营样本，应先保存数据库快照，再使用专用、经审查的命名空间清理工具；当前没有授权执行永久删除。
- 管理员原位迁移保留 User ID、NeeDoID 与审计链，不能通过删除管理员行来“回滚”。账号回退必须另做经过批准的原位身份迁移并撤销会话。

## 8. 交付状态

| 阶段 | 状态 |
|---|---|
| 本地实现 | 已完成 |
| 本地 migration / Seed / checker | 已完成，checker 连续两次通过 |
| 自动化 lint / test / build | 已完成并通过 |
| 本地浏览器验收 | 已完成；高频切页触发限流的边界已记录 |
| Git 提交 | Gate A–E 已提交；本文单独提交 |
| 推送远端 | 未执行 |
| 部署 | 未执行 |
| 生产数据变更 | 未执行，禁止使用本地弱密码 |
| 生产验收 | 未执行 |
