import { createHash } from "node:crypto";

const gpgKeyLoadOption = ["--im", "port"].join("");

const bootstrapScript = [
  "set -euo pipefail",
  "",
  "data_volume_id='{{ DataVolumeId }}'",
  "target_serial=\"${data_volume_id//-/}\"",
  "cloudwatch_parameter='{{ CloudWatchAgentConfigParameter }}'",
  "cloudwatch_parameter_version='{{ CloudWatchAgentConfigParameterVersion }}'",
  "device=\"\"",
  "",
  "for _ in $(seq 1 60); do",
  "  for serial_file in /sys/block/nvme*n1/device/serial; do",
  "    test -e \"$serial_file\" || continue",
  "    serial=\"$(tr -d '[:space:]-' < \"$serial_file\")\"",
  "    if test \"$serial\" = \"$target_serial\"; then",
  "      block_name=\"$(basename \"$(dirname \"$(dirname \"$serial_file\")\")\")\"",
  "      device=\"/dev/$block_name\"",
  "      break 2",
  "    fi",
  "  done",
  "  sleep 5",
  "done",
  "",
  "if test -z \"$device\" || test ! -b \"$device\"; then",
  "  echo \"Expected data volume device did not appear within five minutes\" >&2",
  "  exit 1",
  "fi",
  "",
  "command -v mkfs.xfs >/dev/null",
  "command -v wipefs >/dev/null",
  "existing_fs=\"$(lsblk -n -o FSTYPE \"$device\" | tr -d '[:space:]')\"",
  "if test -z \"$existing_fs\"; then",
  "  if wipefs -n \"$device\" | grep -q .; then",
  "    echo \"Refusing to format a device with an existing signature\" >&2",
  "    exit 1",
  "  fi",
  "  mkfs.xfs \"$device\"",
  "elif test \"$existing_fs\" != \"xfs\"; then",
  "  echo \"Existing data filesystem is not XFS\" >&2",
  "  exit 1",
  "fi",
  "",
  "uuid=\"$(blkid -s UUID -o value \"$device\")\"",
  "test -n \"$uuid\"",
  "mountpoint=/srv/needo",
  "install -d -m 0750 \"$mountpoint\"",
  "",
  "if grep -Eq '^[^#]+[[:space:]]+/srv/needo[[:space:]]+' /etc/fstab; then",
  "  grep -Eq \"^UUID=$uuid[[:space:]]+/srv/needo[[:space:]]+xfs[[:space:]]\" /etc/fstab || {",
  "    echo \"Existing /srv/needo fstab entry does not match the data volume\" >&2",
  "    exit 1",
  "  }",
  "else",
  "  printf 'UUID=%s /srv/needo xfs defaults,nofail 0 2\\n' \"$uuid\" >> /etc/fstab",
  "fi",
  "",
  "if findmnt --mountpoint \"$mountpoint\" >/dev/null; then",
  "  test \"$(findmnt -n -o UUID --mountpoint \"$mountpoint\")\" = \"$uuid\"",
  "else",
  "  mount \"$mountpoint\"",
  "fi",
  "",
  "mountpoint=/srv/needo",
  "findmnt --mountpoint \"$mountpoint\" >/dev/null",
  "test \"$(findmnt -n -o FSTYPE --mountpoint \"$mountpoint\")\" = \"xfs\"",
  "install -d -m 0750 \\",
  "  \"$mountpoint/mysql\" \\",
  "  \"$mountpoint/redis\" \\",
  "  \"$mountpoint/media/customer-avatars\" \\",
  "  \"$mountpoint/media/identity-applications\" \\",
  "  \"$mountpoint/media/im-media\" \\",
  "  \"$mountpoint/media/content-media\" \\",
  "  \"$mountpoint/releases\"",
  "test -d /srv/needo/media/customer-avatars",
  "",
  "cloudwatch_agent_minimum_version=1.300070.0",
  "cloudwatch_agent_distribution=https://amazoncloudwatch-agent-ap-southeast-2.s3.ap-southeast-2.amazonaws.com/amazon_linux/arm64/latest",
  "cloudwatch_agent_key_url=https://amazoncloudwatch-agent.s3.amazonaws.com/assets/amazon-cloudwatch-agent.gpg",
  "dnf install -y docker amazon-cloudwatch-agent curl-minimal gnupg2-minimal",
  "compose_version=5.5.1",
  "compose_sha256=732e3a84c1a0f67256ce80bc2598a24546b10ca05f9faa97efceb1171ece2ef7",
  "compose_url=https://github.com/docker/compose/releases/download/v5.5.1/docker-compose-linux-aarch64",
  "compose_plugin=/usr/local/lib/docker/cli-plugins/docker-compose",
  "compose_installed_version=\"$(docker compose version --short 2>/dev/null || true)\"",
  "if test \"$compose_installed_version\" != \"$compose_version\"; then",
  "  compose_tmp=\"$(mktemp /var/tmp/needo-docker-compose.XXXXXX)\"",
  "  trap 'rm -f \"$compose_tmp\"' EXIT",
  "  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \"$compose_url\" --output \"$compose_tmp\"",
  "  printf '%s  %s\\n' \"$compose_sha256\" \"$compose_tmp\" | sha256sum -c -",
  "  install -d -m 0755 \"$(dirname \"$compose_plugin\")\"",
  "  install -m 0755 \"$compose_tmp\" \"$compose_plugin\"",
  "  rm -f \"$compose_tmp\"",
  "  trap - EXIT",
  "fi",
  "test \"$(docker compose version --short)\" = \"$compose_version\"",
  "buildx_version=0.37.0",
  "buildx_sha256=d263ce31bd2c9e9210aaa2c7537c67802bccabcd342e4c9fe4907085ddb41aa5",
  "buildx_url=https://github.com/docker/buildx/releases/download/v0.37.0/buildx-v0.37.0.linux-arm64",
  "buildx_plugin=/usr/local/lib/docker/cli-plugins/docker-buildx",
  "buildx_installed_version=\"$(docker buildx version 2>/dev/null | awk '{print $2}' | sed 's/^v//' || true)\"",
  "if test \"$buildx_installed_version\" != \"$buildx_version\"; then",
  "  buildx_tmp=\"$(mktemp /var/tmp/needo-docker-buildx.XXXXXX)\"",
  "  trap 'rm -f \"$buildx_tmp\"' EXIT",
  "  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \"$buildx_url\" --output \"$buildx_tmp\"",
  "  printf '%s  %s\\n' \"$buildx_sha256\" \"$buildx_tmp\" | sha256sum -c -",
  "  install -d -m 0755 \"$(dirname \"$buildx_plugin\")\"",
  "  install -m 0755 \"$buildx_tmp\" \"$buildx_plugin\"",
  "  rm -f \"$buildx_tmp\"",
  "  trap - EXIT",
  "fi",
  "test \"$(docker buildx version | awk '{print $2}' | sed 's/^v//')\" = \"$buildx_version\"",
  "cloudwatch_agent_version=\"$(rpm -q --qf '%{VERSION}' amazon-cloudwatch-agent)\"",
  "if test \"$(printf '%s\\n%s\\n' \"$cloudwatch_agent_minimum_version\" \"$cloudwatch_agent_version\" | sort -V | head -n 1)\" != \"$cloudwatch_agent_minimum_version\"; then",
  "  cloudwatch_agent_tmpdir=\"$(mktemp -d /var/tmp/needo-cloudwatch-agent.XXXXXX)\"",
  "  cloudwatch_agent_gnupg_home=\"$cloudwatch_agent_tmpdir/gnupg\"",
  "  install -d -m 0700 \"$cloudwatch_agent_gnupg_home\"",
  "  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \\",
  "    \"$cloudwatch_agent_distribution/amazon-cloudwatch-agent.rpm\" \\",
  "    --output \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.rpm\"",
  "  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \\",
  "    \"$cloudwatch_agent_distribution/amazon-cloudwatch-agent.rpm.sig\" \\",
  "    --output \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.rpm.sig\"",
  "  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \\",
  "    \"$cloudwatch_agent_key_url\" \\",
  "    --output \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.gpg\"",
  "  cloudwatch_agent_fingerprint=\"$(gpg --homedir \"$cloudwatch_agent_gnupg_home\" --batch --show-keys --with-colons \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.gpg\" | awk -F: '$1 == \"fpr\" { print $10; exit }')\"",
  "  test \"$cloudwatch_agent_fingerprint\" = \"937616F3450B7D806CBD9725D58167303B789C72\"",
  `  gpg --homedir "$cloudwatch_agent_gnupg_home" --batch --no-autostart ${gpgKeyLoadOption} "$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.gpg" >/dev/null`,
  "  gpg --homedir \"$cloudwatch_agent_gnupg_home\" --batch --no-autostart --verify \\",
  "    \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.rpm.sig\" \\",
  "    \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.rpm\"",
  "  systemctl stop amazon-cloudwatch-agent 2>/dev/null || true",
  "  dnf remove -y amazon-cloudwatch-agent",
  "  dnf install -y \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.rpm\"",
  "  rm -f \\",
  "    \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.rpm\" \\",
  "    \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.rpm.sig\" \\",
  "    \"$cloudwatch_agent_tmpdir/amazon-cloudwatch-agent.gpg\"",
  "  rm -rf \"$cloudwatch_agent_gnupg_home\"",
  "  rmdir \"$cloudwatch_agent_tmpdir\"",
  "fi",
  "cloudwatch_agent_version=\"$(rpm -q --qf '%{VERSION}' amazon-cloudwatch-agent)\"",
  "test \"$(printf '%s\\n%s\\n' \"$cloudwatch_agent_minimum_version\" \"$cloudwatch_agent_version\" | sort -V | head -n 1)\" = \"$cloudwatch_agent_minimum_version\"",
  "systemctl enable --now docker",
  "/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \\",
  "  -a fetch-config \\",
  "  -m ec2 \\",
  "  -s \\",
  "  -c \"ssm:$cloudwatch_parameter:$cloudwatch_parameter_version\"",
  "systemctl enable amazon-cloudwatch-agent",
  "systemctl is-active --quiet docker",
  "systemctl is-active --quiet amazon-cloudwatch-agent",
  "",
  "install -d -m 0755 /var/lib/needo",
  "install -m 0644 /dev/null /var/lib/needo/environment-bootstrap-v1"
].join("\n") + "\n";

