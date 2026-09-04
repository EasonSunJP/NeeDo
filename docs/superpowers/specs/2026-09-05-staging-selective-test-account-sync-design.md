# NeeDo Staging 测试账号选择性同步与注册关闭设计

## 1. 状态与目标

- 日期：2026-09-05
- 状态：实施计划已确认，待执行
- 源数据库：本地 `needo_dev`，仅读连接 `127.0.0.1:3307`
- 目标环境：AWS 账号 `430611185505`，`ap-southeast-2`，`staging.needo.life`
- 目标：将本地当前有效账号作为 Staging 测试账号同步，保留可登录凭据与身份切换所需的直接账号资料；同时临时关闭 Staging 注册入口和注册 API。

## 2. 已验证现状

本设计基于 2026-09-05 的实时只读预检：

- 当前执行基线：本地共有 252 条 `users` 记录，其中 251 条未软删除且全部启用；此前 261/262 为历史快照。
- 251 个有效本地账号全部具有密码哈希和邮箱验证时间，并已标记 `is_test_account=true`。
- Staging 当前只有 1 个未软删除、已启用的 bootstrap 管理员账号 `yisun0316@gmail.com`。
- Staging bootstrap 管理员的标准化邮箱与本地 251 个有效账号无冲突。
- 原预检两端均有 125 个已完成且未回滚的 Prisma migration。执行时本地新增了未合并的 `20260903100000_exchange_matched_booking_conversion`，源 126、目标 125。
- 用户在确认 11 张同步表的字段、索引、外键规范化比较无差异后，批准仅放行这一个源端额外 migration（SHA-256 `ecae7c8e14424f4d35def9fa51bffc1ca7292270db54b58d58545c471e7148f2`）。其他 125 条迁移名称及校验值必须逐一一致；任何其他缺失、额外、重复或校验值差异仍拒绝。不得发布该 Exchange 功能或修改目标迁移历史。

该预检不等于写入授权。实施前必须重新执行同样的身份、数量、schema 和冲突检查。

## 3. 采用方案

采用“选择性账号图同步”，不重跑 Seed，不克隆整个本地数据库。

### 3.1 保留对象

- 保留 Staging `users` 账号表中的 bootstrap 管理员 `yisun0316@gmail.com`，沿用其现有主键、密码哈希、身份和管理员角色，不创建同邮箱重复账号。
- 将本地 251 个未软删除账号全部新增到 Staging `users` 账号表。
- 同步后 Staging `users` 账号表预期共有 252 个未软删除有效账号：251 个本地测试账号加 1 个既有 `yisun0316@gmail.com` 管理员账号；252 个账号全部标记为测试账号。
- 本地那 1 条已软删除账号不进入 Staging。

### 3.2 同步数据范围

仅同步使账号可登录、可切换正式身份、可显示基础资料的账号图：

- `users`：邮箱、手机、NeeDo ID、账号编号、密码哈希、验证状态、用户名、头像 URL、启用状态和注册时间。
- `user_identities`：有效身份、默认身份与身份范围。
- `user_roles`：按目标库 `roles.code` 映射，不复制角色主数据 ID，不修改 Staging 权限定义。
- `customer_profiles`、`technician_profiles`、`merchant_identity_profiles`：未软删除的基础资料。
- `public_identifiers`：与被同步用户、身份或直接店铺范围相关的活跃公开标识。
- 身份切换必需的直接范围关系：被引用的基础 `shops`、`merchant_accounts`、`merchant_shop_memberships` 和 `technician_shop_affiliations`。

本次不迁移媒体文件。数据库中已有的头像 URL 作为账号字段保留；如 URL 指向本地文件，它只记录为后续媒体迁移需求，不伪造可访问资源。

### 3.3 明确排除

不导入或复制：

- Redis Refresh Token、Access Token 黑名单、OTP、验证 challenge、登录锁定计数。
- `login_logs`、`audit_logs`。
- 密码重置、临时邀请或认证中间态。
- Booking、订单、排班、钱包、账本、支付、会员卡交易、IM、Social、通知、交换市场及经营模拟数据。
- 与账号可登录和身份切换无直接关系的其他业务表。

## 4. 映射、冲突与事务边界

- 用户以标准化邮箱、`needo_id`、`account_no` 和非空手机号做多键冲突预检。
- 角色只通过 `roles.code` 映射到 Staging 的现有系统角色。
- 店铺使用 `shop_no` 及本次导入内部的源 ID 映射，导入身份、资料和成员关系前必须已建立目标 ID。
- `active_key`、公开标识、默认身份等唯一约束必须在写入前验证。
- 导入时保留本地密码哈希，不解密、不重置、不在输出或日志中显示。
- 仅对 6 个已确认的 JSON 字段，在导出与导入后校验时统一对象键序和空格序列化；保留数组顺序、标量值和 null。不改变普通文本或忽略 JSON 内容差异。
- 所有导入用户强制写为 `is_test_account=true`；既有 `yisun0316@gmail.com` 管理员也在同一事务内更新为 `is_test_account=true`，但不改写其密码哈希、身份或管理员角色。
- 账号导入是单个 MySQL 事务。任何冲突、缺失角色、外键无法映射、计数不匹配或校验失败都必须整笔回滚。
- 不通过关闭外键检查或手工改写 `_prisma_migrations` 来绕过冲突。

