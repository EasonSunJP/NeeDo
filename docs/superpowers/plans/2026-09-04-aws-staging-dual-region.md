# AWS Staging Dual-Region Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **2026-09-04 final security supersession (`批准最终安全修订`):** The immediate
> personal-account gate is `login`-only. Earlier steps below that accepted
> `sso`, `assume-role`, or `custom-process` are superseded. A later company
> Tokyo profile requires a separate credential-resolver security microstep and
> new evidence; it does not change the dual-region infrastructure contract.

> **2026-09-04 immutable-template supersession (`批准最终安全修订`):** All four
> guarded commands require the eight shared environment/provenance flags,
> including `--source-revision <approved-full-source-revision>`. Deploy alone
> additionally requires `--template-sha256 <approved-template-sha256>` from
> the immediately preceding clean preflight. One immutable byte snapshot is
> used for both `validate-template` and `create-stack`.

> **2026-09-04 interactive-access supersession (`批准最终安全修订`):** No raw AWS
> CLI/plugin version check or interactive Session Manager command is part of
> this gate. Interactive proof is deferred to a dedicated hardened Session
> Manager microstep for the later company/application stage.

> The login-only resolver additionally binds the canonical source HOME ancestor
> chain and config/cache tree by owner, mode, real path, device, and inode, then
> re-attests them immediately before each resolver spawn. This detects source
> replacement but does not claim defense against an already compromised
> same-user host.

> **2026-09-04 runtime-provenance supersession (`批准最终安全修订`):** All four
> guarded commands require the same approved full source revision. Before any
> credential resolution they bind the explicit runtime closure plus
> `package.json` to HEAD/index/worktree bytes, modes, and identities, record
> `runtimeSourceRevision`, `runtimeManifestSha256`, and `runtimeEntrypoint`, and
> re-attest before every AWS CLI process and mutation. The template remains a
> separately bound immutable artifact. This does not claim the entire
> repository or worktree is clean and does not defend an already-compromised
> same-user host.

Bootstrap and verify each capture the tracked template artifact at the approved revision before credential resolution and pass that same object into the real in-process preflight.

Acceptance reconstruction requires documentSha256 and agentParameterSha256 to equal the canonical SHA-256 of the approved repository constants; format-only values are rejected.

**Goal:** Make the reviewed NeeDo environment-only deployment gate support the approved personal Sydney test and a later company Tokyo deployment without weakening account, credential, evidence, or rollback controls.

**Architecture:** The operator must provide one of two exact regions on every command. A shared region validator feeds the frozen configuration, CloudFormation receives the same value as a server-side `ExpectedRegion` lock, and every persisted ARN/evidence check derives from that frozen region. AWS CLI v2 `login` is the only current credential provider; STS must still prove an exact-account assumed-role caller.

**Tech Stack:** Node.js 22 ESM, Vitest, AWS CLI v2, AWS CloudFormation YAML, AWS STS, EC2, SSM, CloudWatch, SNS, Secrets Manager

## Global Constraints

- The only approved regions are `ap-southeast-2` and `ap-northeast-1`.
- Every command must require `--region`; there is no default and no automatic region fallback.
- The personal-account test uses `ap-southeast-2`; the later company-account deployment uses `ap-northeast-1`.
- The caller must use a named temporary profile and an exact-account STS assumed-role session. Root, IAM-user, federated-user, environment, and shared-credential-file callers remain forbidden.
- AWS CLI v2 `login` is accepted only when both credential rows report exactly `login` and the STS caller passes the existing assumed-role checks. `sso`, `assume-role`, and `custom-process` remain deferred to a later company-profile security microstep and are rejected by this gate.
- CloudFormation must receive `ExpectedRegion` and require it to equal `AWS::Region`.
- CloudFormation must receive `ExpectedAccountId` and require it to equal `AWS::AccountId`.
- Every ARN and evidence region must match the frozen current-run configuration; the other approved region remains a mismatch.
- Keep the stack name `needo-staging-infrastructure` and hostname `staging.needo.life`.
- Treat `staging.needo.life` as the only accepted hostname, not merely an example matching a structural pattern.
- Resolve one temporary credential tuple in memory per command, neutralize inherited/configured AWS endpoints and credential sources, and never mix sessions after preflight.
- Initial deployment is atomic `create-stack`; `AlreadyExists` is a hard stop and all later reads use the returned full StackId.
- Before SSM execution, attest exact document and CloudWatch Agent parameter content and pin both returned versions.
- Before SSM execution, bind both retained bucket-policy resource IDs to their
  bucket outputs and verify the exact deny-only TLS policy using
  `get-bucket-policy --expected-bucket-owner <approved-account-id>`; evidence
  stores only the true attestation and canonical expected-policy SHA-256.