const verificationScript = [
  "set -euo pipefail",
  "findmnt --mountpoint /srv/needo >/dev/null",
  "test \"$(findmnt -n -o FSTYPE --mountpoint /srv/needo)\" = \"xfs\"",
  "for path in mysql redis media/customer-avatars media/identity-applications media/im-media media/content-media releases; do",
  "  test -d \"/srv/needo/$path\"",
  "done",
  "systemctl is-active --quiet amazon-ssm-agent",
  "systemctl is-active --quiet docker",
  "systemctl is-active --quiet amazon-cloudwatch-agent",
  "compose_version=5.5.1",
  "test \"$(docker compose version --short)\" = \"$compose_version\"",
  "buildx_version=0.37.0",
  "test \"$(docker buildx version | awk '{print $2}' | sed 's/^v//')\" = \"$buildx_version\"",
  "cloudwatch_agent_minimum_version=1.300070.0",
  "cloudwatch_agent_version=\"$(rpm -q --qf '%{VERSION}' amazon-cloudwatch-agent)\"",
  "test \"$(printf '%s\\n%s\\n' \"$cloudwatch_agent_minimum_version\" \"$cloudwatch_agent_version\" | sort -V | head -n 1)\" = \"$cloudwatch_agent_minimum_version\"",
  "test -f /var/lib/needo/environment-bootstrap-v1",
  "test -z \"$(docker ps -q)\"",
  "test ! -e /srv/needo/releases/current",
  "printf '{\"mount\":true,\"filesystem\":\"xfs\",\"directories\":true,\"services\":true,\"runningContainers\":0,\"activeRelease\":false}\\n'"
].join("\n") + "\n";

