# 联盟任务大厅、领取与专属推广链接设计

## 1. 微步骤目标

本微步骤实现联盟营销正式化计划中的第 3 个子步骤：任何状态正常且拥有联盟任务大厅权限的 NeeDo 登录用户，可以读取当前可领取任务、领取任务，并持续查看属于自己的唯一优惠码和签名推广 URL。

本步只建立“任务大厅 → 领取 → 专属码/链接 → 链接解析”的正式后端闭环。Checkout 归因、顾客优惠计算、服务完成返点、任务暂停/结束和三端 UI 均留在后续独立微步骤。

## 2. 已确认约束

- 不建设独立 NDA 账号体系、钱包、数据库或后台。
- 领取者只从当前 Access Token 的 `userId` 取得，客户端不能指定领取用户。
- 同一用户对同一任务只有一个未删除 Claim；重复请求必须返回原 Claim，不能生成第二个优惠码或 URL。
- 商户、店铺员工、技师、普通用户、运营等正常账号均可领取；角色本身不构成禁止条件。
- 发布者领取自己的任务不在本步禁止，后续订单归因仍必须禁止领取者对自己的订单进行自我归因。
- 只生成“服务完成后固定 NDP 返点”任务的推广凭证，本步不产生任何返点或钱包余额变化。
- Claim、优惠码和 URL 不因刷新、重新登录或重复领取而重新生成。

## 3. 架构选择

新增独立的 `AffiliateMarketplaceService` 与 `AffiliateMarketplaceRepository`，不继续扩大负责发布、预算冻结和运营审核的 `AffiliateTaskService`。

```text
Affiliate marketplace Route
  → Affiliate marketplace Controller
  → AffiliateMarketplaceService
      - 任务公开可见性与领取资格
      - 当前用户 Claim 幂等
      - 优惠码与签名链接生成/解析
  → AffiliateMarketplaceRepository
      - Prisma 查询、事务、行锁与 AuditLog
  → MySQL
```

该边界让后续 Checkout 归因直接复用链接解析结果，而不依赖商户发布端的权限和视图模型。

## 4. 可领取任务规则

新 Claim 必须同时满足：

1. 任务未软删除，状态为 `scheduled` 或 `active`。
2. 当前时间满足 `claimStartsAt <= now < claimEndsAt`。
3. 当前时间早于 `taskEndsAt`。
4. 任务存在状态为 `active` 的预算冻结记录。
5. `totalFrozenNdp - allocatedNdp - capturedNdp - releasedNdp` 不少于一笔 `rewardNdpPerCompletedOrder`。
6. 任务至少有一个未软删除店铺快照和一个未软删除服务快照。

允许 `scheduled` 状态是因为领取窗口可以早于正式服务执行窗口。GET 不隐式修改任务状态，避免只读接口产生难以审计的写入。

重复领取时先查找当前用户已有的未删除 Claim：存在则幂等返回原 Claim，即使任务后来暂停或领取窗口已经关闭，也不重新签发凭证。不存在时才执行上述新领取校验。

## 5. 优惠码与推广链接

### 5.1 优惠码

- 格式使用 NeeDo 前缀和不易混淆的随机字符，例如 `NDO-7K4M9X2P8Q`。
- 使用加密安全随机数，不使用用户 ID、任务 ID、时间戳或自增 ID直接拼接。
- 依赖数据库 `publicCode` 唯一索引兜底；发生极低概率碰撞时在限定次数内重新生成。
- 优惠码是公开推广凭证，不包含领取者姓名、邮箱或内部 userId。

### 5.2 签名 URL

推广 token 格式为：

```text
<publicTokenId>.<signature>
```

- `publicTokenId` 是随机公开查找标识，不包含业务 ID。
- `signature` 使用独立 `AFFILIATE_LINK_SECRET` 做 HMAC-SHA256，签名内容固定包含版本、Claim ID、任务 ID、领取用户 ID、公开标识和失效时间。
- 数据库存储 `publicTokenId` 和完整 token 的 SHA-256 `tokenHash`，不存储签名密钥。
- 返回 Claim 时可根据持久化字段和服务端密钥确定性重建同一个 token，因此刷新页面仍能复制同一条 URL。
- 解析时先按 `publicTokenId` 查询，再用常量时间比较校验签名和 `tokenHash`；无效、篡改、过期或已撤销链接统一返回稳定的无效链接错误，避免枚举内部记录。
- `AFFILIATE_PUBLIC_BASE_URL` 由环境配置提供，表示联盟前端根地址；服务端去掉末尾 `/` 后固定生成 `${baseUrl}/r/${encodeURIComponent(publicToken)}`。正式环境要求 HTTPS，代码不硬编码域名或端口。
- 密钥、签名输入、`tokenHash` 不写入 API 响应、AuditLog 或普通日志。

Claim 的 `expiresAt` 使用 `taskEndsAt`。`claimEndsAt` 只限制新用户何时还能加入，已领取用户的推广凭证可以持续到任务结束。

## 6. API 合同

所有受保护接口使用正式 JWT、RBAC、Zod、统一响应结构、OpenAPI 和服务端分页。

### 6.1 任务大厅

- `GET /api/v1/affiliate/tasks`
  - 权限：`page:affiliate-marketplace`
  - 支持 `keyword`、`shopId`、`serviceId`、`customerDiscountType`、`page`、`pageSize`。
  - 只返回当前可领取任务；排序固定为即将结束优先、创建时间倒序、ID 倒序。
