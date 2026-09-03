# NeeDo AWS Staging 单 EC2 部署设计

> **后续方案取代说明：** 本文保留的是最初东京 / JPY 设计历史。若目标区域、凭证解析或预算控制与本文冲突，以后续批准的 [AWS Staging 双区域设计](./2026-09-04-aws-staging-dual-region-design.md) 和 [environment-only 最终安全修订](../plans/2026-09-03-aws-staging-environment-only.md) 为准：个人账号 live 目标为悉尼 `ap-southeast-2`，当前 gate 只接受 AWS CLI v2 `login`，未来公司账号的 SSO / assume-role 解析必须另做安全微步骤，目标区域仍为东京 `ap-northeast-1`，悉尼 live 预算使用操作员明确批准的金额和 `USD` 计费单位。

## 1. 文件状态

- 日期：2026-09-03
- 状态：用户已批准
- AWS 区域：东京 `ap-northeast-1`
- 月度预算上限：约 20,000 日元
- Staging 域名：`staging.needo.life`
- 域名保留边界：不修改 apex `needo.life` 与 `www.needo.life`
- 应用基线：本地 `main@3cc5a978e8afec42baa41bee0077bb4166c47265`
- 发布原则：当前工作区的未提交和未跟踪修改全部排除

本文只规定 AWS Staging 环境、正式管理员 bootstrap、应用发布、备份、回滚和验收边界。它不把单 EC2 Staging 描述为高可用生产环境，也不授权迁移本地模拟账号、TEST_NDP、测试订单或本地数据库。

## 2. 已批准目标

1. 先在 AWS 东京区建立一套成本受控、可运行、可测试、可回滚的 NeeDo Staging。
2. 第一实施微步骤只创建 AWS 环境，不发布应用、不修改 DNS、不运行 migration。
3. 后续从指定 `main` commit 派生最小 Release Candidate，只加入正式管理员 bootstrap 和 AWS Staging 部署能力。
4. 使用全新 MySQL 数据目录，通过正式 Prisma migration 建库，不复制本地 MySQL 或 Redis 数据。
5. 继续由 Onamae 管理 DNS；先使用 `staging.needo.life`，验收完成前不修改 apex `needo.life` 或 `www.needo.life`。
6. Staging 尽量只使用一台 EC2；S3、Secrets Manager、CloudWatch、Systems Manager 和 AWS Budgets 只承担备份、密钥、可观测性、无 SSH 管理和成本保护职责。

## 3. 明确不做

- 不创建 RDS、ElastiCache、ECS、ALB、NAT Gateway 或多可用区故障切换。
- 不迁移本地数据库、Redis、账号导出、真实 `.env`、构建缓存或本地媒体目录。
- 不运行模拟 seed、TEST_NDP 校准或旧的完整 `prisma:seed`。
- 不直接部署当前 dirty worktree。
- 不开放公网 SSH、MySQL、Redis 或 `/api/v1/metrics`。
- 不在没有压测数据时承诺正式生产容量或高可用。
- 不创建或修改 apex `needo.life` 与 `www.needo.life` 的 DNS 记录。

## 4. 方案比较与选择

评估过三种方案：单台 ARM EC2、单台 x86 EC2、应用与数据库分离的双 EC2。用户批准单台 `t4g.large`：它在成本、8 GiB 内存和 Staging 运维复杂度之间最合适。`t3.large` 的 x86 兼容性更宽但成本更高；双 EC2 增加运维面和费用，仍不构成数据库高可用。

选择单台 EC2 意味着接受明确的单点故障：实例或可用区故障期间 Staging 可以中断，恢复方式是从 EBS 快照、S3 数据库备份和不可变 Release 重建。

## 5. AWS 架构

```text
Internet
   |
   | HTTPS 443 / certificate HTTP-01 80
   v
Elastic IP
   |
   v
EC2 t4g.large, Amazon Linux 2023 ARM64
   |-- Nginx: TLS, static frontend, /api/v1 reverse proxy
   |-- NeeDo backend: Node.js 22 container
   |-- MySQL 8 container
   |-- Redis 7 container with AUTH and AOF
   |-- 30 GiB encrypted gp3 root volume
   `-- 70 GiB encrypted gp3 data volume mounted at /srv/needo

