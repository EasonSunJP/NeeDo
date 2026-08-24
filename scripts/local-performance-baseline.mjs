import process from "node:process";
import { performance } from "node:perf_hooks";
import {
  hasBenchmarkErrors,
  requestEnvelope,
  resolveApiBaseUrl,
  summarizeDurations
} from "./release-verification-lib.mjs";

const apiBaseUrl = resolveApiBaseUrl(
  process.env.LOCAL_PERF_BASE_URL || "http://127.0.0.1:3000"
);
const concurrency = Math.min(100, Math.max(1, Number(process.env.LOCAL_PERF_CONCURRENCY) || 10));
const requestsPerPath = Math.min(
  1000,
  Math.max(1, Number(process.env.LOCAL_PERF_REQUESTS_PER_PATH) || 100)
);
const paths = [
  "/health",
  "/ready",
  "/categories?page=1&pageSize=20",
  "/services?page=1&pageSize=20&sort=recommended",
  "/home/recommendations?city=tokyo&limit=10",
  "/search?keyword=tokyo&page=1&pageSize=20"
];

async function measurePath(path) {
  const durations = [];
  let errors = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < requestsPerPath) {
      cursor += 1;
      const startedAt = performance.now();
      try {
        await requestEnvelope(fetch, `${apiBaseUrl}${path}`, {
          signal: AbortSignal.timeout(10_000)
        });
      } catch {
        errors += 1;
      } finally {
        durations.push(performance.now() - startedAt);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, requestsPerPath) }, worker));

  return {
    path,
    ...summarizeDurations(durations),
    errors,
    errorRate: Number((errors / durations.length).toFixed(4))
  };
}

const startedAt = performance.now();
const results = [];
for (const path of paths) {
  results.push(await measurePath(path));
}

const report =
  JSON.stringify(
    {
      kind: "local-development-baseline-not-capacity-qualification",
      baseUrl: apiBaseUrl,
      concurrency,
      requestsPerPath,
      totalDurationMs: Number((performance.now() - startedAt).toFixed(2)),
      results
    },
    null,
    2
  );

console.log(report);

if (hasBenchmarkErrors(results)) {
  console.error("[local-performance-baseline] FAIL one or more requests returned an error");
  process.exitCode = 1;
}
