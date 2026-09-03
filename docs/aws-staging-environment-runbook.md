# AWS Staging Environment-Only Runbook

This runbook is the operator procedure for the approved Tokyo (`ap-northeast-1`)
single-EC2 **environment-only** gate. It creates and verifies infrastructure;
it does not deploy the NeeDo application, run Docker Compose, run Prisma
migrations, seed data, create business data, or change DNS.

The application deployment instructions in [deployment.md](./deployment.md)
are deliberately deferred until their separate microstep is approved.

## Current facts and stop gates

- The current machine's approved current-user AWS CLI installation is verified
  as AWS CLI v2 `aws-cli/2.36.38` on `arm64`. Earlier notes that said the CLI
  was absent describe the initial state and are superseded by this fact.
- The AWS Session Manager plugin is verified as version `1.2.835.0` on
  `arm64`, installed from the AWS signed and Apple-notarized macOS package.
  Its executable resolves through `/usr/local/bin/session-manager-plugin`.
- Public DNS was rechecked on 2026-09-04: both the `needo.life` NS query and
  the `staging.needo.life` A query returned `NXDOMAIN`. Public delegation and
  the eventual staging record are therefore not ready.
- Onamae remains responsible for the external registration, nameserver, and
  DNS-zone work. This gate must leave `staging`, apex `needo.life`, and
  `www.needo.life` untouched. In particular, do not use this runbook to make
  an Onamae change or an AWS DNS change.
- A named SSO or assumed-role temporary AWS profile, the intended 12-digit
  account ID, alert email, actual AWS billing currency, and an approved monthly
  budget amount are required operator inputs. Stop if any is unknown,
  unapproved, or inconsistent with the target account.
- The SNS subscription email must be confirmed before CloudWatch/SNS alerts are
  fully active. Until then, infrastructure may exist, but this environment gate
  remains incomplete.

## Access and safety prerequisites

Use a least-privilege deploy role for the named temporary profile. It must be
authorized for the scoped CloudFormation stack and change-set operations;
scoped EC2, VPC, EBS, and Elastic IP operations; IAM role, instance-profile,
and policy operations plus `iam:PassRole` for the stack role; S3 bucket
controls; Secrets Manager create, describe, and tag; SSM document, parameter,
and command operations; Logs, CloudWatch, and SNS operations; and Budgets
create, describe, and update operations.

Do not use the root user, long-lived access keys, an SSH key, or secrets pasted
into the CLI. The CLI profile must be a named temporary profile, not `default`.
If the preflight reveals missing authority, an unexpected account, unsupported
AWS configuration, or a hostname/DNS conflict, stop and correct the approved
configuration before retrying.

## Operator command sequence

All four commands use the same six flags. Substitute only the angle-bracketed
operator values. `staging.needo.life` is the approved staging hostname.

```bash
npm run aws:staging:preflight -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>
```

Only after a successful preflight and explicit confirmation that the stop gates
are satisfied, deploy the environment. This is an initial-creation gate: the
fresh in-process preflight must report exactly `ABSENT`. A stable same-name
stack may be reported by preflight for diagnostics, but it stops this deploy
before any mutation. Updating an existing stack requires a separate
exact-identity update review and microstep.

```bash
npm run aws:staging:deploy -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>
```

Bootstrap the host twice. The second invocation is the required idempotency
check; inspect its bounded SSM result rather than substituting SSH access.

```bash
npm run aws:staging:bootstrap-host -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>

npm run aws:staging:bootstrap-host -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>
```

Finally, run environment acceptance with the same values:

```bash
npm run aws:staging:verify -- \
  --profile <named-temporary-profile> \
  --account-id <12-digit-account-id> \
  --hostname staging.needo.life \
  --alert-email <alert-email> \
  --budget-amount <amount-in-account-billing-currency> \
  --budget-unit <three-letter-billing-currency>
```

A successful environment-only acceptance is not permission to deploy the
application or to change DNS. Keep Compose, Prisma migration, seed, release
artifact, TLS, and Onamae work in their separately approved follow-up steps.

## Failure recovery and rollback boundaries

- **Preflight or validation failure:** no AWS mutation has occurred. Correct
  the approved permission, configuration, or template issue and retry.
- **CloudFormation create failure before useful resources exist:** inspect and
  preserve stack-event evidence. Request explicit approval before deleting a
  failed stack; never turn deletion into an automatic cleanup action.
- **Host bootstrap failure:** do not format another device. Inspect the SSM
  invocation and EBS volume attachment, fix the cause forward, then rerun the
  idempotent bootstrap command.
- **Acceptance failure:** do not deploy the application and do not change DNS.
  Preserve the bounded evidence and repair the failed infrastructure condition
  within the approved scope.
- **Stack rollback or removal:** retained buckets and the application secret
  remain. Data-volume deletion creates a snapshot. Any material deletion needs
  separate explicit user approval.
- **Budget or SNS email remains unconfirmed:** infrastructure can exist, but
  the environment gate is incomplete; do not represent alerting as active.

Never use `aws cloudformation delete-stack`, EBS deletion, snapshot deletion,
bucket emptying, or secret force deletion as an automatic recovery command.
