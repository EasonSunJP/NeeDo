# NeeDo AWS Staging Dual-Region Gate Design

**Date:** 2026-09-04  
**Status:** Approved design amendment  
**Scope:** Deployment safety gate only; no AWS resource, application, database, TLS, or DNS mutation

## Context

The approved AWS Staging gate was intentionally locked to Tokyo
(`ap-northeast-1`). Live read-only checks established that the personal AWS
project in account `430611185505` is assigned to Sydney
(`ap-southeast-2`). The AWS-managed service control policy explicitly denies
EC2 regional discovery in Tokyo, while Sydney EC2 discovery and CloudFormation
template validation succeed.

The user approved Sydney for the personal deployment test without activating
advanced AWS account features. A later company deployment must continue to
support Tokyo without copying or replacing the deployment implementation.

## Considered Approaches

1. **One explicit dual-region gate (selected).** Require the operator to name
   either Sydney or Tokyo on every command, then derive all validation and
   evidence from that exact value. This preserves one reviewed implementation
   and makes the later company deployment a configuration change.
2. **Duplicate the scripts and template for Sydney.** This isolates the current
   Tokyo code, but creates two safety implementations that can drift.
3. **Use manual AWS commands for the personal test.** This is faster initially,
   but bypasses the reviewed preflight, evidence, rollback, and secret-access
   boundaries.

Approach 1 is selected because it avoids duplicated infrastructure code while
keeping the target region explicit and fail-closed.

## Command and Configuration Contract

Every preflight, deploy, host-bootstrap, and verify command must require an
explicit `--region` flag. There is no region default. The only accepted values
are:

- `ap-southeast-2` for the approved personal-account test;
- `ap-northeast-1` for a later approved company-account deployment.

Any missing, duplicate, mixed-case, or different region is rejected before an
AWS call. The existing explicit account ID, named profile, hostname, alert
email, billing currency, and budget amount requirements remain unchanged.
There is no automatic fallback from Tokyo to Sydney after an authorization
failure.

The stack name remains `needo-staging-infrastructure`. Reusing that name is
safe because the personal and company deployments use different AWS accounts.
The hostname remains `staging.needo.life`; DNS is unchanged by this design and
can be repointed only in the separately approved application/TLS/DNS step.

## CloudFormation Region Lock

The template becomes region-neutral in its description but not region-open.
It receives an `ExpectedRegion` parameter whose allowed values are exactly
Sydney and Tokyo. A CloudFormation rule requires `AWS::Region` to equal
`ExpectedRegion`. The deployment wrapper always passes the resolved explicit
region as that parameter.

This retains a server-side region assertion even if a command wrapper is
bypassed. It does not add regions, accounts, services, ports, credentials, or
application behavior to the existing environment-only stack.

## Temporary Credential Contract

AWS CLI v2 `aws login` reports both the access-key and secret-key provider type
as `login`. Under the final security amendment, the current personal-stage
preflight accepts only `login`, and only when both credential rows report that
exact provider. `sso`, `assume-role`, and `custom-process` are rejected before
identity or mutation because securely closing their recursive config,
credential-process, and refresh-cache dependencies requires the real later
company profile. That support is a separate blocked-until-profile security
microstep; dual-region infrastructure support remains unchanged.

Provider type alone never grants approval. STS must still return:

- the exact operator-supplied 12-digit account ID;
- an `assumed-role` ARN for that account.

Root callers, IAM users, federated-user ARNs, mismatched accounts, mixed
credential providers, shared credential files, and environment credentials
remain rejected. Personal evidence cannot be reused for a later company
profile. Credentials and complete caller ARNs remain absent from evidence
files.

## Dynamic Evidence and Validation

All previously Tokyo-specific ARN and evidence checks must derive the region
from the frozen configuration. This includes CloudFormation stack ARNs,
CloudWatch Logs ARNs, Secrets Manager ARNs, Resource Groups mappings, and final
acceptance evidence. A resource ARN from the other approved region is still a
mismatch for the current run.

Both retained S3 bucket-policy physical IDs must equal their same-run bucket
outputs. Acceptance reads each live policy with the explicit expected bucket
owner and requires the one exact deny-only `s3:*` statement whose
`aws:SecureTransport` string value is `"false"` and whose resources are that
bucket ARN and object ARN. Evidence persists only `tlsOnly: true` and a
canonical expected-policy SHA-256, which reconstruction binds back to the
captured bucket name.

The same-process invariants remain unchanged:

1. preflight verifies identity, explicit region, ARM64 AMI, one clean tracked
   immutable template snapshot, absent stack, and DNS baseline, and reports the
   snapshot SHA-256/full source revision for action-time approval;
2. deploy requires that exact fresh preflight result, both explicit approved
   template values, and an unchanged DNS baseline, then re-attests the source
   and supplies the same immutable bytes to `validate-template` and
   `create-stack`;
3. host bootstrap operates only on the exact stack outputs;
4. verify requires the same account, region, hostname, and resource identity;
5. an existing stack, SCP denial, output mismatch, or changed DNS baseline
   stops without switching targets.

Raw AWS CLI/plugin version probes and interactive Session Manager commands are
outside this reviewed path. Interactive access requires a future dedicated
hardened Session Manager microstep for the company/application stage.

The personal login resolver must validate the canonical source HOME-to-root
ancestor chain and the exact config/login/cache source tree, bind owner, mode,
real path, device, and inode, and re-attest that identity immediately before
each resolver spawn. Group/world-writable ancestors and post-attestation
replacement fail closed without credential persistence.

## Testing and Acceptance

Implementation follows test-driven development:

1. Add failing configuration tests for mandatory `--region`, both allowed
   values, and rejection of every other value.
2. Add a failing preflight test for the official `login` provider while
   preserving all unsafe-provider and caller rejection tests.
3. Add failing CloudFormation contract tests for `ExpectedRegion`, its exact
   allowed values, and equality to `AWS::Region`.
4. Replace fixed Tokyo assertions in deploy and verify tests with cases proving
   that the current configured region is required throughout every ARN and
   evidence surface.
5. Implement the minimum changes needed to pass those tests, then run the full
   AWS-focused gate and syntax/whitespace checks.
6. Run the live read-only preflight in Sydney only after the user supplies the
   alert email and explicitly approves the USD monthly budget amount.

Existing Tokyo behavior remains covered. The already waived unrelated
application test failures remain outside this amendment and are not repaired or
reported as passing.

## Deployment Boundary

This amendment does not itself create or modify AWS resources. After the code
and focused tests pass, the live environment-only deployment still requires
the existing Task 10 sequence and explicit budget/email inputs. Application
release, MySQL/Redis startup, migration, administrator bootstrap, TLS, and DNS
remain separate follow-up work.