- Declare and verify exact boolean `ActionsEnabled: true` on all four
  CloudWatch alarms, and preserve that value in reconstructed acceptance
  evidence.
- Do not create or modify AWS resources while implementing this plan.
- Do not deploy the application, run containers, run Prisma, seed/bootstrap data, issue TLS certificates, or modify DNS.
- Preserve the approved three unrelated baseline-test waivers without fixing or representing them as passing.

---

### Task 1: Require an explicit approved region and a login-only personal gate

**Files:**
- Modify: `scripts/aws-staging-config.test.mjs`
- Modify: `scripts/aws-staging-config.mjs`
- Modify: `scripts/aws-staging-preflight-lib.test.mjs`
- Modify: `scripts/aws-staging-preflight-lib.mjs`

**Interfaces:**
- Consumes: CLI flag pairs and the text output of `aws configure list`.
- Produces: `AWS_STAGING_REGIONS`, `requireAwsStagingRegion(value)`, a frozen config containing the explicit region, and a preflight that accepts only provider type `login` without weakening STS identity checks.

- [ ] **Step 1: Add failing configuration tests for the explicit dual-region contract**

In `scripts/aws-staging-config.test.mjs`, keep the Tokyo fixture and add `--region` to the successful parser example:

```js
parseAwsStagingArgs([
  "--profile", "needo-staging-deployer",
  "--account-id", "123456789012",
  "--region", "ap-northeast-1",
  "--hostname", "staging.needo.life",
  "--alert-email", "ops@example.com",
  "--budget-amount", "20000",
  "--budget-unit", "JPY"
]);
```

Add these focused cases:

```js
it("accepts the approved Sydney personal-test region", () => {
  expect(resolveAwsStagingConfig({
    ...validInput,
    region: "ap-southeast-2"
  }).region).toBe("ap-southeast-2");
});

it("requires the deployment region explicitly", () => {
  expect(() => parseAwsStagingArgs([
    "--profile", "needo-staging-deployer",
    "--account-id", "123456789012",
    "--hostname", "staging.needo.life",
    "--alert-email", "ops@example.com",
    "--budget-amount", "20000",
    "--budget-unit", "JPY"
  ])).toThrow("--region");
});

it.each(["us-east-1", "AP-SOUTHEAST-2", " ap-southeast-2", "ap-southeast-2 "])(
  "rejects an unapproved or non-canonical region %s",
  (region) => expect(() => resolveAwsStagingConfig({ ...validInput, region }))
    .toThrow("AWS Staging region")
);
```

Change the old `us-east-1` expectation from `"ap-northeast-1"` to `"AWS Staging region"`.

- [ ] **Step 2: Run the configuration test and verify RED**

Run:

```bash
npm test -- --run scripts/aws-staging-config.test.mjs
```

Expected: FAIL because Sydney is rejected and `--region` is unknown.

- [ ] **Step 3: Implement the strict shared region validator**

In `scripts/aws-staging-config.mjs`, export the exact list and validator:

```js
export const AWS_STAGING_REGIONS = Object.freeze([
  "ap-northeast-1",
  "ap-southeast-2"
]);

const awsStagingRegionSet = new Set(AWS_STAGING_REGIONS);

export function requireAwsStagingRegion(value) {
  if (typeof value !== "string" || !awsStagingRegionSet.has(value)) {
    throw new Error(
      `AWS Staging region must be one of: ${AWS_STAGING_REGIONS.join(", ")}`
    );
  }
  return value;
}
```

Add `['--region', 'region']` to `requiredFlags`, remove the parser's Tokyo default, and retain only the owner default:

