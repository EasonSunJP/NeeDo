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
  assert.match(compose, /ALLOW_STAGING_ADMIN_BOOTSTRAP:\s*"true"/);
  assert.match(compose, /restart:\s*"no"/);
});

test("HTTP and HTTPS Nginx configs preserve portal entries and deny public metrics", () => {
  for (const path of ["./nginx-http.conf", "./nginx-https.conf"]) {
    const config = read(path);
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
