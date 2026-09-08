import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("staging compose exposes only the web edge and binds durable data to /srv/needo", () => {
  const compose = read("./docker-compose.yml");

  assert.match(compose, /^\s{2}backend:\s*$/m);
  assert.match(compose, /^\s{2}ops-api:\s*$/m);
  assert.match(compose, /^\s{2}merchant-api:\s*$/m);
  assert.match(compose, /^\s{2}web:\s*$/m);
  assert.match(compose, /- "80:80"/);
  assert.match(compose, /- "443:443"/);
  assert.doesNotMatch(compose, /BACKEND_HOST_PORT/);
  assert.doesNotMatch(compose, /3306:3306|6379:6379|3000:3000/);
  assert.match(compose, /\/srv\/needo\/mysql:\/var\/lib\/mysql/);
  assert.match(compose, /\/srv\/needo\/redis:\/data/);
  assert.match(compose, /\/srv\/needo\/media:\/app\/runtime/);
  assert.match(compose, /IM_MEDIA_STORAGE_DIR:\s*\/app\/runtime\/im-media/);
  assert.match(compose, /CONTENT_MEDIA_STORAGE_DIR:\s*\/app\/runtime\/content-media/);
  assert.match(compose, /ALLOW_STAGING_ADMIN_BOOTSTRAP:\s*"true"/);
  assert.match(compose, /restart:\s*"no"/);
});