Supporting managed controls
   |-- Systems Manager Session Manager: no-SSH administration
   |-- Secrets Manager: one scoped Staging application secret
   |-- S3 release bucket: immutable release artifacts
   |-- S3 backup bucket: encrypted database/media backups
   |-- CloudWatch: logs, host/container metrics, alarms
   `-- AWS Budgets: 15k / 18k / 20k JPY notifications
```

### 5.1 Network

CloudFormation creates one dedicated VPC, one public subnet in one Tokyo availability zone, an Internet Gateway, a route table, one EC2 security group and one Elastic IP. The security group permits public inbound TCP 80 and 443 only. Port 22 is absent. MySQL 3306 and Redis 6379 are reachable only through the private Docker network and are not published on the host.

The instance uses an IAM instance profile and outbound HTTPS to reach Systems Manager, Secrets Manager, S3, CloudWatch, package repositories and certificate endpoints. A NAT Gateway is unnecessary because the instance is in the public subnet with an Elastic IP.

### 5.2 Access and IAM

For the current personal-stage gate, human deployment access uses the approved
AWS CLI v2 `login` profile only. IAM Identity Center/SSO or named assume-role
support for a later company account requires the separate final-security
follow-up described in the supersession banner. Root credentials and long-lived
IAM access keys are forbidden for routine work.

The EC2 instance role is least privilege and limited to:

- Systems Manager managed-instance operations;
- writing to the designated CloudWatch log groups;
- reading the single NeeDo Staging Secrets Manager ARN;
- reading the Staging release bucket;
- writing and reading only the Staging backup bucket prefixes required by backup/restore.

The instance receives no wildcard permission to list or read unrelated account secrets or buckets.

### 5.3 Storage

The root volume is 30 GiB encrypted gp3. The independent 70 GiB encrypted gp3 data volume is mounted by filesystem UUID at `/srv/needo` and contains:

```text
/srv/needo/mysql
/srv/needo/redis
/srv/needo/media/customer-avatars
/srv/needo/media/identity-applications
/srv/needo/media/im-media
/srv/needo/media/content-media
/srv/needo/releases
```

The deployment must fail closed if the data volume is not mounted; it must never silently create MySQL, Redis or media data on the root volume mountpoint.

Local filesystem media is accepted only for this single-node Staging. Production or horizontal scaling requires a separate S3 storage adapter microstep before multiple application nodes are introduced.

### 5.4 S3 and encryption

Release and backup objects use separate private buckets. Both block all public access, enable versioning, default server-side encryption and lifecycle rules. Release objects are addressed by immutable commit/hash paths. Backup objects are environment-prefixed and never share a production prefix.

The backup policy keeps daily database/media backups for 30 days and pre-migration recovery points for 90 days. Exact lifecycle values may be reduced later only through an explicit retention decision.

## 6. DNS and TLS

Current read-only public DNS evidence on 2026-09-03:

- `needo.life` returned `NXDOMAIN`;
- no public delegation or authoritative nameserver was observed for `needo.life`;
- therefore no public A record exists yet for `staging.needo.life`;
- Onamae registration status, nameserver activation, and DNS-zone control remain external operator responsibilities and are not changed in this microstep.

After the EC2 environment and application pass IP-level readiness, the DNS owner adds:

```text
type: A
host: staging
value: <staging Elastic IP>
TTL: 300
```

The DNS owner must first confirm that `needo.life` is active and publicly delegated from Onamae. No wildcard, apex, or `www` mutation is required. Nginx uses Let's Encrypt for `staging.needo.life`; TCP 80 remains available for HTTP-01 issuance and redirects ordinary requests to HTTPS. Certificate renewal is automated and monitored. Google Web OAuth authorized JavaScript origins are updated only after HTTPS is live; no Google client secret is introduced.

## 7. Environment and secrets

The Staging application uses `NODE_ENV=production`, `DEPLOY_ENV=staging`, `ALLOW_TEST_LOGIN=false`, `ALLOW_FORMAL_TEST_SEED=false` and `ALLOW_SIMULATION_SEED=false`. Formal test, simulation and passwordless login paths remain disabled.

Secrets Manager holds one JSON document for the Staging backend environment. It includes database/Redis credentials, distinct JWT secrets, verification/encryption secrets, metrics bearer token and the one-time administrator bootstrap password. Secret values never enter Git, CloudFormation parameters, terminal output, Docker image layers, logs or chat.

