# NeeDo Staging Google 登录临时禁用设计

## 1. 状态与目的

- 日期：2026-09-04
- 状态：待用户确认文档
- 环境：个人 AWS Staging，账号 `430611185505`，区域 `ap-southeast-2`
- 目的：在没有正式 Google OAuth Web Client ID 时，使 NeeDo Staging 可以诚实地以密码登录方式启动；不伪造 Google 凭据，不放宽其他生产安全配置。

## 2. 方案比较

1. **显式功能开关（采用）**：增加 `AUTH_GOOGLE_ENABLED`，默认 `true`。Staging 明确设为 `false`；Google 登录入口隐藏，相关后端接口返回依赖不可用。以后提供正式 Client ID 后改回 `true` 并重新发布。
2. 伪造或沿用占位 Client ID：拒绝。它会让界面看似可用但实际认证失败，也违反正式环境禁止假配置的原则。
3. 阻塞整个 Staging 直到取得 Client ID：安全但会阻止本次密码登录部署测试，不符合当前目标。

## 3. 配置与安全边界

- `AUTH_GOOGLE_ENABLED` 默认值保持 `true`，因此现有生产环境不会因为漏配开关而静默关闭 Google 登录。
- 当 `AUTH_GOOGLE_ENABLED=true` 时，继续强制要求合法的 Google Web Client ID；缺失或占位值必须启动失败。
- 当 `AUTH_GOOGLE_ENABLED=false` 时，允许不提供 Google Client ID，但只关闭 Google 登录、绑定和解绑能力。
- 密码登录、JWT、Refresh Token、RBAC、管理员 bootstrap、审计、数据库 migration 及生产模式安全开关不受影响。
- 禁止使用占位 Client ID、测试 Client ID 或伪造值绕过校验。

## 4. API 与前端行为

- Google 登录、绑定和解绑接口在功能关闭时返回 HTTP `503`，使用稳定错误键 `error.auth.google_unavailable`，不得返回 SDK 或配置异常。
- Staging 前端通过构建期显式开关隐藏 Google 登录入口，避免向用户展示不可用能力。
- 密码登录入口保持可见、可用；界面不显示“Google 已配置”之类误导状态。

## 5. 重新开启流程

以后开启 Google 登录只需要：

1. 在 Google Cloud 创建或选用正式 Web OAuth Client，并把 `https://staging.needo.life` 配入允许来源及回调地址。
2. 把正式 Client ID 写入 AWS Secrets Manager；不得提交到 Git。
3. 将后端与前端 Google 功能开关改为 `true`，重新构建并发布不可变 Release。
4. 验证 Google 登录、绑定、解绑及密码登录回归。

此流程不需要重建 EC2、EBS、MySQL、Redis、Elastic IP、DNS 或 TLS 证书。

## 6. 验收与回滚

- 配置测试必须证明：默认启用且缺少 Client ID 时失败；显式关闭且缺少 Client ID 时可启动。
- API 测试必须证明：关闭时 Google 相关接口统一返回 `503`，密码登录不受影响。
- 前端测试必须证明：关闭时不显示 Google 登录入口。
- 发布验收必须证明：`/api/v1/health`、`/api/v1/ready` 和三个门户 readiness 通过，正式管理员可以密码登录。
- 回滚只需恢复上一版 Release；该变更不修改数据库 schema 或业务数据。

## 7. 明确不做

- 本微步骤不申请或创建 Google Cloud 项目与 OAuth 凭据。
- 不改变 AWS 基础设施、DNS 记录或数据库 schema。
- 不修复用户已豁免的既有测试和 bundle-size 基线问题。
