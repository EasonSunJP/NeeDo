# NeeDo AWS Staging Environment-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **2026-09-04 region amendment:** The personal-account live gate uses
> `ap-southeast-2` because an AWS-managed SCP explicitly denies Tokyo. The
> implementation now requires an explicit `--region` and accepts only
> `ap-southeast-2` or `ap-northeast-1`; Tokyo remains the later company-account
> target. See the approved dual-region design and implementation plan.

> **2026-09-04 final security amendment (`批准最终安全修订`):** This amendment is
> authoritative wherever the historical Task 1–9 snippets conflict with it.
> The hostname is exactly `staging.needo.life`; the CLI freezes one exported
> temporary `login`/assumed-role credential session in memory and neutralizes
> inherited/configured endpoints; CloudFormation receives both
> `ExpectedRegion` and `ExpectedAccountId`; initial deployment uses atomic
> `create-stack` and binds every later call to its returned full StackId, with
> `AlreadyExists` as a stop condition. Before any bootstrap waiter or
> `ssm send-command`,
> a fresh preflight must prove account/region and the exact stack, tags,
> resources, outputs, instance/data-volume attachment, SSM document content and
> version, and CloudWatch Agent parameter content and version. Both S3 bucket
> policies are retained with their buckets; acceptance binds their physical IDs
> to the bucket outputs and verifies each live exact TLS-only deny policy with
> the expected bucket owner before any host command. No create-or-update behavior is
> authorized by this environment-only plan.
> All four CloudWatch alarms declare `ActionsEnabled: true`; live acceptance
> requires that exact boolean and preserves it in reconstructed evidence.

> **2026-09-04 CLI isolation follow-up:** Before credentials are available, the
> wrapper ignores `PATH`, searches only fixed canonical-user/system install
> roots, resolves, validates, fingerprints (metadata plus SHA-256), and attests
> one absolute AWS CLI v2 `2.32.0+` executable, then revalidates only that path
> before every invocation. The named `login` profile is
> reduced to its single non-secret `login_session` in a wrapper-owned private
> resolver config; only that resolver can access the canonical login cache.
> Resolver and frozen phases receive explicit environment allowlists, private
> empty config/credential/model state, and `cli_history = disabled`; frozen
> operations receive neither `PATH` nor login-cache, proxy, CA/trust, HOME,
> model, history, profile, or default-config inheritance. Exported credentials
> remain only in memory and the private state is disposed in `finally`.
> The personal gate rejects `sso`, `assume-role`, and `custom-process`; later
> company-profile resolution is a separate blocked-until-profile microstep and
> personal evidence is not reusable.
> The canonical source HOME-to-root chain and every login config/cache source
> path are owner/mode/realpath/device/inode-attested before credentials exist
> and immediately before each resolver spawn. Unsafe ancestors or any identity
> replacement stop and dispose private wrapper state.

> **2026-09-04 immutable-template follow-up (`批准最终安全修订`):** Historical
> `file://` validation and later path reread steps are superseded. Preflight
> captures one clean tracked template at a full Git revision, reports its
> SHA-256 and revision, and validates that exact in-memory byte string.
> Deployment requires both values as explicit action-time approvals, repeats
> the clean revision/path/byte attestation immediately before creation, and
> supplies the same immutable bytes to `validate-template` and `create-stack`.

> **2026-09-04 interactive-access supersession (`批准最终安全修订`):** Historical
> raw AWS CLI version checks and the raw Session Manager shell command in Task
> 10 are not authorized acceptance steps. The current wrappers do not expose a
> hardened interactive launcher. Interactive shell proof is deferred to a
> dedicated hardened Session Manager microstep for the later company/application
> stage; this environment-only gate uses repository wrappers and bounded Run
> Command evidence only.

> **2026-09-04 runtime-provenance supersession (`批准最终安全修订`):** Every
> guarded command now requires `--source-revision
> <approved-full-source-revision>` and, before credentials, binds one explicit
> runtime closure (four entrypoints, all static/transitive security modules,
> and `package.json`) to that exact HEAD/index/worktree state. The gate records
> `runtimeSourceRevision`, `runtimeManifestSha256`, and `runtimeEntrypoint`,
> re-attests before every AWS CLI process and mutation, and separately binds
> the CloudFormation template. This does not claim the entire repository or
> worktree is clean, and it does not defend an already-compromised same-user
> host; historical “same seven flags” and template-only provenance wording
> below is superseded.

> **2026-09-04 sealed-launch supersession (`批准最终安全修订`):** Supported live
> execution does not use npm lifecycle scripts or load worktree JavaScript.
> Root-trusted `/usr/bin/git` supplies `scripts/aws-staging-launcher.mjs` as an
> exact approved Git object from the operator-approved full commit; every Git
> provenance read disables lazy fetching with `GIT_NO_LAZY_FETCH=1`. With
> inherited `NODE_OPTIONS` removed, the launcher accepts a fixed absolute Node
> executable only when its major version is exactly 22, then materializes the
> exact approved runtime closure and template into a private read-only snapshot
> before guarded ESM or credentials load. The child disables string code
> generation and suppresses only Node's `ExperimentalWarning`. Its custom ESM
> loader rejects any computed import resolution outside the sealed module URL
> allowlist and approved `node:` builtins, while the preloaded runtime guard
> makes computed `process.binding`, `process.dlopen`, and
> `process.getBuiltinModule` escape APIs unavailable and immutable.
>
> The launcher also carries the source repository root's real path, owner,
> group, mode, device, and inode into the sealed launch context.
> Deploy and acceptance evidence writers receive that attested identity and
> exact-match it at
> writer entry, and revalidate those fields plus every output-directory
> component around each filesystem operation; a symlink, replacement, or
> group/world-writable component stops the write. The exact approved commit is
> the code trust decision: the scanner, loader, and guard enforce that decision
> but do not turn arbitrary JavaScript into a sandbox. The local trusted shell,
> root-owned `/usr/bin/git`, and approved Node.js 22 installation remain host
> trust anchors, and no protection is claimed against a compromised root or
> same-user host. Historical package-command and direct-entrypoint instructions
> below are superseded by the runbook's `needo_aws_staging` procedure.

Bootstrap and verify each capture the tracked template artifact at the approved revision before credential resolution and pass that same object into the real in-process preflight.

Acceptance reconstruction requires documentSha256 and agentParameterSha256 to equal the canonical SHA-256 of the approved repository constants; format-only values are rejected.

The guarded child executes only the read-only private Node.js copy made from the already-open, stable, SHA-256-bound source handle; before the sealed loader is registered, the runtime guard requires actual Node.js major 22 and an exact executable identity and digest match.

This is data-fork execution continuity, not independent vendor-signature provenance: the copy does not preserve quarantine, ACL, or other extended metadata. The outer launcher parent still starts from the explicitly approved absolute Node path, and the existing compromised-root/same-user-host non-goal remains unchanged.

**Goal:** Provision and prove the approved AWS Staging infrastructure in personal-account Sydney or later company-account Tokyo without deploying application code, running Prisma migrations or seeds, changing DNS, or writing business data.

**Architecture:** A single CloudFormation stack creates a dedicated public VPC/subnet, one ARM64 `t4g.large` EC2 instance with encrypted 30 GiB root and independently retained 70 GiB data volumes, an Elastic IP, no-SSH SSM access, private release/backup S3 buckets, one empty Secrets Manager resource, CloudWatch host monitoring, and a monthly AWS Budget. A repository-owned SSM document performs idempotent host initialization only after CloudFormation attaches the data volume. Local Node.js orchestration validates account/region/temporary-credential boundaries, deploys the stack, runs the SSM bootstrap, and writes redacted acceptance evidence under ignored `outputs/`.

**Tech Stack:** AWS CloudFormation, Amazon EC2 `t4g.large`, Amazon Linux 2023 ARM64, EBS gp3, IAM, Systems Manager Session Manager/Run Command, S3, Secrets Manager, CloudWatch Agent/alarms/log groups, SNS email notifications, AWS Budgets, AWS CLI v2, Node.js 22 ESM, Vitest

## Global Constraints