At deployment, a root-owned bootstrap process retrieves the scoped secret and materializes only the environment input required by Docker Compose with mode `0600`. Rotation requires a controlled container restart. The generated environment file is excluded from release archives and S3 backups.

## 8. Clean database and formal administrator bootstrap

The existing `prisma/seed.ts` in the chosen base commit cannot be used for a clean Staging because it creates the initial administrator as `isTestAccount=true`, creates a local-test customer identity and includes the administrator in TEST_NDP calibration.

The approved safety patch adds a separate, guarded Staging administrator bootstrap command with these invariants:

- refuses local, test and production targets; accepts only the exact Staging environment and database identity;
- requires an empty administrator bootstrap state and an explicit one-time enable flag;
- creates one non-test platform user and platform identity;
- assigns only the formal global administrator role required for operations access;
- does not create a customer profile, wallet, ledger entry, NDP, TEST_NDP, shop, technician or business fixture;
- hashes the password with bcrypt rounds at least 12;
- writes an audit record containing actor/target/action metadata without a password or token;
- is idempotent for the exact completed bootstrap and rejects changed credentials or a conflicting administrator;
- revokes bootstrap sessions as appropriate and cannot remain enabled for normal backend startup;
- has unit, repository/transaction and guarded real-database acceptance coverage.

Controlled four-role Staging fixtures are a later separate microstep and must be created through formal APIs or a separately approved guarded provisioning flow. They are not part of infrastructure creation or the initial administrator bootstrap.

## 9. Release and deployment flow

For the environment-only CloudFormation creation, preflight captures one clean
tracked template at a full Git revision and reports its SHA-256 and revision
for explicit action-time approval. Deployment requires those exact values,
re-attests the tracked path and bytes immediately before creation, and supplies
the same immutable in-memory byte string to `validate-template` and
`create-stack`. Mutable `file://` validation followed by a path reread is not
an approved deployment flow.

Interactive Session Manager shell proof is not part of this environment-only
gate because the reviewed wrapper exposes no hardened interactive launcher.
Only bounded repository-owned SSM document/Run Command evidence is accepted.
Interactive access is deferred to a dedicated hardened Session Manager
microstep in the later company/application stage.

The application Release Candidate starts at `main@3cc5a978e8afec42baa41bee0077bb4166c47265`. Only the approved administrator bootstrap and AWS Staging deployment files may be added before the first release. Existing dirty worktree changes are excluded.

The release process:

1. Build and test in an isolated worktree.
2. Run `prisma:generate`, frontend/backend lint and build, `verify:production-build`, deployment-focused tests and `git diff --check`.
3. Record known waived baseline failures separately; never report them as newly passing.
4. Create an immutable source/release archive from the committed tree, calculate SHA-256 and upload it to the private release bucket.
5. EC2 downloads the exact object through its role, verifies SHA-256 and extracts it to a commit-addressed release directory.
6. Before any later migration, create a database backup and EBS snapshot.
7. Run the dedicated migration container once, then the guarded administrator bootstrap once.
8. Start backend and Nginx only after migration/bootstrap success.
9. Verify backend liveness, dependency readiness, internal metrics protection, frontend HTTP behavior and same-origin `/api/v1` proxy.
10. Switch the active release symlink only after health/readiness pass; retain the previous release for application rollback.

No startup script may print or persist secret values. A detached process, container start event or open port is not deployment acceptance.

## 10. Backups and rollback

Daily backup jobs create an encrypted MySQL logical dump plus an integrity manifest and synchronize runtime media to the private backup bucket. Redis AOF is retained on the data volume, but MySQL remains the durable business authority; Redis sessions and ephemeral auth state are not treated as a replacement for database backup.

Before every migration:

1. verify the current release and migration status;
2. create and verify a logical database backup;
3. create an EBS snapshot of the data volume;
4. record backup object/version and snapshot ID in the release evidence.

Rollback rules:

- application-only failure: return Nginx/active symlink to the previous compatible release;
- readiness failure before traffic: keep the new release inactive and preserve logs;
- migrated-schema failure: roll back the application only if the previous image is verified compatible with the migrated schema; otherwise fix forward;
- irreversible data corruption: stop traffic and restore from the verified pre-migration snapshot or logical backup;
- database timeline restore: invalidate Redis sessions from the discarded timeline before reopening traffic.

