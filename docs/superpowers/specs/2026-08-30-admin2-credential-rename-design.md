# LifeDance admin2 账号改名与密码重置设计

## 目标

将现有本地正式测试账号从 `admin2@lifedance.com` 原位改名为
`admina@lifedance.com`，并把密码重置为用户指定的新测试密码。保留现有
User id、NeeDoID、角色、身份、店铺、联系人、审计历史和业务关联。

## 边界

- 只处理本地 `needo_dev` 中的 LifeDance admin2 正式测试账号。
- 不创建替代用户，不修改其他测试账号密码。
- 不把明文密码写入源码、测试、Git、日志或命令输出。
- 密码只保存在已忽略的 `backend/.env.dev` 专用环境变量中；数据库只保存
  bcrypt cost 12 哈希。
- 保留旧登录日志和审计记录，不回写历史邮箱字段。
- 避开当前工作树中与本任务无关的 IM、首页和移动端改动。

## 方案

采用兼容旧邮箱的原位 provisioning：

1. `LIFEDANCE_ADMIN2_PLAN.email` 改为新邮箱，并声明旧邮箱为一次性兼容来源。
2. provisioning 先按新邮箱或旧邮箱查找同一用户，再以 User id 做冲突排除。
3. 更新既有用户时显式写入新邮箱、bcrypt 密码哈希、启用状态和递增后的
   session generation；不改变固定 NeeDoID 和关联资源。
4. provisioning 和 checker 使用 admin2 专用密码环境变量，不再依赖全体测试
   账号共享密码；示例环境文件只声明空变量，不包含真实密码。
5. provisioning 成功后撤销该用户所有 refresh token、同步 session generation，
   并清除该账号的登录失败计数。现有 provisioning 审计继续记录本次变更。

## 错误处理

- 新邮箱已属于其他用户时失败关闭，不覆盖目标用户。
- 旧邮箱和新邮箱同时对应不同用户时失败关闭，不合并账号。
- 固定 NeeDoID 或 account number 属于其他用户时失败关闭。
- 缺少专用本地密码变量时 provisioning/checker 直接失败。
- 数据库、Redis 或事务失败时不报告完成；数据库事务保持原子性。

## 测试与验收

1. 先新增失败测试，证明旧邮箱账号会被识别为同一用户并迁移到新邮箱，且冲突
   用户不会被覆盖。
2. 目标后端测试、lint 和 build 通过。
3. 运行本地 provisioning 和 `check:lifedance-admin2`，确认账号、固定 ID、角色、
   身份、店铺和联系人完整。
4. 新邮箱加新密码通过正式 `/api/v1/auth/login`；随后 `/api/v1/auth/me` 返回 admin
   角色与对应入口权限；诊断会话通过正式 logout 清理。
5. 旧邮箱登录返回统一的 invalid credentials；账号当前不被锁定。
6. 最终只报告状态、角色、权限和 HTTP 结果，不输出密码、哈希或 token。

## 回滚

若验收失败，停止在当前微步骤，不创建第二个用户。通过同一原位 provisioning
设计把 canonical email 改回旧值并使用授权的本地密码重新 provision；保留审计
和登录历史，不做物理删除。