- Deploy only from the isolated branch based on `main@3cc5a978e8afec42baa41bee0077bb4166c47265`; do not include the original dirty worktree.
- This plan is Microstep 1 only. Do not upload a NeeDo release, pull an application image, start application/MySQL/Redis/Nginx containers, run Prisma, seed/bootstrap users, retrieve secret values, issue TLS certificates, or modify DNS.
- Require explicit `ap-southeast-2` (personal test) or `ap-northeast-1` (later company account) plus an explicit 12-digit AWS account ID before any mutating command.
- Require exact hostname `staging.needo.life` on every command; DNS remains external to AWS and untouched in this microstep.
- Human access must use an SSO/assumed-role temporary session. Reject the root user and long-lived shared access-key profiles.
- Keep port 22 absent. Public inbound security-group rules are TCP 80 and 443 only; 3000, 3306, and 6379 are never exposed.
- Keep the application secret empty in this microstep. Verification may call `describe-secret` and `list-secret-version-ids`, but never `get-secret-value`.
- Keep EBS, S3, and secret resources recoverable: data volume uses snapshot policies; buckets, their TLS-only BucketPolicy resources, and the secret are retained on stack deletion.
- Never log AWS credentials, session tokens, future application secrets, or secret values. Evidence may contain account ID, role ARN, region, resource IDs, public IP, alert email in masked form, and non-secret configuration.
- Treat the approved three pre-existing test failures as waived baseline evidence only: two `ProfileDetailPage.routing` frontend failures and one backend `shop-membership-card-adjustment-api` timing failure. Do not fix them and do not claim the full suites pass.
- Deployment-specific tests, CloudFormation validation, focused repository regression checks, and live AWS acceptance are mandatory and cannot be waived by that baseline exception.
- The budget limit must use the account's actual AWS billing currency. Map the approved 15,000/18,000/20,000 JPY intent to 75%/90%/100% of one explicit monthly limit. If the account bills in another currency, stop for an explicitly approved amount; never convert silently.
- Budget and CloudWatch alarms notify only. They must not stop, terminate, or delete AWS resources automatically.

---

### Task 1: Add a pure, fail-closed AWS Staging configuration contract

**Files:**
- Create: `scripts/aws-staging-config.test.mjs`
- Create: `scripts/aws-staging-config.mjs`

**Interfaces:**
- Consumes: CLI flags or environment values for profile, account ID, Staging hostname, region, owner, alert email, budget amount, and billing currency.
- Produces: a frozen `AwsStagingConfig` object that later orchestration can use without defaults that could target the wrong account.
- Does not call AWS or mutate local/external state.

- [ ] **Step 1: Write failing configuration tests**

Create `scripts/aws-staging-config.test.mjs` with these contract cases:

```js
import { describe, expect, it } from "vitest";
import {
  maskEmail,
  parseAwsStagingArgs,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";

const validInput = {
  profile: "needo-staging-deployer",
  accountId: "123456789012",
  region: "ap-northeast-1",
  owner: "needo",
  hostname: "staging.needo.life",
  alertEmail: "ops@example.com",
  budgetAmount: "20000",
  budgetUnit: "JPY"
};

describe("AWS Staging configuration", () => {
  it("normalizes the approved environment without converting money", () => {
    expect(resolveAwsStagingConfig(validInput)).toEqual({
      alertEmail: "ops@example.com",
      budgetAmount: "20000",
      budgetUnit: "JPY",
      accountId: "123456789012",
      environment: "staging",
      hostname: "staging.needo.life",
      owner: "needo",
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      stackName: "needo-staging-infrastructure",
      templatePath: expect.stringMatching(
        /deploy\/aws-staging\/cloudformation\.yml$/
      )
    });
  });

  it.each([
    [{ ...validInput, accountId: "" }, "account ID"],
    [{ ...validInput, accountId: "123" }, "account ID"],
    [{ ...validInput, region: "us-east-1" }, "ap-northeast-1"],
    [{ ...validInput, profile: "default" }, "profile"],
    [{ ...validInput, alertEmail: "not-an-email" }, "email"],
    [{ ...validInput, budgetAmount: "0" }, "budget amount"],
    [{ ...validInput, budgetAmount: "20,000" }, "budget amount"],
    [{ ...validInput, budgetUnit: "yen" }, "currency"],
    [{ ...validInput, hostname: "Staging.needo.life" }, "hostname"],
    [{ ...validInput, hostname: "staging.needo.life." }, "hostname"],
    [{ ...validInput, hostname: "*.needo.life" }, "hostname"],
    [{ ...validInput, hostname: "staging.127.0.0.1" }, "hostname"],
    [{ ...validInput, hostname: "staging.localhost" }, "hostname"]
  ])("rejects unsafe input %#", (input, expected) => {
    expect(() => resolveAwsStagingConfig(input)).toThrow(expected);
  });

  it("requires each mutating argument explicitly", () => {
    expect(
      parseAwsStagingArgs([
        "--profile", "needo-staging-deployer",
        "--account-id", "123456789012",
        "--hostname", "staging.needo.life",
        "--alert-email", "ops@example.com",
        "--budget-amount", "20000",
        "--budget-unit", "JPY"
      ])
    ).toMatchObject(validInput);
    expect(() => parseAwsStagingArgs([])).toThrow("--account-id");
  });

  it("masks alert addresses in evidence", () => {
    expect(maskEmail("operations@example.com")).toBe("o***@example.com");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --run scripts/aws-staging-config.test.mjs
```

Expected: FAIL because `scripts/aws-staging-config.mjs` does not exist.

- [ ] **Step 3: Implement strict parsing and normalization**

Create `scripts/aws-staging-config.mjs`. Use one internal `requiredFlags` table, reject unknown/duplicate flags, and expose the parser, structural hostname guard, resolver, and email masker:

```js
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "..");
const requiredFlags = new Map([
  ["--profile", "profile"],
  ["--account-id", "accountId"],
  ["--hostname", "hostname"],
  ["--alert-email", "alertEmail"],
  ["--budget-amount", "budgetAmount"],
  ["--budget-unit", "budgetUnit"]
]);

export function requireAwsStagingHostname(value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("AWS Staging hostname must be a non-empty lower-case ASCII DNS name");
  }
  if (value.length > 253 || value !== value.toLowerCase() || !value.startsWith("staging.")) {
    throw new Error("AWS Staging hostname must be a lower-case ASCII DNS name starting with staging.");
  }
  const labels = value.split(".");
  if (labels.length < 3
    || !labels.every((label) => label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
    || !/^[a-z]{2,63}$/.test(labels.at(-1) || "")) {
    throw new Error("AWS Staging hostname must have a registrable-looking DNS suffix");
  }
  return value;
}

export function parseAwsStagingArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const key = requiredFlags.get(flag);
    if (!key) throw new Error(`Unknown AWS Staging flag: ${flag || "<missing>"}`);
    if (parsed[key] !== undefined) throw new Error(`Duplicate AWS Staging flag: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    parsed[key] = value;
  }
  for (const [flag, key] of requiredFlags) {
    if (!parsed[key]) throw new Error(`${flag} is required`);
  }
  return { ...parsed, region: "ap-northeast-1", owner: "needo" };
}

export function resolveAwsStagingConfig(input) {
  const profile = String(input.profile || "").trim();
  const accountId = String(input.accountId || "").trim();
  const region = String(input.region || "").trim();
  const owner = String(input.owner || "").trim();
  const hostname = requireAwsStagingHostname(input.hostname);
  const alertEmail = String(input.alertEmail || "").trim().toLowerCase();
  const budgetAmount = String(input.budgetAmount || "").trim();
  const budgetUnit = String(input.budgetUnit || "").trim().toUpperCase();

  if (!profile || profile === "default") throw new Error("A named temporary AWS profile is required");
  if (!/^\d{12}$/.test(accountId)) throw new Error("A 12-digit AWS account ID is required");
  if (region !== "ap-northeast-1") throw new Error("Region must be ap-northeast-1");
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(owner)) throw new Error("Invalid owner tag");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail)) throw new Error("A valid alert email is required");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(budgetAmount) || Number(budgetAmount) <= 0) {
    throw new Error("A positive decimal budget amount is required");
  }
  if (!/^[A-Z]{3}$/.test(budgetUnit)) throw new Error("A three-letter billing currency is required");

  return Object.freeze({
    alertEmail,
    budgetAmount,
    budgetUnit,
    accountId,
    environment: "staging",
    hostname,
    owner,
    profile,
    region,
    stackName: "needo-staging-infrastructure",
    templatePath: path.join(repoRoot, "deploy/aws-staging/cloudformation.yml")
  });
}