## 11. Observability and cost controls

CloudWatch receives structured backend/Nginx logs and host/container CPU, memory and disk metrics. Alarms cover instance status checks, root/data disk usage, backend readiness, repeated container restarts, HTTP 5xx and stale backup evidence. `/api/v1/metrics` is bound or filtered so it is not reachable from the public internet.

AWS Budgets sends threshold notifications at 15,000, 18,000 and 20,000 JPY of forecast/actual monthly cost. Billing tax, outbound transfer, public IPv4, snapshots, S3, Secrets Manager and CloudWatch ingestion are included in the final AWS Pricing Calculator review before application deployment. Budget alarms do not automatically destroy or stop resources.

## 12. Verification and acceptance

### 12.1 AWS environment-only gate

- CloudFormation stack reaches a stable successful state.
- The exact region is `ap-northeast-1` and all resources carry Staging/environment/owner tags.
- EC2 is `t4g.large`, the Elastic IP is recorded and both EBS volumes are encrypted.
- Session Manager opens without port 22 or an SSH key.
- The 70 GiB volume is mounted at `/srv/needo` and mount-failure behavior is proven.
- Security group exposes only 80/443; 22/3000/3306/6379 are not public.
- S3 public access is blocked, versioning/encryption/lifecycle are verified.
- The Secrets Manager resource exists but no secret is printed.
- CloudWatch log groups/alarms and AWS Budget thresholds exist.
- No application, migration, seed, DNS or business-data mutation has occurred.

### 12.2 Application gate

- Exact release commit and SHA-256 are recorded.
- Production configuration validation passes with all test/simulation switches disabled.
- Prisma migration history matches the clean Staging schema and deploys once.
- Formal administrator bootstrap creates exactly one non-test administrator and zero customer/wallet/NDP/TEST_NDP rows attributable to bootstrap.
- `/api/v1/health` is healthy and `/api/v1/ready` is ready.
- `/api/v1/metrics` is inaccessible publicly and readable only through the approved internal path/token.
- `staging.needo.life` serves valid HTTPS and same-origin `/api/v1` routes.
- Operations administrator login, `/auth/me`, expected role/permission and logout pass without exposing credentials or tokens.
- Backup and restore rehearsal plus application rollback rehearsal pass before Staging is called deployable.

## 13. Known base-commit test state

The user explicitly directed that existing base failures are not fixed before AWS environment deployment. On the isolated `main@3cc5a978` worktree:

- frontend full suite: 2 failed, 2,549 passed; both failures are in `ProfileDetailPage.routing.test.tsx`;
- backend after `prisma:generate`: 1 failed, 1,131 passed, 11 skipped; the failure is the `remainingSeconds` assertion in `shop-membership-card-adjustment-api.test.ts`.

These failures are recorded as waived pre-existing baseline evidence. They must not be reported as caused by AWS work or as passing. Deployment-specific tests, builds, security checks, health/readiness and cloud acceptance remain mandatory.

## 14. Implementation microsteps

### Microstep 1 — AWS environment only

Create the CloudFormation infrastructure, configure least-privilege access, verify Session Manager/EBS/S3/Secrets/CloudWatch/Budgets and stop. Do not deploy application code, run migrations, modify DNS or create business data.

### Microstep 2 — Release Candidate and bootstrap

Implement and verify the formal Staging administrator bootstrap plus immutable release packaging from the fixed base commit. Do not mutate AWS business data until the guarded bootstrap checker passes locally against an isolated test database.

### Microstep 3 — Application, DNS and acceptance

Populate secrets through the approved non-printing path, deploy the application, run migrations/bootstrap, configure the Onamae `staging` A record, issue TLS, verify backups/rollback and complete browser/API acceptance. Any apex `needo.life` or `www.needo.life` activation is a later separately approved production decision.

## 15. Required user-provided authority

Before Microstep 1 cloud writes, the user provides an approved AWS short-lived access path with permission to manage the scoped Staging CloudFormation resources in `ap-northeast-1`. The user or domain owner later confirms Onamae registration/delegation and provides DNS access for the single `staging` A record. No root password, MFA code, long-lived access key secret, SSH private key, database password, JWT secret or production account password is sent in chat.