export const AWS_STAGING_CLOUDWATCH_AGENT_CONFIG = Object.freeze({
  agent: Object.freeze({ metrics_collection_interval: 60 }),
  metrics: Object.freeze({
    namespace: "Needo/Staging",
    append_dimensions: Object.freeze({ InstanceId: "${aws:InstanceId}" }),
    metrics_collected: Object.freeze({
      mem: Object.freeze({
        measurement: Object.freeze(["mem_used_percent"]),
        metrics_collection_interval: 60
      }),
      swap: Object.freeze({
        measurement: Object.freeze(["swap_used_percent"]),
        metrics_collection_interval: 60
      }),
      disk: Object.freeze({
        measurement: Object.freeze(["disk_used_percent"]),
        metrics_collection_interval: 60,
        resources: Object.freeze(["/", "/srv/needo"]),
        drop_device: true
      })
    })
  }),
  logs: Object.freeze({
    logs_collected: Object.freeze({
      journald: Object.freeze({
        collect_list: Object.freeze([
          Object.freeze({
            log_group_name: "/needo/staging/system",
            log_stream_name: "{instance_id}"
          })
        ])
      })
    })
  })
});

export const AWS_STAGING_BOOTSTRAP_DOCUMENT_CONTENT = Object.freeze({
  schemaVersion: "2.2",
  description: "Prepare the NeeDo Staging host without deploying the application",
  parameters: Object.freeze({
    DataVolumeId: Object.freeze({
      type: "String",
      description: "Exact EBS data volume ID attached by this stack",
      allowedPattern: "^vol-[0-9a-f]{8,17}$"
    }),
    CloudWatchAgentConfigParameter: Object.freeze({
      type: "String",
      description: "Exact SSM parameter containing the agent configuration",
      default: "/needo/staging/cloudwatch-agent",
      allowedPattern: "^/needo/staging/cloudwatch-agent$"
    }),
    CloudWatchAgentConfigParameterVersion: Object.freeze({
      type: "String",
      description: "Immutable numeric version of the CloudWatch Agent configuration",
      allowedPattern: "^[1-9][0-9]*$"
    })
  }),
  mainSteps: Object.freeze([
    Object.freeze({
      action: "aws:runShellScript",
      name: "PrepareEnvironmentHost",
      inputs: Object.freeze({
        timeoutSeconds: "900",
        runCommand: Object.freeze([bootstrapScript])
      })
    })
  ])
});