```js
return { ...parsed, owner: "needo" };
```

Resolve the region through the shared validator:

```js
const region = requireAwsStagingRegion(input.region);
```

Delete the old `region !== "ap-northeast-1"` check.

- [ ] **Step 4: Run the configuration test and verify GREEN**

Run:

```bash
npm test -- --run scripts/aws-staging-config.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Add failing preflight tests for the official login-only provider boundary**

In `scripts/aws-staging-preflight-lib.test.mjs`, make the accepted-provider table exact and add zero-AWS rejection cases for deferred providers:

```js
it.each(["login"])(
  "accepts real configure-list credential rows with TYPE %s",
  async (credentialType) => {
    const aws = successfulAws({
      configureOutput: configureList({ accessType: credentialType })
    });

    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: async () => []
    })).resolves.toMatchObject({ callerKind: "assumed-role" });
  }
);

it.each(["sso", "assume-role", "custom-process"])(
  "rejects deferred company-profile provider TYPE %s before identity or mutation",
  async (credentialType) => {
    const aws = successfulAws({
      configureOutput: configureList({ accessType: credentialType })
    });
    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: async () => []
    })).rejects.toThrow(/login/i);
    expect(aws.json).not.toHaveBeenCalled();
  }
);
```

Keep the unsafe-provider table unchanged so `shared-credentials-file`, `env`, mixed types, and misleading profile names remain rejected.

- [ ] **Step 6: Run the preflight test and verify RED**

Run:

```bash
npm test -- --run scripts/aws-staging-preflight-lib.test.mjs
```

Expected: FAIL for the deferred provider types because the old allowlist still accepts them.

- [ ] **Step 7: Implement the login-only provider boundary**

In `scripts/aws-staging-preflight-lib.mjs`, make the provider allowlist exact:

```js
const TEMPORARY_CREDENTIAL_TYPES = new Set(["login"]);
```

Do not change `requireAssumedRole` or its account/root/IAM-user checks.

- [ ] **Step 8: Run both focused suites and commit**

Run:

```bash
npm test -- --run \
  scripts/aws-staging-config.test.mjs \
  scripts/aws-staging-preflight-lib.test.mjs
```

Expected: PASS.

Commit:

```bash
git add scripts/aws-staging-config.mjs scripts/aws-staging-config.test.mjs \
  scripts/aws-staging-preflight-lib.mjs scripts/aws-staging-preflight-lib.test.mjs
git commit -m "feat: support explicit AWS staging regions"
```

### Task 2: Bind CloudFormation to the explicit current-run region

**Files:**
- Modify: `deploy/aws-staging/cloudformation.contract.test.mjs`
- Modify: `deploy/aws-staging/cloudformation.yml`
- Modify: `scripts/aws-staging-deploy-lib.test.mjs`
- Modify: `scripts/aws-staging-deploy-lib.mjs`

**Interfaces:**
- Consumes: `config.region` from Task 1.
- Produces: CloudFormation `ExpectedRegion` and `ExpectedAccountId` parameters
  and rules, plus their `ParameterKey=...,ParameterValue=...` entries in the
  atomic `create-stack` argument array.

- [ ] **Step 1: Replace the Tokyo-only contract test with a failing exact dual-region rule test**

In `deploy/aws-staging/cloudformation.contract.test.mjs`, replace the Tokyo rule case with:

```js
it("locks stack creation to the explicit approved region", () => {
  const parameters = topLevelSection("Parameters");
  const expectedRegion = mappingEntry(parameters, "ExpectedRegion");
  expect(compactLines(expectedRegion)).toEqual([
    "Type: String",
    "AllowedValues:",
    "- ap-northeast-1",
    "- ap-southeast-2"
  ]);

  const rule = mappingEntry(topLevelSection("Rules"), "RequireExpectedRegion");
  expect(compactLines(rule)).toEqual([
    "Assertions:",
    "- Assert:",
    "Fn::Equals:",
    "- !Ref AWS::Region",
    "- !Ref ExpectedRegion",
    "AssertDescription: NeeDo Staging region must match ExpectedRegion"
  ]);
});