- `GET /api/v1/affiliate/tasks/:taskId`
  - 权限：`page:affiliate-marketplace`
  - 只读取当前可领取的公开详情。

公开任务视图包含任务名称、说明、封面引用、固定返点 NDP、顾客优惠规则、时间窗口、店铺/服务快照、归因天数和每人/每顾客完成上限。它不暴露发布者钱包、冻结交易、运营审核人、内部预算流水或精确剩余钱包余额。

### 6.2 领取与我的任务

- `POST /api/v1/affiliate/tasks/:taskId/claims`
  - 权限：`button:affiliate-claim`
  - 请求体为空；领取者来自当前身份。
  - 首次创建返回 `201`，幂等重复返回 `200`。
- `GET /api/v1/affiliate/claims`
  - 权限：`page:affiliate-marketplace`
  - 只分页返回当前用户 Claim；支持 `status`、`page`、`pageSize`。
- `GET /api/v1/affiliate/claims/:claimId`
  - 权限：`page:affiliate-marketplace`
  - 只允许当前用户读取自己的 Claim，越权统一按 not found 处理。

Claim 响应包含 `publicCode`、`promotionUrl`、领取时间、失效时间、有效状态、现有聚合计数和公开任务摘要；不返回 `activeKey`、`tokenHash` 或其他用户信息。

### 6.3 链接解析

- `GET /api/v1/affiliate/resolve/:publicToken`
  - 不要求登录，供后续落地页和 Checkout 使用。
  - 本步只校验链接并返回公开的 Claim/任务/店铺/服务落地上下文。
  - 不创建 `AffiliateTouch`、不增加点击数、不形成归因；这些写入属于 Checkout 归因微步骤。
  - 响应不包含领取者姓名、邮箱、内部 userId、预算或钱包数据。

## 7. 事务与并发

首次领取在一个数据库事务内完成：

1. 锁定目标任务行。
2. 查询并返回当前用户已有 Claim。
3. 重新校验任务时间、状态、范围快照和预算冻结记录。
4. 创建 Claim，写入 `activeKey = taskId:userId`、唯一优惠码、公开 token ID、token hash 和 `expiresAt`。
5. 写入 `affiliate.claim.created` AuditLog，目标为新 Claim，metadata 只记录任务 ID和公开码，不记录 token。

数据库唯一索引继续作为并发最终防线。同一用户并发领取时，一个事务创建成功，另一个事务读取并返回同一 Claim；不能向客户端暴露 Prisma 原生异常。

本步不锁钱包、不分配返点额度、不修改 `allocatedBudgetNdp`，因为 Claim 只是取得推广资格，真正的单笔预算占用发生在后续订单归因事务。

## 8. 错误处理

- 不存在或非公开任务：`404 error.affiliate.task_not_found`。
- 任务暂停、领取窗口关闭、预算不足一笔或冻结记录无效：`409 error.affiliate.task_not_claimable`。
- Claim 不属于当前用户：`404 error.affiliate.claim_not_found`。
- 链接篡改、过期、撤销或不存在：`404 error.affiliate.link_invalid`。
- 优惠码/token 极低概率连续碰撞：稳定 `409 error.affiliate.claim_conflict`，完整事务回滚。
- 未登录、账号已停用或缺少 RBAC 权限继续使用现有 Auth/RBAC 错误。

## 9. 数据模型与配置

本步复用已经迁移的 `AffiliateTask`、`AffiliateTaskShop`、`AffiliateTaskService`、`AffiliateBudgetReservation` 和 `AffiliateClaim`，预计不新增 migration。

新增后端配置：

- `AFFILIATE_LINK_SECRET`：至少 32 字符，正式环境不得使用占位值，且必须与 Access/Refresh Token 密钥不同。
- `AFFILIATE_PUBLIC_BASE_URL`：联盟落地页基地址；正式环境必须为 HTTPS。

同步更新 dev/staging/prod 示例环境文件与生产安全测试，不把真实密钥写入仓库。

## 10. 测试与验收

测试先行覆盖：

- 任务大厅只返回当前可领取任务，并按店铺、服务、优惠类型、关键词分页过滤。
- 草稿、待审核、暂停、结束、领取窗口外、无有效冻结预算和预算不足一笔的任务不可新领取。
- scheduled 任务在领取窗口内可领取。
- 所有正常角色均通过既有 RBAC seed 获得领取权限，停用账号由 Auth 拦截。
- 首次领取生成唯一优惠码和签名 URL。
- 重复和并发领取返回同一 Claim，不生成第二个码或链接。
- 用户只能查看自己的 Claim。
- URL 可在刷新后的 Claim 详情中确定性重建，签名篡改、过期和撤销均解析失败。
- API 不返回 `tokenHash`、`activeKey`、领取者身份或发布者钱包信息。
- Claim 创建写入 AuditLog，且不记录完整 token。
- 本地非生产 MySQL 验收脚本验证真实唯一索引、事务、幂等、签名解析和精确清理。
- backend lint、全量 test、build，frontend lint、全量 test、formal build 通过。

## 11. 非目标

- 不实现 AffiliateTouch 或点击计数写入。
- 不实现优惠码校验、Checkout 价格计算或 Booking 归因。
- 不占用单笔返点预算，不结算或冲正 NDP。
- 不实现任务暂停、继续、结束或预算追加。
- 不实现商户、店铺、用户或运营 UI。
- 不新增演示任务、假领取、假点击、假收益或浏览器业务状态。
