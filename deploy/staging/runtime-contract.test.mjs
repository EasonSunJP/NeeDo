import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

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
  assert.doesNotMatch(backend, /FROM all-deps AS simulation-sync/);
  assert.doesNotMatch(backend, /COPY backend\/(?:src|scripts)/);
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

test("one-shot simulation sync is isolated behind an explicit compose profile", () => {
  const compose = read("./docker-compose.yml");
  assert.match(compose, /^\s{2}simulation-sync:\s*$/m);
  assert.match(compose, /profiles:\s*\["simulation-sync"\]/);
  assert.match(compose, /ALLOW_STAGING_SIMULATION_SYNC:\s*"true"/);
  assert.match(compose, /ALLOW_SIMULATION_SEED:\s*"false"/);
  assert.match(compose, /target:\s*runtime/);
  assert.match(compose, /command:\s*\["node", "dist\/staging\/simulation-seed\.cjs"\]/);
});

test("immutable staging packaging explicitly disables Google auth in the frontend build", () => {
  const packager = read("../../scripts/aws-staging-package-application.mjs");

  assert.match(packager, /VITE_AUTH_GOOGLE_ENABLED:\s*"false"/);
  assert.match(packager, /"backend\/prisma\.config\.ts"/);
  assert.match(packager, /simulation-seed\.cjs/);
  assert.match(packager, /future-operations-seed\.cjs/);
  assert.match(packager, /simulation-check\.cjs/);
  assert.doesNotMatch(packager, /^\s*"backend\/(?:src|scripts|tsconfig\.json)",?$/m);
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
  assert.match(releaseScript, /install -m 0644 "\$\(nginx_config_for "\$previous_release"\)"[\s\S]{0,220}up -d --no-deps --force-recreate --wait web/);
  assert.match(releaseScript, /install -m 0644 "\$\(nginx_config_for "\$release_dir"\)"[\s\S]{0,2400}up -d --no-deps --force-recreate --wait web/);
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