it("locks stack creation to the explicit expected account", () => {
  const parameters = topLevelSection("Parameters");
  const expectedAccountId = mappingEntry(parameters, "ExpectedAccountId");
  expect(compactLines(expectedAccountId)).toEqual([
    "Type: String",
    "AllowedPattern: \"^[0-9]{12}$\""
  ]);

  const rule = mappingEntry(topLevelSection("Rules"), "RequireExpectedAccountId");
  expect(compactLines(rule)).toEqual([
    "Assertions:",
    "- Assert:",
    "Fn::Equals:",
    "- !Ref AWS::AccountId",
    "- !Ref ExpectedAccountId",
    "AssertDescription: NeeDo Staging account must match ExpectedAccountId"
  ]);
});
```

In `scripts/aws-staging-deploy-lib.test.mjs`, require the atomic `create-stack`
arguments to contain these entries immediately after `--parameters`:

```js
"ParameterKey=ExpectedRegion,ParameterValue=ap-northeast-1",
"ParameterKey=ExpectedAccountId,ParameterValue=123456789012",
```

- [ ] **Step 2: Run the two tests and verify RED**

Run:

```bash
npm test -- --run \
  deploy/aws-staging/cloudformation.contract.test.mjs \
  scripts/aws-staging-deploy-lib.test.mjs
```

Expected: FAIL because the exact region/account parameters and server-side
locks do not yet exist in the template and `create-stack` arguments.

- [ ] **Step 3: Implement the CloudFormation parameter and server-side equality rule**

Change the template description to:

```yaml
Description: NeeDo Staging dual-region environment-only infrastructure
```

Add this parameter before `LatestAmiId`:

```yaml
  ExpectedRegion:
    Type: String
    AllowedValues:
      - ap-northeast-1
      - ap-southeast-2
```

Replace `RequireTokyoRegion` with:

```yaml
  RequireExpectedRegion:
    Assertions:
      - Assert:
          Fn::Equals:
            - !Ref AWS::Region
            - !Ref ExpectedRegion
        AssertDescription: NeeDo Staging region must match ExpectedRegion
```

In `scripts/aws-staging-deploy-lib.mjs`, pass the region and account lock first
in the `create-stack` parameter list:

```js
"--parameters",
`ParameterKey=ExpectedRegion,ParameterValue=${config.region}`,
`ParameterKey=ExpectedAccountId,ParameterValue=${config.accountId}`,
`ParameterKey=AlertEmail,ParameterValue=${config.alertEmail}`,
```

- [ ] **Step 4: Run the two tests and verify GREEN**

Run the Step 2 command again.

Expected: PASS.

- [ ] **Step 5: Preserve the no-shell/no-secret deployment argument gate**

Run:

```bash
npm test -- --run scripts/aws-staging-cli.test.mjs scripts/aws-staging-deploy-lib.test.mjs
```

Expected: PASS with `ExpectedRegion` present only as a non-secret CloudFormation parameter.

- [ ] **Step 6: Commit the region-locked template**

```bash
git add deploy/aws-staging/cloudformation.yml \
  deploy/aws-staging/cloudformation.contract.test.mjs \
  scripts/aws-staging-deploy-lib.mjs scripts/aws-staging-deploy-lib.test.mjs