## 5. Staging 注册关闭

### 5.1 后端开关

- 新增 `AUTH_REGISTRATION_ENABLED`，默认为 `true`，避免未配置时静默改变其他环境行为。
- Staging 显式设为 `false`。
- 关闭时，`POST /api/v1/auth/register` 和 `POST /api/v1/auth/register/verify` 在读取业务输入、发送邮件、创建 OTP 或写入数据库前返回 HTTP `403` 和稳定错误键 `error.auth.registration_disabled`。
- 密码登录、Refresh Token、Logout、`/auth/me`、RBAC 和已有账号的身份切换不受影响。

### 5.2 前端开关

- 新增 `VITE_AUTH_REGISTRATION_ENABLED`，默认为 `true`。
- Staging 不可变发布构建显式设为 `false`。
- 关闭时，用户登录页不渲染“创建账号”入口，也不能进入注册或注册验证面板。
- 本次沿用已批准的 `AUTH_GOOGLE_ENABLED=false` / `VITE_AUTH_GOOGLE_ENABLED=false`；不通过 Google 路径建立新账号。

### 5.3 恢复注册

将后端与前端两个注册开关改为 `true`，重新构建和发布不可变 Release，即可恢复。不需要重建 EC2、EBS、MySQL、Redis、DNS 或 TLS 证书。

## 6. 安全传输与备份

1. 运行时重做 AWS 账号、区域、实例、数据卷、活跃 Release 与 schema 预检。
   本次使用 v2 导出包，包含完整已完成且未回滚的迁移名称和校验值；不再仅以 count/latest 判断迁移一致性。导入前重新确认 11 张同步表兼容，迁移差异只允许上述已批准的精确例外。
2. 在任何数据库写入前，对精确的 Staging 数据卷创建加密 EBS 快照，并创建 MySQL 逻辑备份。
3. 本地导出物必须使用临时私有目录和 `0600` 文件模式，不输出密码哈希、邮箱、手机或资料正文到聊天、控制台或验收 JSON。
4. 迁移包只上传到账号 `430611185505` 中现有的加密、版本化、拒绝公共访问的 Staging Release 传输边界。
5. 上传前后校验 SHA-256；导入完成后删除本地临时文件，并删除服务器上的明文迁移包。
6. 验收证据只保留账号数、关系数、哈希、快照 ID、备份键、命令 ID、状态和时间戳。

## 7. 实施顺序

为避免同步期间有新账号进入，分为两个可独立回滚的微步骤：

1. **注册关闭 Release**：实现两个功能开关，测试、构建、发布，并从公网证明注册入口隐藏、API 拒绝、已有账号登录不受影响。
2. **选择性账号同步**：重做预检，创建 EBS 快照和逻辑备份，上传经校验的迁移包，单事务导入，然后执行计数、约束、角色、身份与登录验收。

第 1 步未通过前不执行第 2 步。

## 8. 验收标准

- 公网用户登录页不显示注册入口。
- 两个注册 API 在功能关闭时均返回 `403` / `error.auth.registration_disabled`，且不创建验证 challenge 或用户。
- `/api/v1/health`、`/api/v1/ready` 和用户、商户、运营入口的 readiness 全部通过。
- Staging `users` 账号表未软删除账号数为 252，且 `is_test_account=false` 计数为 0；`yisun0316@gmail.com` 恰好 1 条、仍为启用状态并保有管理员角色。
- 导入用户邮箱、NeeDo ID、账号编号的去标识化集合与源数据集合相等，Staging bootstrap 管理员为唯一额外账号。
- `user_identities`、`user_roles`、三类基础资料和直接范围关系的源/目标去标识化计数和组合校验一致。
- 抽取客户、技师、商户、联盟与运营角色各至少 1 个账号，用原本地密码经正式 `/auth/login` 和 `/auth/me` 验证登录与身份权限。测试输出不显示密码或完整 Token。
- 不存在新的孤儿外键、重复活跃身份或角色范围冲突。

## 9. 回滚

- 注册关闭代码可通过切换到上一个已验证的应用 Release 回滚；重新开启则使用显式为 `true` 的新 Release。
- 账号数据回滚优先使用本次写入前的 MySQL 逻辑备份；逻辑恢复验证失败时停止流量，转入经批准的 EBS 快照恢复流程。
- 应用 symlink 回滚不等于数据库回滚，不得混为一个完成状态。

## 10. 明确不做

- 不同步整个本地数据库。
- 不复制业务流水、历史日志、会话或临时认证数据。
- 不暴露、打印或重新生成本地账号密码。
- 不修改 Onamae DNS、TLS、EC2/EBS 结构、MySQL schema 或 Prisma migration 历史。
- 不合并、推送或发布与本目标无关的主工作区未提交改动。