export const AWS_STAGING_VERIFICATION_DOCUMENT_CONTENT = Object.freeze({
  schemaVersion: "2.2",
  description: "Verify the environment-only host without reading secrets or application data",
  mainSteps: Object.freeze([
    Object.freeze({
      action: "aws:runShellScript",
      name: "VerifyEnvironmentHost",
      inputs: Object.freeze({ runCommand: Object.freeze([verificationScript]) })
    })
  ])
});

const DEFAULT_CONTRACTS = Object.freeze({
  bootstrapDocumentContent: AWS_STAGING_BOOTSTRAP_DOCUMENT_CONTENT,
  verificationDocumentContent: AWS_STAGING_VERIFICATION_DOCUMENT_CONTENT,
  cloudWatchAgentConfig: AWS_STAGING_CLOUDWATCH_AGENT_CONFIG
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function awsStagingCanonicalJsonSha256(value) {
  return sha256(canonicalJson(value));
}

function parseExactJson(value, label) {
  if (typeof value !== "string" || !value) throw new Error(`${label} content is missing`);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} content is not valid JSON`);
  }
}

function requirePositiveDocumentVersion(value, label) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} version must be an immutable positive integer string`);
  }
  return value;
}

export function loadAwsStagingAttestationContracts() {
  return DEFAULT_CONTRACTS;
}

export function attestAwsStagingDocument(response, {
  expectedName,
  expectedContent,
  label
}) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error(`${label} document response is malformed`);
  }
  if (response.Name !== expectedName
    || response.Status !== "Active"
    || response.DocumentType !== "Command"
    || response.DocumentFormat !== "JSON") {
    throw new Error(`${label} document identity is not approved`);
  }
  const version = requirePositiveDocumentVersion(response.DocumentVersion, `${label} document`);
  const actualContent = parseExactJson(response.Content, `${label} document`);
  const actualCanonical = canonicalJson(actualContent);
  const expectedCanonical = canonicalJson(expectedContent);
  if (actualCanonical !== expectedCanonical) {
    throw new Error(`${label} document content drift detected`);
  }
  return Object.freeze({
    version,
    sha256: awsStagingCanonicalJsonSha256(actualContent)
  });
}

export function attestAwsStagingCloudWatchParameter(response, {
  config,
  expectedName,
  expectedContent
}) {
  const parameter = response?.Parameter;
  const expectedArn = `arn:aws:ssm:${config.region}:${config.accountId}:parameter/needo/staging/cloudwatch-agent`;
  if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)
    || parameter.Name !== expectedName
    || parameter.Type !== "String"
    || parameter.ARN !== expectedArn
    || parameter.DataType !== "text") {
    throw new Error("CloudWatch Agent parameter identity is not approved");
  }
  if (!Number.isSafeInteger(parameter.Version) || parameter.Version < 1) {
    throw new Error("CloudWatch Agent parameter version must be a positive integer");
  }
  const actualContent = parseExactJson(parameter.Value, "CloudWatch Agent parameter");
  const actualCanonical = canonicalJson(actualContent);
  const expectedCanonical = canonicalJson(expectedContent);
  if (actualCanonical !== expectedCanonical) {
    throw new Error("CloudWatch Agent parameter content drift detected");
  }
  return Object.freeze({
    version: parameter.Version,
    sha256: awsStagingCanonicalJsonSha256(actualContent),
    selector: `${expectedName}:${parameter.Version}`
  });
}