git commit -m "feat: lock AWS stack to selected region"
```

### Task 3: Preserve the exact approved region in deployment evidence

**Files:**
- Modify: `scripts/aws-staging-deploy-lib.test.mjs`
- Modify: `scripts/aws-staging-deploy.mjs`

**Interfaces:**
- Consumes: deployment evidence whose `region` was produced from frozen config.
- Produces: private reconstructed evidence that accepts either approved region and preserves the exact input value.

- [ ] **Step 1: Add a failing Sydney evidence reconstruction test**

In the `AWS Staging evidence writer` describe block, add:

```js
it("preserves the approved Sydney region in reconstructed evidence", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-sydney-"));
  const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
  try {
    const evidence = evidenceFixture({ region: "ap-southeast-2" });
    const resultPath = await writeAwsStagingEnvironmentEvidence({
      evidence,
      trustedRoot: temporaryRoot,
      outputDirectory
    });
    const persisted = JSON.parse(await fs.readFile(resultPath, "utf8"));
    expect(persisted.region).toBe("ap-southeast-2");
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
```

Keep the existing `us-east-1` invalid-region case.

- [ ] **Step 2: Run the deployment test and verify RED**

Run:

```bash
npm test -- --run scripts/aws-staging-deploy-lib.test.mjs
```

Expected: FAIL because the evidence writer still requires Tokyo.

- [ ] **Step 3: Use the shared region validator in the evidence writer**

Extend the existing import in `scripts/aws-staging-deploy.mjs`:

```js
import {
  parseAwsStagingArgs,
  requireAwsStagingRegion,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";
```

At the start of `reconstructRedactedEvidence`, replace the Tokyo comparison with:

```js
const region = requireAwsStagingRegion(evidence.region);
```

Use that exact local in the reconstructed value:

```js
region,
```

- [ ] **Step 4: Run the deployment test and verify GREEN**

Run the Step 2 command again.

Expected: PASS for Tokyo and Sydney while `us-east-1` remains rejected.

- [ ] **Step 5: Commit deployment evidence support**

```bash
git add scripts/aws-staging-deploy.mjs scripts/aws-staging-deploy-lib.test.mjs
git commit -m "fix: bind AWS deployment evidence to region"
```

### Task 4: Make live acceptance ARN and evidence checks region-aware

**Files:**
- Modify: `scripts/aws-staging-verify-lib.test.mjs`
- Modify: `scripts/aws-staging-verify-lib.mjs`

**Interfaces:**
- Consumes: a frozen config and AWS descriptions whose ARNs must contain `config.region` and `config.accountId`.
- Produces: live acceptance and persisted evidence that preserve either approved region and reject cross-region resources.

- [ ] **Step 1: Add a failing Sydney live-verification case**

In `scripts/aws-staging-verify-lib.test.mjs`, add a test helper near `passingFixture`:

```js
function fixtureForRegion(region) {
  return JSON.parse(
    JSON.stringify(passingFixture()).replaceAll(config.region, region)
  );
}
```

Add this case to the live acceptance describe block:

```js
it("accepts Sydney only when every regional ARN matches Sydney", async () => {
  const sydneyConfig = Object.freeze({ ...config, region: "ap-southeast-2" });
  const fixture = fixtureForRegion(sydneyConfig.region);
  const trace = [];
  const aws = createAws(fixture, trace);
  const resolveDns = vi.fn(async () => ["203.0.113.2"]);

  const evidence = await verifyAwsStagingEnvironment({
    aws,
    config: sydneyConfig,
    resolveDns,
    runPreflight: createPreflight(resolveDns, trace, {
      region: sydneyConfig.region
    }),
    now: () => 0
  });

  expect(evidence.region).toBe("ap-southeast-2");
  expect(evidence.stack.id).toContain(":ap-southeast-2:");
  expect(evidence.monitoring.logGroups.every(
    ({ arn }) => arn.includes(":ap-southeast-2:")
  )).toBe(true);
});
```

Add a persisted-evidence case in the evidence-writer describe block:

```js
it("preserves Sydney in reconstructed acceptance evidence", async () => {
  const sydneyConfig = Object.freeze({ ...config, region: "ap-southeast-2" });
  const fixture = fixtureForRegion(sydneyConfig.region);
  const trace = [];
  const resolveDns = vi.fn(async () => ["203.0.113.2"]);
  const evidence = await verifyAwsStagingEnvironment({
    aws: createAws(fixture, trace),
    config: sydneyConfig,
    resolveDns,
    runPreflight: createPreflight(resolveDns, trace, { region: sydneyConfig.region }),
    now: () => 0
  });
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-sydney-"));
  try {
    const resultPath = await writeAwsStagingAcceptanceEvidence({
      evidence,
      trustedRoot: temporaryRoot,
      outputDirectory: path.join(temporaryRoot, "outputs", "aws-staging")
    });
    expect(JSON.parse(await fs.readFile(resultPath, "utf8")).region)
      .toBe("ap-southeast-2");
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the verify suite and verify RED**

Run:

```bash
npm test -- --run scripts/aws-staging-verify-lib.test.mjs
```

Expected: FAIL on the fixed Tokyo config/log-group/evidence assertions.

- [ ] **Step 3: Implement dynamic current-run checks**

Extend the config import in `scripts/aws-staging-verify-lib.mjs`:

```js
import {
  maskEmail,
  requireAwsStagingHostname,
  requireAwsStagingRegion
} from "./aws-staging-config.mjs";
```

In `requireResolvedConfig`, validate separately:

```js
requireAwsStagingRegion(config.region);
if (config.environment !== "staging") {
  throw new Error("AWS Staging config environment is invalid");
}
```

Change the log-group validator signature and exact ARN expression:

```js
function requireLogGroups(response, resources, config) {
  noPagination(response, "CloudWatch Logs describe-log-groups");
  if (!Array.isArray(response.logGroups) || response.logGroups.length !== 2) {
    throw new Error("CloudWatch log group cardinality must be exactly two");
  }
  const expected = [
    ["SystemLogGroup", "/needo/staging/system"],
    ["DockerLogGroup", "/needo/staging/docker"]
  ];
  const logArnPattern = new RegExp(
    `^arn:aws:logs:${escapeRegExp(config.region)}:${config.accountId}:log-group:/needo/staging/(?:system|docker)$`
  );
  return expected.map(([logicalId, name]) => {
    const group = response.logGroups.find((candidate) => candidate?.logGroupName === name);
    if (!group || resources[logicalId].physicalId !== name || group.retentionInDays !== 30) {
      throw new Error(`CloudWatch log group ${name} does not match stack identity or retention`);
    }
    const arn = safeArgument(group.logGroupArn, `CloudWatch log group ${name} ARN`, logArnPattern);
    return { name, arn, retentionDays: 30 };
  });
}
```

Call it with the same frozen config:

```js
const logs = requireLogGroups(describedLogGroups, resources, config);
```

At the start of `reconstructAcceptanceEvidence`, replace the Tokyo comparison with:

```js
const region = requireAwsStagingRegion(evidence.region);
```

Bind the stack ARN to that local:

```js
const stackPattern = new RegExp(
  `^arn:aws:cloudformation:${escapeRegExp(region)}:${accountId}:stack/needo-staging-infrastructure/[0-9a-f-]{36}$`
);
```

Use `region` in the reconstructed evidence instead of a literal.

- [ ] **Step 4: Run the verify suite and verify GREEN**

Run the Step 2 command again.

Expected: PASS for the existing Tokyo fixture and the new full Sydney fixture.

- [ ] **Step 5: Prove cross-region ARNs still fail**

Add this focused negative case:

```js
it("rejects a Tokyo log ARN during a Sydney run", async () => {
  const sydneyConfig = Object.freeze({ ...config, region: "ap-southeast-2" });
  const fixture = fixtureForRegion(sydneyConfig.region);
  fixture.logGroups.logGroups[0].logGroupArn =
    "arn:aws:logs:ap-northeast-1:123456789012:log-group:/needo/staging/system";
  const trace = [];
  const resolveDns = vi.fn(async () => ["203.0.113.2"]);

  await expect(verifyAwsStagingEnvironment({
    aws: createAws(fixture, trace),
    config: sydneyConfig,
    resolveDns,
    runPreflight: createPreflight(resolveDns, trace, { region: sydneyConfig.region }),
    now: () => 0
  })).rejects.toThrow(/log group|ARN/i);
});
```

Run the verify suite again. Expected: PASS.

- [ ] **Step 6: Commit dynamic acceptance**

```bash
git add scripts/aws-staging-verify-lib.mjs scripts/aws-staging-verify-lib.test.mjs
git commit -m "fix: verify AWS resources in selected region"
```

### Task 5: Align the runbook and run the complete environment-only regression gate

**Files:**
- Modify: `docs/aws-staging-environment-runbook.md`
- Modify: `docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md`

**Interfaces:**
- Consumes: the explicit dual-region command contract from Tasks 1–4.
- Produces: operator commands that cannot silently use a default region and a verified, clean dual-region implementation branch.

- [ ] **Step 1: Update the runbook's current facts and boundary**

Replace the opening description with:

```md
This runbook is the operator procedure for the approved single-EC2
**environment-only** gate. The personal deployment test uses Sydney
(`ap-southeast-2`); a later company deployment may use Tokyo
(`ap-northeast-1`). Every command requires the exact approved region and never
falls back automatically.
```

Add the verified personal-account facts:

```md
- AWS CLI v2 `aws login` created the named temporary profile
  `needo-staging-bootstrap`; STS identified account `430611185505` and an
  assumed `AccountFullAccessRole` session.
- The personal project's AWS-managed service control policy denies Tokyo
  regional EC2 discovery. Sydney EC2 discovery and CloudFormation validation
  succeed. Do not retry Tokyo or attempt to bypass that policy in the personal
  account.
```

State that the later company account needs a new exact account-ID/role
preflight; personal evidence is not transferable proof.

- [ ] **Step 2: Add the explicit region flag to every operator command**

Each of the five preflight/deploy/bootstrap/bootstrap/verify examples must
include this line immediately after the account ID:

```bash
  --region <ap-southeast-2-or-ap-northeast-1> \
```

Keep the eight environment/provenance flags on every operator command. Add the
template-digest approval flag only to deploy. State that the personal live run
uses `--region ap-southeast-2`.

- [ ] **Step 3: Amend the original environment-only plan without rewriting history**

Add a dated amendment near the top of
`docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md`:

```md
> **2026-09-04 region amendment:** The personal-account live gate uses
> `ap-southeast-2` because an AWS-managed SCP explicitly denies Tokyo. The
> implementation now requires an explicit `--region` and accepts only
> `ap-southeast-2` or `ap-northeast-1`; Tokyo remains the later company-account
> target. See the approved dual-region design and implementation plan.
```

Update Task 10's live command examples to include the explicit region flag.
Do not alter the historical Task 1–9 completion evidence.

- [ ] **Step 4: Run the complete AWS-focused gate**

Run:

```bash
npm test -- --run \
  scripts/aws-staging-config.test.mjs \
  scripts/aws-staging-cli.test.mjs \
  scripts/aws-staging-preflight-lib.test.mjs \
  scripts/aws-staging-deploy-lib.test.mjs \
  scripts/aws-staging-bootstrap-host-lib.test.mjs \
  scripts/aws-staging-verify-lib.test.mjs \
  deploy/aws-staging/cloudformation.contract.test.mjs
```

Expected: every AWS-focused test passes. Do not run or repair the three waived
unrelated full-suite failures.

- [ ] **Step 5: Run syntax, forbidden-content, and whitespace gates**

Run:

```bash
node --check scripts/aws-staging-preflight.mjs
node --check scripts/aws-staging-deploy.mjs
node --check scripts/aws-staging-bootstrap-host.mjs
node --check scripts/aws-staging-verify.mjs
rg -n "AKIA|ASIA|aws_secret_access_key|AWS_SESSION_TOKEN|SecretString:|GenerateSecretString:|get-secret-value|docker compose|prisma|seed|Route53|KeyName:" \
  deploy/aws-staging scripts/aws-staging-* docs/aws-staging-environment-runbook.md
git diff --check
```

Expected: syntax and whitespace checks pass. Search hits are only intentional
test assertions or documented prohibitions; no credential, secret value,
application deployment, DNS mutation, SSH key, migration, or seed appears.

- [ ] **Step 6: Confirm branch scope and commit**

Run:

```bash
git status --short
git diff --stat c1a7cb6f..HEAD
git diff --name-only c1a7cb6f..HEAD
```

Expected: only the files named by this plan are changed.

Commit:

```bash
git add docs/aws-staging-environment-runbook.md \
  docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md
git commit -m "docs: describe AWS staging region selection"
```

- [ ] **Step 7: Stop before live AWS mutation**

Report the commits and test results. Obtain the exact alert email and explicit
USD budget amount before running the Sydney preflight. If preflight passes, ask
for action-time confirmation of the reported template SHA-256 and full source
revision immediately before the first CloudFormation deployment command that
creates AWS resources. The deploy command must carry those exact approved
values.
