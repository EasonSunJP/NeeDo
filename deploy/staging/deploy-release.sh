#!/usr/bin/env bash
set -euo pipefail
umask 077

region=""
hostname=""
secret_id=""
backup_bucket=""
revision=""
archive_sha256=""

while (($#)); do
  case "$1" in
    --region) region="${2:-}" ;;
    --hostname) hostname="${2:-}" ;;
    --secret-id) secret_id="${2:-}" ;;
    --backup-bucket) backup_bucket="${2:-}" ;;
    --revision) revision="${2:-}" ;;
    --archive-sha256) archive_sha256="${2:-}" ;;
    *) exit 64 ;;
  esac
  shift 2
done

[[ "$region" == "ap-southeast-2" ]]
[[ "$hostname" == "staging.needo.life" ]]
[[ "$secret_id" =~ ^arn:aws:secretsmanager:ap-southeast-2:430611185505:secret:[A-Za-z0-9/_+=.@-]+$ ]]
[[ "$backup_bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
[[ "$archive_sha256" =~ ^[0-9a-f]{64}$ ]]

release_dir="$(cd "$(dirname "$0")/../.." && pwd -P)"
expected_release_dir="/srv/needo/releases/${revision}-${archive_sha256:0:16}"
[[ "$release_dir" == "$expected_release_dir" ]]

install -d -m 0750 /srv/needo/config /srv/needo/mysql /srv/needo/redis
install -d -m 0750 /srv/needo/certbot/conf
install -d -m 0755 /srv/needo/certbot/www
install -d -o 1000 -g 1000 -m 0750 /srv/needo/media
exec 9>/srv/needo/deploy.lock
flock -n 9

env_file="/srv/needo/config/staging.env"
secret_json="$(mktemp /srv/needo/config/staging-secret.XXXXXX)"
env_candidate="$(mktemp /srv/needo/config/staging-env.XXXXXX)"
previous_release="$(readlink -f /srv/needo/current 2>/dev/null || true)"
deployment_complete=false

cleanup() {
  rm -f "$secret_json" "$env_candidate"
}

compose_for() {
  local target_release="$1"
  shift
  docker compose \
    --env-file "$env_file" \
    --project-name needo-staging \
    --file "$target_release/deploy/staging/docker-compose.yml" \
    "$@"
}

nginx_config_for() {
  local target_release="$1"
  if [[ -f "/srv/needo/certbot/conf/live/${hostname}/fullchain.pem" && -f "/srv/needo/certbot/conf/live/${hostname}/privkey.pem" ]]; then
    printf '%s\n' "$target_release/deploy/staging/nginx-https.conf"
  else
    printf '%s\n' "$target_release/deploy/staging/nginx-http.conf"
  fi
}

rollback_application() {
  local status=$?
  trap - ERR
  if [[ "$deployment_complete" != true && -n "$previous_release" && -d "$previous_release" ]]; then
    install -m 0644 "$(nginx_config_for "$previous_release")" /srv/needo/config/nginx.conf
    compose_for "$previous_release" up -d --build --wait backend ops-api merchant-api web || true
    compose_for "$previous_release" up -d --no-deps --force-recreate --wait web || true
    ln -sfn "$previous_release" /srv/needo/current.rollback
    mv -Tf /srv/needo/current.rollback /srv/needo/current
  fi
  exit "$status"
}

trap cleanup EXIT
trap rollback_application ERR

AWS_PAGER="" aws secretsmanager get-secret-value \
  --secret-id "$secret_id" \
  --region "$region" \
  --query SecretString \
  --output text >"$secret_json"
chmod 0600 "$secret_json"

python3 -c '
import json, re, sys
source, destination = sys.argv[1:3]
with open(source, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
if not isinstance(payload, dict) or not payload:
    raise SystemExit(65)
lines = []
for key in sorted(payload):
    value = payload[key]
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{1,127}", key):
        raise SystemExit(65)
    if isinstance(value, bool):
        value = "true" if value else "false"
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        value = str(value)
    if not isinstance(value, str) or not value or re.search(r"[\x00-\x20\x7f$#\x27\x22\\]", value):
        raise SystemExit(65)
    lines.append(f"{key}={value}\n")
with open(destination, "w", encoding="utf-8", newline="\n") as handle:
    handle.writelines(lines)
' "$secret_json" "$env_candidate"
chmod 0600 "$env_candidate"

require_env_value() {
  local key="$1"
  local value="$2"
  grep -Fqx "${key}=${value}" "$env_candidate"
}

require_env_value NODE_ENV production
require_env_value DEPLOY_ENV staging
require_env_value ALLOW_TEST_LOGIN false
require_env_value ALLOW_FORMAL_TEST_SEED false
require_env_value ALLOW_SIMULATION_SEED false
require_env_value ADMIN_DEFAULT_EMAIL yisun0316@gmail.com
grep -Eq '^ADMIN_DEFAULT_USERNAME=[A-Za-z0-9_.@-]{3,128}$' "$env_candidate"
grep -Eq '^ADMIN_DEFAULT_PASSWORD=.{12,}$' "$env_candidate"
grep -Eq '^AUTH_VERIFICATION_SECRET=.{32,}$' "$env_candidate"

install -m 0600 "$env_candidate" "$env_file"
chmod 0600 "$env_file"
install -m 0644 "$(nginx_config_for "$release_dir")" /srv/needo/config/nginx.conf

compose_for "$release_dir" config --quiet
compose_for "$release_dir" build migrate bootstrap-admin backend ops-api merchant-api web
compose_for "$release_dir" up -d --build --wait mysql redis

has_existing_schema="$(compose_for "$release_dir" exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" mysql --batch --skip-column-names -u"$MYSQL_USER" information_schema -e "SELECT COUNT(*) FROM tables WHERE table_schema=0x6e6565646f5f73746167696e67 AND table_name=0x5f707269736d615f6d6967726174696f6e73"')"
if [[ "$has_existing_schema" == "1" ]]; then
  backup_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_path="/srv/needo/tmp/pre-migration-${revision}-${backup_timestamp}.sql.gz"
  compose_for "$release_dir" exec -T mysql sh -c \
    'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump --single-transaction --routines --triggers --no-tablespaces -u"$MYSQL_USER" "$MYSQL_DATABASE"' \
    | gzip -9 >"$backup_path"
  backup_sha256="$(sha256sum "$backup_path" | awk '{print $1}')"
  AWS_PAGER="" aws s3 cp "$backup_path" \
    "s3://${backup_bucket}/staging/pre-migration/${revision}/${backup_timestamp}-${backup_sha256}.sql.gz" \
    --region "$region" --only-show-errors
  rm -f "$backup_path"
fi

compose_for "$release_dir" run --rm migrate
compose_for "$release_dir" run --rm bootstrap-admin
compose_for "$release_dir" up -d --build --wait backend ops-api merchant-api web
compose_for "$release_dir" up -d --no-deps --force-recreate --wait web

curl --fail --silent --show-error --header "Host: $hostname" \
  http://127.0.0.1/api/v1/ready | grep -q '"code":0'
curl --fail --silent --show-error --header "Host: $hostname" \
  http://127.0.0.1/ops-api/v1/ready | grep -q '"code":0'
curl --fail --silent --show-error --header "Host: $hostname" \
  http://127.0.0.1/merchant-api/v1/ready | grep -q '"code":0'

ln -sfn "$release_dir" /srv/needo/current.next
mv -Tf /srv/needo/current.next /srv/needo/current
printf '{"sourceRevision":"%s","archiveSha256":"%s"}\n' \
  "$revision" "$archive_sha256" >/srv/needo/active-release.json
chmod 0600 /srv/needo/active-release.json
deployment_complete=true