export function maskEmail(value) {
  const [local, domain] = value.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- --run scripts/aws-staging-config.test.mjs
```

Expected: PASS with all configuration contract tests and no external calls.

The final contract must reject every hostname other than the explicitly approved `staging.needo.life`, including missing/duplicate/mixed-case values, trailing dots, wildcards, IP/localhost forms, and otherwise-valid alternate `staging.*` domains, before any AWS or DNS call.

- [ ] **Step 5: Commit the configuration contract**

```bash
git add scripts/aws-staging-config.mjs scripts/aws-staging-config.test.mjs
git commit -m "test: define AWS staging deployment contract"
```

### Task 2: Define the environment-only CloudFormation stack with static contract tests

**Files:**
- Create: `deploy/aws-staging/cloudformation.contract.test.mjs`
- Create: `deploy/aws-staging/cloudformation.yml`

**Interfaces:**
- Consumes: `AlertEmail`, `BudgetAmount`, `BudgetUnit`, and `Owner` parameters; the latest AL2023 ARM64 AMI from the AWS public SSM parameter.
- Produces: VPC/network, EC2/EBS/EIP, IAM/SSM, S3, empty secret, CloudWatch/SNS, and AWS Budget resources plus non-secret stack outputs.
- Must not contain application startup, Docker Compose, database, migration, seed, DNS, Route 53, certificate, or secret-value materialization logic.

- [ ] **Step 1: Write a failing static CloudFormation safety contract**

Create `deploy/aws-staging/cloudformation.contract.test.mjs`. Read the template as text and assert all approved controls before any AWS call:

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "cloudformation.yml"), "utf8");

describe("AWS Staging CloudFormation contract", () => {
  it("pins the approved region-compatible ARM environment", () => {
    expect(source).toContain("al2023-ami-kernel-default-arm64");
    expect(source).toContain("InstanceType: t4g.large");
    expect(source).toContain("VolumeSize: 30");
    expect(source).toContain("Size: 70");
    expect(source.match(/Encrypted: true/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("HttpTokens: required");
  });

  it("has no SSH key and exposes only HTTP and HTTPS", () => {
    expect(source).not.toMatch(/KeyName:/);
    const ingressSource = source
      .split("SecurityGroupIngress:")[1]
      .split("SecurityGroupEgress:")[0];
    const ingress = [...ingressSource.matchAll(/FromPort: (\d+)/g)].map(
      (match) => Number(match[1])
    );
    expect(new Set(ingress)).toEqual(new Set([80, 443]));
    expect(source).not.toMatch(/FromPort: (22|3000|3306|6379)/);
  });

  it("keeps data and object storage encrypted and recoverable", () => {
    expect(source).toContain("DeletionPolicy: Snapshot");
    expect(source).toContain("UpdateReplacePolicy: Snapshot");
    expect(source.match(/BlockPublicAcls: true/g)?.length).toBe(2);
    expect(source.match(/Status: Enabled/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/DeletionPolicy: Retain/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("creates an empty secret and never embeds a value", () => {
    expect(source).toContain("Type: AWS::SecretsManager::Secret");
    expect(source).not.toMatch(/SecretString:|GenerateSecretString:/);
    expect(source).not.toMatch(/JWT_|DATABASE_URL|REDIS_PASSWORD|password/i);
  });

  it("creates percentage budget alerts matching 15k, 18k, and 20k intent", () => {
    expect(source).toContain("Type: AWS::Budgets::Budget");
    expect(source).toContain("Amount: !Ref BudgetAmount");
    expect(source).toContain("Unit: !Ref BudgetUnit");
    for (const threshold of [75, 90, 100]) {
      expect(source).toContain(`Threshold: ${threshold}`);
    }
    expect(source).toContain("ThresholdType: PERCENTAGE");
  });

  it("contains host bootstrap only and excludes application deployment", () => {
    expect(source.match(/Type: AWS::SSM::Document/g)).toHaveLength(2);
    expect(source).toContain("/srv/needo/media/customer-avatars");
    expect(source).toContain("findmnt");
    expect(source).not.toMatch(/docker compose|prisma|seed|migrate deploy|certbot|nginx|Route53|AWS::Route53/i);
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

```bash
npm test -- --run deploy/aws-staging/cloudformation.contract.test.mjs
```

Expected: FAIL because `cloudformation.yml` does not exist.

- [ ] **Step 3: Create the CloudFormation template header, parameters, and tagging rules**

Start `deploy/aws-staging/cloudformation.yml` with this exact public interface:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: NeeDo Staging environment-only infrastructure in ap-northeast-1

Parameters:
  LatestAmiId:
    Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>
    Default: /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64
  AlertEmail:
    Type: String
    AllowedPattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
  BudgetAmount:
    Type: Number
    MinValue: 1
  BudgetUnit:
    Type: String
    AllowedPattern: "^[A-Z]{3}$"
  Owner:
    Type: String
    AllowedPattern: "^[a-z0-9][a-z0-9-]{1,31}$"

Mappings:
  Network:
    Cidr:
      Vpc: 10.41.0.0/16
      PublicSubnet: 10.41.10.0/24
```

Every taggable resource must have:

```yaml
Tags:
  - Key: Project
    Value: needo
  - Key: Environment
    Value: staging
  - Key: Owner
    Value: !Ref Owner
  - Key: ManagedBy
    Value: cloudformation
```

- [ ] **Step 4: Add the dedicated public network and 80/443-only security group**

Implement these named resources and relationships:

```yaml
Resources:
  Vpc:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: !FindInMap [Network, Cidr, Vpc]
      EnableDnsHostnames: true
      EnableDnsSupport: true
      InstanceTenancy: default

  InternetGateway:
    Type: AWS::EC2::InternetGateway

  InternetGatewayAttachment:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      InternetGatewayId: !Ref InternetGateway
      VpcId: !Ref Vpc

  PublicSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref Vpc
      CidrBlock: !FindInMap [Network, Cidr, PublicSubnet]
      MapPublicIpOnLaunch: false

  PublicRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref Vpc

  DefaultPublicRoute:
    Type: AWS::EC2::Route
    DependsOn: InternetGatewayAttachment
    Properties:
      DestinationCidrBlock: 0.0.0.0/0
      GatewayId: !Ref InternetGateway
      RouteTableId: !Ref PublicRouteTable

  PublicSubnetRouteTableAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      RouteTableId: !Ref PublicRouteTable
      SubnetId: !Ref PublicSubnet

  WebSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: NeeDo Staging public HTTP and HTTPS only
      VpcId: !Ref Vpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0
          Description: Lets Encrypt HTTP-01 and redirect readiness
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
          Description: Public HTTPS
      SecurityGroupEgress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
          Description: AWS endpoints registries and approved HTTPS APIs
        - IpProtocol: udp
          FromPort: 53
          ToPort: 53
          CidrIp: 10.41.0.2/32
          Description: VPC DNS resolver UDP
        - IpProtocol: tcp
          FromPort: 53
          ToPort: 53
          CidrIp: 10.41.0.2/32
          Description: VPC DNS resolver TCP
```

Do not add IPv6 ingress, SSH, a key pair, NAT Gateway, load balancer, RDS, ElastiCache, ECS, or Route 53 resources.

- [ ] **Step 5: Add private release/backup buckets with encryption, retention, and TLS-only policies**

Create `ReleaseBucket` and `BackupBucket` without explicit names so CloudFormation avoids global-name collisions. Both resources must set `DeletionPolicy: Retain`, `UpdateReplacePolicy: Retain`, `BucketOwnerEnforced`, full public-access blocking, `AES256` default encryption, and versioning. Add `AbortIncompleteMultipartUpload` after seven days to both.

Use these backup lifecycle boundaries:

```yaml
LifecycleConfiguration:
  Rules:
    - Id: DailyBackups30Days
      Status: Enabled
      Prefix: staging/daily/
      ExpirationInDays: 30
      NoncurrentVersionExpiration:
        NoncurrentDays: 30
      AbortIncompleteMultipartUpload:
        DaysAfterInitiation: 7
    - Id: PreMigrationRecovery90Days
      Status: Enabled
      Prefix: staging/pre-migration/
      ExpirationInDays: 90
      NoncurrentVersionExpiration:
        NoncurrentDays: 90
      AbortIncompleteMultipartUpload:
        DaysAfterInitiation: 7
```

Each bucket policy must deny `s3:*` when `aws:SecureTransport` is `false`. Do not grant public principals any positive action.

- [ ] **Step 6: Add the empty retained secret and scoped instance role**

Create the secret with no `SecretString` and no `GenerateSecretString`:

```yaml
  ApplicationSecret:
    Type: AWS::SecretsManager::Secret
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      Name: /needo/staging/application
      Description: Empty until the separately approved application deployment microstep
```

Create `InstanceRole` and `InstanceProfile`. Attach only the AWS-managed `service-role/AmazonEC2RoleforSSM` replacement `arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore`, plus inline statements scoped as follows:

```yaml
Policies:
  - PolicyName: NeedoStagingRuntimeAccess
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Sid: ReadOnlyApplicationSecret
          Effect: Allow
          Action: secretsmanager:GetSecretValue
          Resource: !Ref ApplicationSecret
        - Sid: ReadReleaseObjects
          Effect: Allow
          Action: s3:GetObject
          Resource: !Sub ${ReleaseBucket.Arn}/releases/*
        - Sid: ListReleasePrefix
          Effect: Allow
          Action: s3:ListBucket
          Resource: !GetAtt ReleaseBucket.Arn
          Condition:
            StringLike:
              s3:prefix: releases/*
        - Sid: ReadWriteBackupPrefixes
          Effect: Allow
          Action:
            - s3:GetObject
            - s3:PutObject
            - s3:AbortMultipartUpload
          Resource:
            - !Sub ${BackupBucket.Arn}/staging/daily/*
            - !Sub ${BackupBucket.Arn}/staging/pre-migration/*
        - Sid: ListBackupPrefixes
          Effect: Allow
          Action: s3:ListBucket
          Resource: !GetAtt BackupBucket.Arn
          Condition:
            StringLike:
              s3:prefix:
                - staging/daily/*
                - staging/pre-migration/*
        - Sid: PublishHostMetrics
          Effect: Allow
          Action: cloudwatch:PutMetricData
          Resource: "*"
          Condition:
            StringEquals:
              cloudwatch:namespace: Needo/Staging
        - Sid: ReadCloudWatchAgentConfig
          Effect: Allow
          Action: ssm:GetParameter
          Resource: !Sub arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/needo/staging/cloudwatch-agent
```

Add scoped `logs:CreateLogStream`, `logs:DescribeLogStreams`, and `logs:PutLogEvents` permissions only for the two log group ARNs created below. Do not add `secretsmanager:ListSecrets`, wildcard `s3:*`, IAM mutation, EC2 mutation, CloudFormation, Route 53, or KMS administration to the instance role.

- [ ] **Step 7: Add the EC2 instance, EIP, independent EBS data volume, and recoverability policies**

Create `Instance` with:

```yaml
  Instance:
    Type: AWS::EC2::Instance
    Properties:
      ImageId: !Ref LatestAmiId
      InstanceType: t4g.large
      IamInstanceProfile:
        Name: !Ref InstanceProfile
      SubnetId: !Ref PublicSubnet
      SecurityGroupIds:
        - !Ref WebSecurityGroup
      MetadataOptions:
        HttpEndpoint: enabled
        HttpTokens: required
        HttpPutResponseHopLimit: 1
      Monitoring: true
      BlockDeviceMappings:
        - DeviceName: /dev/xvda
          Ebs:
            DeleteOnTermination: true
            Encrypted: true
            VolumeSize: 30
            VolumeType: gp3
```

Do not specify `KeyName` or application `UserData`. Add `ElasticIp` plus `ElasticIpAssociation`.

Create the data volume and attachment separately:

```yaml
  DataVolume:
    Type: AWS::EC2::Volume
    DeletionPolicy: Snapshot
    UpdateReplacePolicy: Snapshot
    Properties:
      AvailabilityZone: !GetAtt PublicSubnet.AvailabilityZone
      Encrypted: true
      Size: 70
      VolumeType: gp3

  DataVolumeAttachment:
    Type: AWS::EC2::VolumeAttachment
    Properties:
      Device: /dev/sdf
      InstanceId: !Ref Instance
      VolumeId: !Ref DataVolume
```

- [ ] **Step 8: Add host metrics, log groups, SNS alarms, and the account budget**

Create:

- `/needo/staging/system` and `/needo/staging/docker` log groups with 30-day retention;
- an SNS topic and email subscription using `AlertEmail`;
- an SSM String parameter `/needo/staging/cloudwatch-agent` containing CloudWatch Agent JSON for `mem_used_percent`, `swap_used_percent`, and `disk_used_percent` at 60-second intervals, namespace `Needo/Staging`, `append_dimensions.InstanceId`, and `drop_device: true`;
- `StatusCheckFailed`, high memory, root disk, and `/srv/needo` data-disk alarms with two consecutive five-minute periods and SNS actions;
- one monthly `COST` `AWS::Budgets::Budget` using `BudgetAmount`/`BudgetUnit` and five allowed notifications: actual 75%, forecasted 90%, actual 90%, forecasted 100%, and actual 100%, all with `ThresholdType: PERCENTAGE` and the alert email subscriber.

Use the budget percentage mapping exactly:

```yaml
NotificationsWithSubscribers:
  - Notification:
      ComparisonOperator: GREATER_THAN
      NotificationType: ACTUAL
      Threshold: 75
      ThresholdType: PERCENTAGE
    Subscribers: &budgetSubscribers
      - Address: !Ref AlertEmail
        SubscriptionType: EMAIL
  - Notification:
      ComparisonOperator: GREATER_THAN
      NotificationType: FORECASTED
      Threshold: 90
      ThresholdType: PERCENTAGE
    Subscribers: *budgetSubscribers
  - Notification:
      ComparisonOperator: GREATER_THAN
      NotificationType: ACTUAL
      Threshold: 90
      ThresholdType: PERCENTAGE
    Subscribers: *budgetSubscribers
  - Notification:
      ComparisonOperator: GREATER_THAN
      NotificationType: FORECASTED
      Threshold: 100
      ThresholdType: PERCENTAGE
    Subscribers: *budgetSubscribers
  - Notification:
      ComparisonOperator: GREATER_THAN
      NotificationType: ACTUAL
      Threshold: 100
      ThresholdType: PERCENTAGE
    Subscribers: *budgetSubscribers
```

- [ ] **Step 9: Add an idempotent SSM environment bootstrap document**

Create an `AWS::SSM::Document` of type `Command`, schema version `2.2`, with validated `DataVolumeId` and `CloudWatchAgentConfigParameter` parameters. Its single `aws:runShellScript` step must:

1. use `set -euo pipefail`;
2. wait up to five minutes for the EBS NVMe device whose normalized serial equals `DataVolumeId` without the hyphen;
3. format only a blank device as XFS and reject an existing non-XFS filesystem;
4. mount by filesystem UUID at `/srv/needo` through `/etc/fstab`;
5. prove `findmnt --mountpoint /srv/needo` before making any child directory;
6. create the seven approved directories with mode `0750`;
7. install/enable Docker and CloudWatch Agent only;
8. load the agent configuration from the scoped SSM parameter;
9. write `/var/lib/needo/environment-bootstrap-v1` only after all checks pass;
10. never retrieve Secrets Manager or application artifacts.

The fail-closed directory portion must be literal shell code in the document:

```bash
mountpoint=/srv/needo
findmnt --mountpoint "$mountpoint" >/dev/null
test "$(findmnt -n -o FSTYPE --mountpoint "$mountpoint")" = "xfs"
install -d -m 0750 \
  "$mountpoint/mysql" \
  "$mountpoint/redis" \
  "$mountpoint/media/customer-avatars" \
  "$mountpoint/media/identity-applications" \
  "$mountpoint/media/im-media" \
  "$mountpoint/media/content-media" \
  "$mountpoint/releases"
```

The document must not use `curl | sh`, write any `.env`, create a user, invoke Docker Compose, pull images, or open listeners.

Add a second `AWS::SSM::Document` named `HostVerificationDocument`. It contains only the fixed, non-mutating verification script defined in Task 7 Step 4. It must accept no parameters so live verification cannot interpolate operator-controlled shell content.

- [ ] **Step 10: Add non-secret outputs for orchestration**

Output exact keys:

```yaml
Outputs:
  InstanceId:
    Value: !Ref Instance
  ElasticIp:
    Value: !Ref ElasticIp
  DataVolumeId:
    Value: !Ref DataVolume
  ReleaseBucketName:
    Value: !Ref ReleaseBucket
  BackupBucketName:
    Value: !Ref BackupBucket
  ApplicationSecretArn:
    Value: !Ref ApplicationSecret
  HostBootstrapDocumentName:
    Value: !Ref HostBootstrapDocument
  HostVerificationDocumentName:
    Value: !Ref HostVerificationDocument
  CloudWatchAgentConfigParameterName:
    Value: !Ref CloudWatchAgentConfigParameter
  BudgetName:
    Value: !Ref MonthlyBudget
```

- [ ] **Step 11: Run static tests and lint the YAML shape locally**

```bash
npm test -- --run deploy/aws-staging/cloudformation.contract.test.mjs
git diff --check
```

Expected: PASS; no whitespace errors. Do not call AWS yet.

- [ ] **Step 12: Commit the infrastructure template**

```bash
git add deploy/aws-staging/cloudformation.yml deploy/aws-staging/cloudformation.contract.test.mjs
git commit -m "feat: define AWS staging infrastructure stack"
```

### Task 3: Add a non-shell AWS CLI adapter with redacted error handling

**Files:**
- Create: `scripts/aws-staging-cli.test.mjs`
- Create: `scripts/aws-staging-cli.mjs`

**Interfaces:**
- Consumes: AWS CLI argument arrays and the resolved named profile/region.
- Produces: parsed JSON/text without invoking a shell and a sanitized command failure.
- Never accepts credential or secret flags.

- [ ] **Step 1: Write failing adapter tests with a fake process runner**

Test these cases:

```js
import { describe, expect, it, vi } from "vitest";
import { createAwsCli } from "./aws-staging-cli.mjs";

describe("AWS CLI adapter", () => {
  it("adds the named profile/region and parses JSON without a shell", async () => {
    const execFileImpl = vi.fn((_file, _args, _options, callback) => {
      callback(null, '{"Account":"123456789012"}\n', "");
    });
    const aws = createAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl
    });
    await expect(aws.json(["sts", "get-caller-identity"])).resolves.toEqual({
      Account: "123456789012"
    });
    expect(execFileImpl).toHaveBeenCalledWith(
      "aws",
      [
        "sts", "get-caller-identity",
        "--profile", "needo-staging-deployer",
        "--region", "ap-northeast-1",
        "--output", "json",
        "--no-cli-pager"
      ],
      expect.objectContaining({ shell: false }),
      expect.any(Function)
    );
  });

  it("rejects credential and secret-value command surfaces", () => {
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1" });
    expect(() => aws.text(["secretsmanager", "get-secret-value"])).toThrow("forbidden");
    expect(() => aws.text(["configure", "set", "aws_secret_access_key", "x"])).toThrow("forbidden");
  });

  it("returns a sanitized failure without command stdout", async () => {
    const execFileImpl = vi.fn((_file, _args, _options, callback) => {
      const error = Object.assign(new Error("process failed"), { code: 254 });
      callback(error, "possibly-sensitive-output", "AccessDenied");
    });
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });
    await expect(aws.json(["sts", "get-caller-identity"])).rejects.toThrow(
      "AWS CLI failed (254): AccessDenied"
    );
  });
});
```

- [ ] **Step 2: Run the adapter test and verify RED**

```bash
npm test -- --run scripts/aws-staging-cli.test.mjs
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement `execFile`-only AWS invocation**

Create `scripts/aws-staging-cli.mjs` around `node:child_process.execFile`/`node:util.promisify`. The implementation must:

- always call binary `aws` directly with `shell: false`;
- append `--profile`, `--region`, `--output`, and `--no-cli-pager` internally;
- reject `get-secret-value`, credential configuration, and any argument containing `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `SecretString`, or `password` case-insensitively;
- cap `maxBuffer` at 4 MiB;
- return parsed JSON from `json()` and trimmed stdout from `text()`;
- on failure, discard stdout and expose only exit code plus the final non-empty stderr line, capped at 500 characters.

Use this public surface:

```js
export function createAwsCli({ profile, region, execFileImpl = execFile }) {
  return Object.freeze({
    json(args) { return invoke(args, "json").then(({ stdout }) => JSON.parse(stdout)); },
    text(args) { return invoke(args, "text").then(({ stdout }) => stdout.trim()); }
  });
}
```

- [ ] **Step 4: Run the adapter tests and verify GREEN**

```bash
npm test -- --run scripts/aws-staging-cli.test.mjs
```

Expected: PASS; no AWS process is actually invoked by the tests.

- [ ] **Step 5: Commit the adapter**

```bash
git add scripts/aws-staging-cli.mjs scripts/aws-staging-cli.test.mjs
git commit -m "feat: add guarded AWS CLI adapter"
```

### Task 4: Implement a read-only preflight that proves identity, region, temporary credentials, template validity, and DNS baseline

**Files:**
- Create: `scripts/aws-staging-preflight-lib.test.mjs`
- Create: `scripts/aws-staging-preflight-lib.mjs`
- Create: `scripts/aws-staging-preflight.mjs`

**Interfaces:**
- Consumes: Task 1 configuration and Task 3 AWS adapter.
- Produces: a non-secret preflight record with caller account/ARN, AMI ID/architecture, template validation result, current stack state, the exact configured hostname, and its current A-record set.
- Makes only read-only AWS/DNS calls.

- [ ] **Step 1: Write failing preflight policy tests**

Use a fake AWS client to assert:

```js
import { describe, expect, it, vi } from "vitest";
import { runAwsStagingPreflight } from "./aws-staging-preflight-lib.mjs";

const config = {
  accountId: "123456789012",
  profile: "needo-staging-deployer",
  region: "ap-northeast-1",
  hostname: "staging.needo.life",
  stackName: "needo-staging-infrastructure",
  templatePath: "/repo/deploy/aws-staging/cloudformation.yml"
};

describe("AWS Staging preflight", () => {
  it("accepts a matching assumed role and ARM64 AL2023 AMI", async () => {
    const aws = {
      json: vi.fn()
        .mockResolvedValueOnce({ Account: config.accountId, Arn: "arn:aws:sts::123456789012:assumed-role/NeedoDeployer/session" })
        .mockResolvedValueOnce({ Parameter: { Value: "ami-0123" } })
        .mockResolvedValueOnce({ Images: [{ Architecture: "arm64", State: "available" }] })
        .mockResolvedValueOnce({ Parameters: [] })
        .mockRejectedValueOnce(new Error("does not exist")),
      text: vi.fn().mockResolvedValue("sso_session\tneedo")
    };
    const result = await runAwsStagingPreflight({
      aws,
      config,
      resolveDns: async () => []
    });
    expect(result).toMatchObject({ accountId: config.accountId, callerKind: "assumed-role", amiId: "ami-0123", dnsA: [] });
  });

  it.each([
    ["arn:aws:iam::123456789012:root", "root"],
    ["arn:aws:sts::999999999999:assumed-role/Other/session", "account"],
    ["arn:aws:iam::123456789012:user/long-lived", "temporary"]
  ])("rejects unsafe caller %s", async (arn, expected) => {
    const aws = { json: vi.fn().mockResolvedValue({ Account: arn.includes("999") ? "999999999999" : config.accountId, Arn: arn }), text: vi.fn().mockResolvedValue("") };
    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] })).rejects.toThrow(expected);
  });
});
```

- [ ] **Step 2: Run the preflight test and verify RED**

```bash
npm test -- --run scripts/aws-staging-preflight-lib.test.mjs
```

Expected: FAIL because the library does not exist.

- [ ] **Step 3: Implement the read-only sequence**

`runAwsStagingPreflight` must first structurally validate `config.hostname` before any AWS or DNS call, then execute in this order and stop on the first mismatch:

1. `aws configure list --profile ...` through the adapter's text surface and require `sso_session`, `sso_start_url`, `credential_process`, or an `assume-role` credential source; a direct IAM user ARN remains forbidden even if credentials are temporary.
2. `sts get-caller-identity`; require exact account ID and an STS `assumed-role` ARN; reject root and `iam::...:user/...`.
3. `ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64`; obtain the live AMI ID.
4. `ec2 describe-images --image-ids <id>`; require `Architecture=arm64`, `State=available`, and an Amazon owner.
5. capture one clean tracked template at the full current Git revision and run
   `cloudformation validate-template --template-body <same-immutable-byte-string>`;
   report its SHA-256 and revision for action-time approval.
6. `cloudformation describe-stacks --stack-name needo-staging-infrastructure`; accept nonexistence only when AWS returns the specific CloudFormation `ValidationError` saying that this stack does not exist. Propagate `AccessDenied`, throttling, transport, and every other error. For an existing stack, accept a stable `CREATE_COMPLETE` or `UPDATE_COMPLETE` status and reject `*_IN_PROGRESS`, `*_FAILED`, rollback, and delete states.
7. resolve only `config.hostname` using `node:dns/promises.resolve4`; convert `ENODATA`/`ENOTFOUND` to `[]` and preserve any real A records. On 2026-09-03, public lookup of the approved `staging.needo.life` target was `NXDOMAIN` because no `needo.life` delegation was observed; Onamae DNS remains external and untouched.

Return a frozen object. Do not include profile cache paths or credential source contents.

- [ ] **Step 4: Implement the preflight CLI wrapper**

`scripts/aws-staging-preflight.mjs` must parse Task 1 flags, construct the AWS adapter, run the preflight, and print only a compact redacted summary:

```json
{
  "gate": "aws-staging-preflight",
  "accountId": "123456789012",
  "callerKind": "assumed-role",
  "region": "ap-northeast-1",
  "hostname": "staging.needo.life",
  "amiArchitecture": "arm64",
  "templateSha256": "<lower-case-sha256>",
  "sourceRevision": "<full-git-revision>",
  "stackState": "ABSENT",
  "dnsA": []
}
```

Do not print the full caller ARN or alert email.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
npm test -- --run scripts/aws-staging-config.test.mjs scripts/aws-staging-cli.test.mjs scripts/aws-staging-preflight-lib.test.mjs
```

Expected: PASS with all AWS calls mocked.

- [ ] **Step 6: Commit preflight support**

```bash
git add scripts/aws-staging-preflight.mjs scripts/aws-staging-preflight-lib.mjs scripts/aws-staging-preflight-lib.test.mjs
git commit -m "feat: add AWS staging safety preflight"
```

### Task 5: Implement CloudFormation deployment and stack-output collection

**Files:**
- Create: `scripts/aws-staging-deploy-lib.test.mjs`
- Create: `scripts/aws-staging-deploy-lib.mjs`
- Create: `scripts/aws-staging-deploy.mjs`

**Interfaces:**
- Consumes: a successful fresh preflight plus resolved configuration.
- Produces: the CloudFormation stack and a redacted JSON evidence file under `outputs/aws-staging/`.
- This is the first state-changing step and requires the user's temporary AWS permission to be active.

- [ ] **Step 1: Write failing deployment command tests**

The fake AWS client must prove exact parameter/tag/capability boundaries:

```js
expect(aws.json).toHaveBeenCalledWith([
  "cloudformation", "create-stack",
  "--stack-name", "needo-staging-infrastructure",
  "--template-body", templateBody,
  "--parameters",
  "ParameterKey=ExpectedRegion,ParameterValue=ap-northeast-1",
  "ParameterKey=ExpectedAccountId,ParameterValue=123456789012",
  "ParameterKey=AlertEmail,ParameterValue=ops@example.com",
  "ParameterKey=BudgetAmount,ParameterValue=20000",
  "ParameterKey=BudgetUnit,ParameterValue=JPY",
  "ParameterKey=Owner,ParameterValue=needo",
  "--capabilities", "CAPABILITY_NAMED_IAM",
  "--tags",
  "Key=Project,Value=needo",
  "Key=Environment,Value=staging",
  "Key=Owner,Value=needo",
  "Key=ManagedBy,Value=cloudformation",
  "--on-failure", "DO_NOTHING"
]);
```

Also test that deployment refuses when:

- preflight account/region differs from configuration;
- preflight hostname differs from configuration;
- preflight stack status is anything other than exactly `ABSENT`, including a
  stable `CREATE_COMPLETE` or `UPDATE_COMPLETE` stack, before any AWS mutation;
- DNS result changes between preflight and the deploy call before stack mutation;
- `create-stack` returns `AlreadyExists` or a StackId outside the exact account, region, and stack name;
- CloudFormation returns a final state other than `CREATE_COMPLETE`;
- required output keys are missing.

- [ ] **Step 2: Run the deployment test and verify RED**

```bash
npm test -- --run scripts/aws-staging-deploy-lib.test.mjs
```

Expected: FAIL because deployment support does not exist.

- [ ] **Step 3: Implement deploy/describe without shell or secret parameters**

`deployAwsStagingInfrastructure` must:

1. require the preflight result created in the same process;
2. require `preflight.hostname === config.hostname` and `preflight.stackState === "ABSENT"`; a stable existing same-name stack is diagnostic-only and requires a separate exact-identity update review/microstep;
3. re-resolve only `config.hostname` immediately before the mutation and require the same sorted A-record array as preflight;
4. require the explicitly approved full source revision and template SHA-256,
   re-attest the clean tracked path/identity/bytes, and invoke the exact atomic
   `cloudformation create-stack` with the same immutable byte string used by
   in-process validation; propagate `AlreadyExists` without waiting,
   describing, updating, or deploying;
5. validate the returned full StackId against the exact account, region, and stack name, then wait, `describe-stacks`, and `list-stack-resources` only by that StackId and require `CREATE_COMPLETE`;
6. require the exact tags, resource types, ten outputs, and output-to-resource identity bindings;
7. call `ec2 describe-instances` and record instance type/state, not user data;
8. return timestamped evidence containing the full StackId, exact hostname/tags, template digest, and resource identity digest without the alert email, secret ARN, or CloudFormation parameters.

The CLI wrapper must create `outputs/aws-staging/` with mode `0700` and write `environment-stack.json` with mode `0600` using an atomic temporary-file rename. Include:

```json
{
  "scope": "environment-only",
  "applicationDeployed": false,
  "migrationRun": false,
  "seedRun": false,
  "dnsModified": false
}
```

Do not write AWS CLI credential output or the complete caller ARN.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npm test -- --run scripts/aws-staging-deploy-lib.test.mjs
```

Expected: PASS with no AWS state changed by tests.

- [ ] **Step 5: Commit deployment orchestration**

```bash
git add scripts/aws-staging-deploy.mjs scripts/aws-staging-deploy-lib.mjs scripts/aws-staging-deploy-lib.test.mjs
git commit -m "feat: deploy AWS staging environment stack"
```

### Task 6: Implement idempotent SSM host bootstrap orchestration

**Files:**
- Create: `scripts/aws-staging-bootstrap-host-lib.test.mjs`
- Create: `scripts/aws-staging-bootstrap-host-lib.mjs`
- Create: `scripts/aws-staging-bootstrap-host.mjs`

**Interfaces:**
- Consumes: live stack outputs from CloudFormation, never a user-edited resource ID.
- Produces: an SSM command invocation that initializes the data volume, directory tree, Docker engine, and CloudWatch Agent only.
- Does not establish SSH or retrieve application secrets.

- [ ] **Step 1: Write failing bootstrap orchestration tests**

Prove that the library:

- runs a fresh in-process preflight and stops before every waiter or `ssm send-command` on an account, region, hostname, credential, or stable-stack mismatch;
- validates the full account/region-bound StackId, exact tags, resource types, outputs and output bindings, then uses that StackId for `list-stack-resources`;
- validates that the exact stack data volume is attached to the exact stack instance at `/dev/sdf` before any waiter or `ssm send-command`;
- retrieves and attests the exact bootstrap document content and positive immutable version, plus the exact CloudWatch Agent parameter ARN/content/version;
- waits for EC2 `instance-status-ok` and SSM `PingStatus=Online`;
- sends exactly one command pinned to the attested document version; its parameters contain only the data-volume ID, CloudWatch Agent parameter name, and attested numeric parameter version;
- waits for the command and requires `Status=Success`, `ResponseCode=0`;
- never passes `ApplicationSecretArn`, `get-secret-value`, release bucket, Docker Compose, or Prisma arguments;
- accepts a second successful invocation as an idempotency proof.

Expected command shape:

```js
[
  "ssm", "send-command",
  "--document-name", outputs.HostBootstrapDocumentName,
  "--document-version", documentAttestation.version,
  "--instance-ids", outputs.InstanceId,
  "--parameters",
  `DataVolumeId=${outputs.DataVolumeId},CloudWatchAgentConfigParameter=${outputs.CloudWatchAgentConfigParameterName},CloudWatchAgentConfigParameterVersion=${parameterAttestation.version}`,
  "--comment", "NeeDo Staging environment-only host bootstrap"
]
```

- [ ] **Step 2: Run the bootstrap test and verify RED**

```bash
npm test -- --run scripts/aws-staging-bootstrap-host-lib.test.mjs
```

Expected: FAIL because the bootstrap library does not exist.

- [ ] **Step 3: Implement bounded waits and redacted failure behavior**

Use AWS waiters where available:

```text
cloudformation list-stack-resources --stack-name <full-validated-StackId>
ec2 describe-instances --instance-ids <InstanceId>
ec2 describe-volumes --volume-ids <DataVolumeId>
ssm get-document --name <HostBootstrapDocumentName> --document-version $LATEST --document-format JSON
ssm get-parameter --name <CloudWatchAgentConfigParameterName>
ec2 wait instance-status-ok --instance-ids <InstanceId>
ssm describe-instance-information --filters Key=InstanceIds,Values=<InstanceId>
ssm send-command ...
ssm wait command-executed --command-id <CommandId> --instance-id <InstanceId>
ssm get-command-invocation --command-id <CommandId> --instance-id <InstanceId>
```

All identity, attachment, document-content/version, and parameter-content/version checks occur before the first waiter or `send-command`; drift makes zero mutation calls. Poll SSM registration for at most ten minutes with a ten-second interval. Record only command ID, status, response code, attestation versions/digests, and timestamps; do not persist standard output or standard error because future document revisions could include sensitive diagnostics.

- [ ] **Step 4: Run the bootstrap tests and verify GREEN**

```bash
npm test -- --run scripts/aws-staging-bootstrap-host-lib.test.mjs
```

Expected: PASS with mocked AWS responses.

- [ ] **Step 5: Commit host bootstrap orchestration**

```bash
git add scripts/aws-staging-bootstrap-host.mjs scripts/aws-staging-bootstrap-host-lib.mjs scripts/aws-staging-bootstrap-host-lib.test.mjs
git commit -m "feat: bootstrap AWS staging host through SSM"
```

### Task 7: Implement a live environment-only acceptance gate

**Files:**
- Create: `scripts/aws-staging-verify-lib.test.mjs`
- Create: `scripts/aws-staging-verify-lib.mjs`
- Create: `scripts/aws-staging-verify.mjs`

**Interfaces:**
- Consumes: fresh read-only AWS descriptions and one SSM verification command.
- Produces: pass/fail assertions and a redacted `outputs/aws-staging/environment-acceptance.json` file.
- Explicitly proves absence of app deployment, migration, seed, DNS mutation, and secret versions.

- [ ] **Step 1: Write the failing acceptance matrix tests**

Build one fully passing fixture and mutate one invariant at a time. Required failures:

| Invariant | Reject when |
|---|---|
| Stack | status is not `CREATE_COMPLETE`/`UPDATE_COMPLETE` |
| Tags | any taggable stack resource lacks `Project=needo`, `Environment=staging`, `Owner=<approved owner>`, or `ManagedBy=cloudformation` |
| EC2 | not `t4g.large`, not `arm64`, key name exists, IMDSv2 optional, or detailed monitoring disabled |
| Network | ingress differs from exact `{80/tcp,443/tcp}` |
| EBS | root not 30 GiB encrypted gp3 or data not 70 GiB encrypted gp3 |
| SSM | managed instance is not `Online` |
| Mount | `/srv/needo` is not XFS on the exact data volume or any approved directory is missing |
| Services | Docker/SSM/CloudWatch Agent inactive |
| Containers | any running container exists in environment-only stage |
| S3 | either bucket lacks encryption/versioning/public block/lifecycle retention, or its retained policy differs from the exact deny-only `aws:SecureTransport="false"` policy for the bucket and object ARNs |
| Secret | secret has any version ID |
| Monitoring | required alarms/log groups/agent parameter absent, or any alarm does not return exact boolean `ActionsEnabled: true` |
| Budget | amount/unit differs or thresholds/types/subscriber differ |
| DNS | current A records differ from the recorded preflight set |

- [ ] **Step 2: Run acceptance tests and verify RED**

```bash
npm test -- --run scripts/aws-staging-verify-lib.test.mjs
```

Expected: FAIL because verification support does not exist.

- [ ] **Step 3: Implement AWS descriptions and exact assertions**

Use read-only description calls:

```text
cloudformation describe-stacks
cloudformation list-stack-resources
ec2 describe-instances
ec2 describe-images
ec2 describe-security-groups
ec2 describe-volumes
ec2 describe-tags
ssm describe-instance-information
ssm list-tags-for-resource
s3api get-public-access-block
s3api get-bucket-encryption
s3api get-bucket-versioning
s3api get-bucket-lifecycle-configuration
s3api get-bucket-tagging
s3api get-bucket-policy --expected-bucket-owner <approved-account-id>
iam list-role-tags
secretsmanager describe-secret
secretsmanager list-secret-version-ids
logs list-tags-for-resource
logs describe-log-groups
cloudwatch describe-alarms
cloudwatch list-tags-for-resource
sns list-tags-for-resource
budgets describe-budget
budgets describe-notifications-for-budget
budgets describe-subscribers-for-notification
budgets list-tags-for-resource
```

The budget API is global but must still use the explicit account ID and named profile. The verifier must compare the configured amount/unit rather than assuming JPY.

- [ ] **Step 4: Verify the host through the parameter-free repository-owned SSM document**

Run a fixed verification script with no interpolated user strings. It must output JSON containing only booleans and non-secret device/mount metadata:

```bash
set -euo pipefail
findmnt --mountpoint /srv/needo >/dev/null
test "$(findmnt -n -o FSTYPE --mountpoint /srv/needo)" = "xfs"
for path in mysql redis media/customer-avatars media/identity-applications media/im-media media/content-media releases; do
  test -d "/srv/needo/$path"
done
systemctl is-active --quiet amazon-ssm-agent
systemctl is-active --quiet docker
systemctl is-active --quiet amazon-cloudwatch-agent
test -f /var/lib/needo/environment-bootstrap-v1
test -z "$(docker ps -q)"
test ! -e /srv/needo/releases/current
printf '{"mount":true,"filesystem":"xfs","directories":true,"services":true,"runningContainers":0,"activeRelease":false}\n'
```

Do not run `docker inspect`, list environment variables, read `/proc/*/environ`, or read Secrets Manager.

- [ ] **Step 5: Write redacted acceptance evidence atomically**

`environment-acceptance.json` must include:

- timestamp, exact account ID, region, stack ID/status, resource IDs, Elastic IP;
- tag-coverage result for every taggable resource returned by the stack and Resource Groups Tagging API;
- EC2 type/architecture/IMDSv2/key-absence;
- exact ingress ports;
- volume sizes/types/encryption and data mount filesystem;
- SSM online and bootstrap command status;
- bucket controls/lifecycle summaries plus only the reconstructed
  `tlsOnly: true` and canonical exact-policy SHA-256 attestations;
- `secretVersionCount: 0` without secret values;
- alarm/log/budget threshold summaries, including exact reconstructed
  `actionsEnabled: true` for every alarm;
- preflight and post-verification DNS A-record arrays;
- explicit false flags for app, migration, seed, DNS mutation, and business-data mutation;
- a `waivedBaselineFailures` array naming only the three previously approved failures.

Mask the alert email and do not record credentials, command output, future secret values, or an unredacted user home path.

- [ ] **Step 6: Run acceptance library tests and verify GREEN**

```bash
npm test -- --run scripts/aws-staging-verify-lib.test.mjs
```

Expected: PASS across the passing fixture and every rejected invariant.

- [ ] **Step 7: Commit the acceptance gate**

```bash
git add scripts/aws-staging-verify.mjs scripts/aws-staging-verify-lib.mjs scripts/aws-staging-verify-lib.test.mjs
git commit -m "feat: verify AWS staging environment boundary"
```

### Task 8: Add operator commands, runbook, and rollback boundaries

**Files:**
- Modify: `package.json`
- Create: `docs/aws-staging-environment-runbook.md`
- Modify: `docs/deployment.md`

**Interfaces:**
- Produces one documented sequence for preflight, deployment, SSM bootstrap, verification, and rollback.
- Keeps application deployment explicitly deferred.

- [ ] **Step 1: Keep live AWS entrypoints outside npm lifecycle execution**

`package.json` must not expose the four guarded live commands or any matching
pre/post lifecycle hooks. Use only the exact-object `needo_aws_staging`
procedure defined in the runbook; never add `.env` loading or credential values
to package metadata.

- [ ] **Step 2: Write the runbook inputs and stop gates**

`docs/aws-staging-environment-runbook.md` must state:

- prerequisite AWS CLI v2; current machine initially has no AWS CLI, so installation requires a separate approved system change;
- required AWS CLI v2 plus the Session Manager plugin, named SSO/assumed-role profile, explicit account ID, alert email, actual AWS billing currency, and approved monthly amount;
- required deploy-role action families: scoped CloudFormation create/describe/list/wait operations without automatic update/delete, scoped EC2/VPC/EBS/EIP, IAM role/profile/policy and PassRole for the stack role, S3 bucket controls, Secrets Manager create/describe/tag, SSM document/parameter/command, Logs/CloudWatch/SNS, and Budgets create/describe/update;
- no root, no long-lived keys, no SSH key, and no secrets pasted into the CLI;
- current public DNS baseline (`needo.life` observed as `NXDOMAIN` with no delegation on 2026-09-03), Onamae's external registration/nameserver responsibility, and the rule that Staging/apex/`www` DNS remains untouched;
- SNS email subscription confirmation is required before CloudWatch notifications are fully active;
- the command sequence below uses the same flags every time.

Use this invocation form. Variable operator-supplied values remain in documentation angle brackets; the approved Staging hostname is shown concretely:

```bash
needo_aws_staging preflight \
  <approved-full-source-revision> \
  <approved-absolute-node-v22-path> \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency> \
  --source-revision <approved-full-source-revision>
```

Then `needo_aws_staging deploy` with the same eight environment/provenance flags plus
`--template-sha256 <approved-template-sha256>`. Run
`needo_aws_staging bootstrap-host` twice for idempotency and `needo_aws_staging verify` with
the same eight flags, including the approved source revision, explicit region,
and exact `--hostname staging.needo.life`.

- [ ] **Step 3: Document failure recovery without destructive shortcuts**

The runbook must distinguish:

- preflight/validation failure: no AWS mutation, fix permission/config/template and retry;
- CloudFormation create failure before useful resources: inspect stack events, preserve evidence, and request explicit approval before deleting the failed stack;
- host bootstrap failure: do not format another device, inspect the SSM invocation and volume attachment, fix forward, rerun idempotently;
- acceptance failure: do not deploy the application or change DNS;
- stack rollback/removal: retained buckets, their TLS-only BucketPolicy resources, and the secret remain, data-volume deletion creates a snapshot, and material deletion requires a separate explicit user approval;
- budget/SNS email unconfirmed: infrastructure may exist, but the environment gate remains incomplete.

Never recommend `aws cloudformation delete-stack`, EBS deletion, snapshot deletion, bucket emptying, or secret force deletion as an automatic cleanup command.

- [ ] **Step 4: Link the new runbook from existing deployment docs**

At the top of the Staging section in `docs/deployment.md`, add a short environment distinction:

```md
For the approved dual-region single-EC2 environment-only gate, with Sydney for
the personal test and Tokyo for a later company-account deployment, follow
[`docs/aws-staging-environment-runbook.md`](./aws-staging-environment-runbook.md).
That gate creates and verifies infrastructure only; the Compose commands below
are application deployment steps and must not run until the separate application
microstep is approved.
```

- [ ] **Step 5: Run documentation/config-focused verification**

```bash
npm test -- --run \
  scripts/aws-staging-config.test.mjs \
  scripts/aws-staging-cli.test.mjs \
  scripts/aws-staging-preflight-lib.test.mjs \
  scripts/aws-staging-deploy-lib.test.mjs \
  scripts/aws-staging-bootstrap-host-lib.test.mjs \
  scripts/aws-staging-verify-lib.test.mjs \
  deploy/aws-staging/cloudformation.contract.test.mjs
node --check scripts/aws-staging-preflight.mjs
node --check scripts/aws-staging-deploy.mjs
node --check scripts/aws-staging-bootstrap-host.mjs
node --check scripts/aws-staging-verify.mjs
git diff --check
```

Expected: all deployment-specific tests PASS; all four CLI files parse; no whitespace errors.

- [ ] **Step 6: Commit operator documentation**

```bash
git add package.json docs/aws-staging-environment-runbook.md docs/deployment.md
git commit -m "docs: add AWS staging environment runbook"
```

### Task 9: Perform a clean pre-deployment review without touching AWS

**Files:**
- Verify all files changed by Tasks 1–8.

- [ ] **Step 1: Confirm branch/base and scope**

```bash
git merge-base --is-ancestor 3cc5a978e8afec42baa41bee0077bb4166c47265 HEAD
git status --short
git diff --stat 3cc5a978e8afec42baa41bee0077bb4166c47265..HEAD
git diff --name-only 3cc5a978e8afec42baa41bee0077bb4166c47265..HEAD
```

Expected: ancestor check exits 0; only design/plan, AWS deployment code/tests/template, package scripts, and deployment documentation appear. No application source, Prisma migration, seed, `.env`, credential, or generated output is committed.

- [ ] **Step 2: Search for forbidden content**

```bash
rg -n "AKIA|ASIA|aws_secret_access_key|AWS_SESSION_TOKEN|SecretString:|GenerateSecretString:|get-secret-value|docker compose|prisma|seed|Route53|KeyName:" \
  deploy/aws-staging scripts/aws-staging-* docs/aws-staging-environment-runbook.md
```

Expected: only intentional test assertions/documented prohibitions appear; no credential, secret value, application deployment, DNS mutation, SSH key, migration, or seed implementation exists.

- [ ] **Step 3: Run all environment-only automated gates once**

Use the exact focused command from Task 8. Do not rerun or repair the waived full-suite failures as part of this infrastructure checkpoint.

- [ ] **Step 4: Validate the template with AWS only after temporary read-only access is available**

Run preflight with all seven approved flag pairs:

```bash
needo_aws_staging preflight \
  <approved-full-source-revision> \
  <approved-absolute-node-v22-path> \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency> \
  --source-revision <approved-full-source-revision>
```

Expected:

- exact approved account and the explicitly selected approved region;
- assumed-role/SSO caller;
- AL2023 ARM64 AMI available;
- CloudFormation template validates;
- stack state is recorded as absent or stable for diagnostics; only exactly
  `ABSENT` may continue to Task 10 initial deployment;
- DNS baseline recorded without modification.

Stop here if the user has not yet provided temporary AWS access, exact account ID, alert email, and billing-currency amount/unit.

- [ ] **Step 5: Commit review-only corrections if needed**

If review changes are required, rerun the focused gate and commit only those corrections:

```bash
git add deploy/aws-staging scripts/aws-staging-* package.json docs/aws-staging-environment-runbook.md docs/deployment.md
git commit -m "fix: harden AWS staging environment gate"
```

### Task 10: Execute the live environment-only AWS gate after the user supplies temporary authority

**Files:**
- Create locally, ignored: `outputs/aws-staging/environment-stack.json`
- Create locally, ignored: `outputs/aws-staging/environment-acceptance.json`
- Do not modify committed application files during live execution.

**Required user inputs at this gate:**
- named temporary AWS CLI profile whose STS caller is an `assumed-role` session
  in the exact expected account;
- exact 12-digit AWS account ID;
- exact approved region: `ap-southeast-2` for the personal-account live gate,
  or `ap-northeast-1` for a later company-account deployment;
- approved Staging hostname `staging.needo.life` (apex `needo.life` and `www.needo.life` remain untouched);
- alert email address;
- actual AWS billing currency and explicitly approved monthly amount corresponding to the approximately 20,000 JPY ceiling.

- [ ] **Step 1: Use only the repository's hardened executable attestation**

Do not select an executable through `PATH` or run raw AWS CLI/plugin version
checks. Each repository wrapper resolves and attests its approved absolute AWS
CLI v2 executable before credential resolution. Installing or upgrading AWS CLI
or the Session Manager plugin remains a separate explicitly approved system
change.

- [ ] **Step 2: Establish and prove the temporary session**

Use only the named temporary profile whose STS caller is an `assumed-role`
session in the exact expected account. Root, IAM-user, federated-user,
environment, and shared-credential-file callers are forbidden. AWS CLI v2
`login` is accepted only when both the access-key and secret-key rows from
`aws configure list --profile <named-temporary-profile>` report exactly
`login`; STS must still pass the exact-account `assumed-role` check. Never ask
the user to paste access key, secret key, or session token into chat, repository
files, or shell history. Verify with the repository preflight, not an unscoped
mutation.

- [ ] **Step 3: Run read-only preflight and preserve the summary**

```bash
needo_aws_staging preflight \
  <approved-full-source-revision> \
  <approved-absolute-node-v22-path> \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency> \
  --source-revision <approved-full-source-revision>
```

Expected: gate passes and reports stack/DNS baseline. Only `stackState=ABSENT`
may continue to the initial deploy; an existing stable stack stops here without
mutation and requires a separate exact-identity update review/microstep. If
preflight fails, no stack mutation occurs.

- [ ] **Step 4: Deploy the CloudFormation environment**

```bash
needo_aws_staging deploy \
  <approved-full-source-revision> \
  <approved-absolute-node-v22-path> \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency> \
  --template-sha256 <approved-template-sha256> \
  --source-revision <approved-full-source-revision>
```

Expected: this initial creation reaches `CREATE_COMPLETE`; final verification
still accepts only safe complete states. An existing stable same-name stack is
not an update target for this gate. `environment-stack.json` states
`applicationDeployed=false`, `migrationRun=false`, `seedRun=false`, and
`dnsModified=false`.

- [ ] **Step 5: Initialize the host through SSM, then prove idempotency**

```bash
needo_aws_staging bootstrap-host \
  <approved-full-source-revision> \
  <approved-absolute-node-v22-path> \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency> \
  --source-revision <approved-full-source-revision>

needo_aws_staging bootstrap-host \
  <approved-full-source-revision> \
  <approved-absolute-node-v22-path> \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency> \
  --source-revision <approved-full-source-revision>
```

Expected: both commands finish `Success`; the second does not format the volume again, duplicate `/etc/fstab`, or change resource identity.

- [ ] **Step 6: Defer interactive Session Manager shell proof**

No raw interactive command is authorized in this stage. The environment-only
acceptance relies on the hardened wrapper's bounded SSM document/Run Command
evidence and the absence of SSH ingress. A future company/application stage
must first implement and review a dedicated hardened Session Manager microstep;
until then, interactive shell proof remains explicitly deferred.

- [ ] **Step 7: Confirm the SNS subscription**

Ask the alert-email owner to confirm the AWS SNS email subscription. This is a user email action, not a credential. Do not claim CloudWatch notification readiness until confirmed.

- [ ] **Step 8: Run the live acceptance gate**

```bash
needo_aws_staging verify \
  <approved-full-source-revision> \
  <approved-absolute-node-v22-path> \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --region <ap-southeast-2-or-ap-northeast-1> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency> \
  --source-revision <approved-full-source-revision>
```

Expected: every Task 7 invariant passes and the redacted acceptance evidence is written.

- [ ] **Step 9: Manually cross-check high-risk boundaries read-only**

Confirm from the evidence and AWS descriptions:

- EC2 is `t4g.large` ARM64, with no key name and IMDSv2 required;
- ingress is only 80/443 and SSM is online;
- EBS is 30+70 GiB encrypted gp3 and `/srv/needo` is the exact XFS data mount;
- no container/application/release symlink exists;
- buckets are private/encrypted/versioned with the approved lifecycle;
- the secret has zero versions and no value was read;
- budget thresholds are 75/90/100% against the explicitly approved account-currency amount;
- `staging.needo.life`, apex `needo.life`, and `www.needo.life` were not modified;
- no migration, seed, administrator bootstrap, or business-data write occurred.

- [ ] **Step 10: Stop at the environment-only approval boundary**

Report separately:

1. repository implementation commit(s);
2. AWS stack status and resource evidence;
3. SSM/data-volume/monitoring acceptance;
4. budget/SNS subscription state;
5. DNS state;
6. application deployment state (`not started`);
7. database migration/seed/bootstrap state (`not started`);
8. waived baseline test failures.

Do not begin the formal Staging administrator bootstrap patch or application release until the user approves the next microstep.

## Final Self-Review Checklist

- [ ] Every requirement in the approved design's environment-only gate maps to a task and live assertion above.
- [ ] No task deploys application code, database/Redis containers, migration, seed, TLS, or DNS.
- [ ] The plan uses exact paths, function boundaries, commands, outputs, and stop conditions; no `TODO`, `TBD`, placeholder implementation, or invented passing evidence exists.
- [ ] The empty secret design omits both `SecretString` and `GenerateSecretString`.
- [ ] ARM64 AMI lookup uses the official public SSM parameter and is verified live.
- [ ] Data volume is independently snapshot-protected and the host bootstrap fails closed before child directories exist.
- [ ] AWS CLI execution never uses a shell and rejects secret-value surfaces.
- [ ] Wrong account, wrong region, root/IAM-user caller, long-lived credentials, any preflight stack state other than `ABSENT`, changed DNS baseline, and missing output all stop before or immediately after their safe boundary. Stable existing stacks are diagnostic-only and require a separate exact-identity update review/microstep.
- [ ] Budget thresholds preserve the approved 15k/18k/20k intent as 75%/90%/100%, while amount/unit remain explicit and account-currency correct.
- [ ] Evidence is ignored, atomic, mode-restricted, redacted, and never contains secret values or credentials.
- [ ] Known baseline failures are reported as waived, not fixed and not misrepresented as passing.
- [ ] Destructive rollback actions require a separate explicit approval.