test("HTTP and HTTPS Nginx configs preserve portal entries and deny public metrics", () => {
  for (const path of ["./nginx-http.conf", "./nginx-https.conf"]) {
    const config = read(path);
    assert.match(config, /client_max_body_size 8m;/);
    assert.match(config, /location = \/api\/v1\/metrics[\s\S]*deny all;/);
    assert.match(config, /proxy_pass http:\/\/needo_backend/);
    assert.match(config, /proxy_pass http:\/\/needo_ops_api\/api\/v1\//);
    assert.match(config, /proxy_pass http:\/\/needo_merchant_api\/api\/v1\//);
    assert.match(config, /location ~\* \\.html\$[\s\S]*Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;/);
    assert.match(config, /\/merchant-admin[\s\S]*\/store-admin\.html/);
    assert.match(config, /\/admin[\s\S]*\/pf-admin\.html/);
    assert.match(config, /\/shop[\s\S]*\/merchant\.html/);
    assert.match(config, /\/technician[\s\S]*\/technician\.html/);
  }
  assert.match(read("./nginx-https.conf"), /ssl_certificate \/etc\/letsencrypt\/live\/staging\.needo\.life\/fullchain\.pem/);
});

test("runtime Dockerfiles consume only locked dependencies and prebuilt outputs", () => {
  const backend = read("./backend-runtime.Dockerfile");
  const frontend = read("./frontend.Dockerfile");

  assert.match(backend, /^FROM nginx:1\.27-alpine AS trusted-certificates$/m);
  assert.match(backend, /COPY --from=trusted-certificates \/etc\/ssl\/certs\/ca-certificates\.crt \/etc\/ssl\/certs\/ca-certificates\.crt/);
  assert.match(backend, /npm ci/);
  assert.match(backend, /s\|http:\/\/deb\.debian\.org\|https:\/\/deb\.debian\.org\|g/);
  assert.match(backend, /apt-get install -y --no-install-recommends openssl/);
  assert.match(backend, /npx prisma generate/);
  assert.match(backend, /COPY backend\/prisma\.config\.ts \.\/prisma\.config\.ts/);
  assert.match(backend, /FROM all-deps AS migration/);
  assert.match(backend, /FROM node:22-bookworm-slim AS runtime/);
  assert.match(backend, /USER node/);
  assert.match(backend, /COPY backend\/dist \.\/dist/);
  assert.doesNotMatch(backend, /npm run build/);
  assert.doesNotMatch(backend, /Verify-Peer|--allow-unauthenticated/);
  assert.match(frontend, /FROM nginx:1\.27-alpine/);
  assert.match(frontend, /COPY dist\/ \/usr\/share\/nginx\/html\//);
  assert.match(frontend, /find \/usr\/share\/nginx\/html -type d -exec chmod 0755 \{\} \\;/);
  assert.match(frontend, /find \/usr\/share\/nginx\/html -type f -exec chmod 0644 \{\} \\;/);
});

test("immutable staging packaging explicitly disables Google auth in the frontend build", () => {
  const packager = read("../../scripts/aws-staging-package-application.mjs");

  assert.match(packager, /VITE_AUTH_GOOGLE_ENABLED:\s*"false"/);
  assert.match(packager, /"backend\/prisma\.config\.ts"/);
});

test("immutable staging release disables self-registration at both edges", () => {
  const compose = read("./docker-compose.yml");
  const packager = read("../../scripts/aws-staging-package-application.mjs");

  assert.match(compose, /AUTH_REGISTRATION_ENABLED:\s*"false"/);
  assert.match(packager, /VITE_AUTH_REGISTRATION_ENABLED:\s*"false"/);
});

test("release provisioning keeps the ACME webroot public while certificate state stays private", () => {
  const releaseScript = read("./deploy-release.sh");

  assert.match(releaseScript, /install -d -m 0755 \/srv\/needo\/certbot\/www/);
  assert.match(releaseScript, /install -d -m 0750 \/srv\/needo\/certbot\/conf/);
  assert.doesNotMatch(
    releaseScript,
    /install -d -m 0750 \/srv\/needo\/certbot\/conf \/srv\/needo\/certbot\/www/,
  );
});

test("staging migration backup avoids privileged tablespace reads", () => {
  const releaseScript = read("./deploy-release.sh");
  assert.match(releaseScript, /mysqldump --single-transaction --routines --triggers --no-tablespaces/);
});

test("staging web preserves an existing TLS edge for deploy and rollback", () => {
  const releaseScript = read("./deploy-release.sh");
  assert.match(releaseScript, /nginx_config_for\(\)/);
  assert.match(releaseScript, /fullchain\.pem[\s\S]*privkey\.pem[\s\S]*nginx-https\.conf/);
  assert.match(releaseScript, /install -m 0644 "\$\(nginx_config_for "\$previous_release"\)"[\s\S]{0,420}up -d --no-build --no-deps --force-recreate --wait web/);
  assert.match(releaseScript, /install -m 0644 "\$\(nginx_config_for "\$release_dir"\)"[\s\S]{0,3400}up -d --no-deps --force-recreate --wait web/);
  assert.match(releaseScript, /edge_base_url="https:\/\/\$hostname"/);
  assert.match(releaseScript, /--resolve "\$\{hostname\}:443:127\.0\.0\.1"/);
});

test("web healthcheck tolerates the local HTTPS redirect after TLS activation", () => {
  const compose = read("./docker-compose.yml");

  assert.match(
    compose,
    /wget -q --spider --no-check-certificate http:\/\/127\.0\.0\.1\/api\/v1\/health/,
  );
  assert.doesNotMatch(
    compose,
    /wget -q --spider http:\/\/127\.0\.0\.1\/api\/v1\/health/,
  );
});

test("deployment acceptance follows the exact staging HTTPS redirect with TLS SNI", () => {
  const deployer = read("../../scripts/aws-staging-deploy-application.mjs");

  assert.match(deployer, /import https from "node:https"/);
  assert.match(deployer, /servername:\s*hostname/);
  assert.match(deployer, /location !== `https:\/\/\$\{hostname\}\/api\/v1\/ready`/);
});

test("split APIs share the explicit live-dashboard Redis connection", () => {
  const compose = read("./docker-compose.yml");
  const shared = compose.slice(compose.indexOf("environment: &api-environment"), compose.indexOf("  depends_on:"));
  const redis = shared.match(/^    REDIS_URL: (.+)$/m)?.[1];
  const liveRedis = shared.match(/^    LIVE_DASHBOARD_REDIS_URL: (.+)$/m)?.[1];
  assert.ok(redis);
  assert.equal(liveRedis, redis);
});

test("staging MySQL 8 services explicitly allow RSA public-key retrieval", () => {
  const compose = read("./docker-compose.yml");
  assert.match(compose, /DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: "true"/);
});

test("a command failure inside a deployment function reaches the rollback trap", () => {
  const flags = read("./deploy-release.sh").match(/^set -[^\n]+$/m)?.[0];
  assert.ok(flags);
  const result = spawnSync("bash", ["-c", `${flags}\ntrap 'printf rollback-invoked' ERR\ncompose_for() { false; }\ncompose_for`], {encoding:"utf8"});
  assert.notEqual(result.status,0);
  assert.equal(result.stdout,"rollback-invoked");
});


test("rollback restores applications without rerunning data initialization", () => {
  const rollback = read("./deploy-release.sh").split("rollback_application() {")[1].split("trap cleanup EXIT")[0];
  assert.match(rollback, /up -d --no-build --no-deps --wait backend ops-api merchant-api/);
  assert.match(rollback, /up -d --no-build --no-deps --force-recreate --wait web/);
});

test("staging backs up and snapshots rollback images before stopping APIs and serial builds", () => {
  const script = read("./deploy-release.sh");
  const backupComplete = script.indexOf('rm -f "$backup_path"');
  const snapshot = script.indexOf('capture_rollback_images "$previous_release"');
  const stop = script.indexOf('compose_for "$previous_release" stop backend ops-api merchant-api');
  const build = script.indexOf('build_application_images "$release_dir"');
  const migrate = script.indexOf('compose_for "$release_dir" run --rm migrate');
  assert.ok(backupComplete > 0 && snapshot > backupComplete && stop > snapshot && build > stop && migrate > build);
  assert.ok(script.indexOf('trap rollback_application ERR') < stop);
  assert.ok(script.indexOf('application_transition_started=true') < stop);
  assert.ok(script.indexOf('[[ "$backup_complete" == true ]]') > backupComplete);
  assert.ok(script.indexOf('[[ "$backup_complete" == true ]]') < snapshot);
  assert.doesNotMatch(script, /build migrate bootstrap-admin backend ops-api merchant-api web/);
  assert.doesNotMatch(script, /up -d --build/);
  assert.match(script, /for service in migrate bootstrap-admin backend ops-api merchant-api web; do[\s\S]*?compose_for "\$target_release" build "\$service"/);
});

test("serial build stops at the first failure and reaches rollback", () => {
  const script = read("./deploy-release.sh");
  const helper = script.match(/build_application_images\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper);
  const shell = `set -Eeuo pipefail\n${helper}\ncompose_for() { printf '%s\\n' "$3"; [[ "$3" != ops-api ]]; }\ntrap 'printf rollback-invoked' ERR\nbuild_application_images release`;
  const result = spawnSync("bash", ["-c", shell], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "migrate\nbootstrap-admin\nbackend\nops-api\nrollback-invoked");
});

test("rollback uses captured deployed images without resource-intensive rebuilds", () => {
  const script = read("./deploy-release.sh");
  const rollback = script.split("rollback_application() {")[1].split("trap cleanup EXIT")[0];
  assert.match(script, /docker inspect --format '\{\{\.Image\}\}'/);
  assert.match(script, /image: %s/);
  assert.match(rollback, /application_transition_started.*true/);
  assert.match(rollback, /--file "\$rollback_images_file" up -d --no-build --no-deps --wait backend ops-api merchant-api/);
  assert.doesNotMatch(rollback, /--build|\brun\b.*migrate|bootstrap-admin/);
});

test("an application failure restores all captured previous images with no builds or data jobs", () => {
  const script = read("./deploy-release.sh");
  const rollback = script.match(/rollback_application\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(rollback);
  const result = spawnSync("bash", ["-c", `set -Eeuo pipefail
${rollback}
deployment_complete=false
application_transition_started=true
previous_release=.
rollback_images_file=captured-images.yml
nginx_config_for() { printf old-nginx; }
install() { :; }
ln() { :; }
mv() { :; }
compose_for() { printf '%s\\n' "$*"; }
trap rollback_application ERR
false`], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, ". --file captured-images.yml up -d --no-build --no-deps --wait backend ops-api merchant-api\n. --file captured-images.yml up -d --no-build --no-deps --force-recreate --wait web\n");
});
