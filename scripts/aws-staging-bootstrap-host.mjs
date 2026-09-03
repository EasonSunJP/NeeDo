import { pathToFileURL } from "node:url";
import { createAwsCli } from "./aws-staging-cli.mjs";
import {
  parseAwsStagingArgs,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";
import { bootstrapAwsStagingHost } from "./aws-staging-bootstrap-host-lib.mjs";

export async function main(argv = process.argv.slice(2), log = console.log) {
  const config = resolveAwsStagingConfig(parseAwsStagingArgs(argv));
  const aws = createAwsCli({ profile: config.profile, region: config.region });
  const summary = await bootstrapAwsStagingHost({ aws, config });
  log(JSON.stringify(summary));
  return summary;
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  await main();
}
