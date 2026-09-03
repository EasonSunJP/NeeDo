import { createFrozenAwsCli } from "./aws-staging-cli.mjs";
import {
  parseAwsStagingArgs,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";
import {
  createAwsStagingPreflightSummary,
  runAwsStagingPreflight
} from "./aws-staging-preflight-lib.mjs";

const config = resolveAwsStagingConfig(parseAwsStagingArgs(process.argv.slice(2)));
const aws = await createFrozenAwsCli({ profile: config.profile, region: config.region });
const result = await runAwsStagingPreflight({ aws, config });

console.log(JSON.stringify(createAwsStagingPreflightSummary(result)));
