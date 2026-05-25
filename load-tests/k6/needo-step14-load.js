import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3100";
const API_PREFIX = __ENV.API_PREFIX || "/api/v1";
const CDN_URL = __ENV.CDN_URL || "";
const CDN_ASSET_PATH = __ENV.CDN_ASSET_PATH || "/assets/index.js";
const LOAD_TIER = __ENV.LOAD_TIER || "1k";
const LOAD_TEST_EMAIL = __ENV.LOAD_TEST_EMAIL || "";
const LOAD_TEST_PASSWORD = __ENV.LOAD_TEST_PASSWORD || "";

const tiers = {
  "1k": {
    peakVus: 1000,
    stages: [
      { duration: "2m", target: 200 },
      { duration: "3m", target: 1000 },
      { duration: "5m", target: 1000 },
      { duration: "2m", target: 0 }
    ]
  },
  "5k": {
    peakVus: 5000,
    stages: [
      { duration: "5m", target: 1000 },
      { duration: "10m", target: 5000 },
      { duration: "10m", target: 5000 },
      { duration: "5m", target: 0 }
    ]
  },
  "10k": {
    peakVus: 10000,
    stages: [
      { duration: "10m", target: 3000 },
      { duration: "15m", target: 10000 },
      { duration: "15m", target: 10000 },
      { duration: "10m", target: 0 }
    ]
  },
  "30k": {
    peakVus: 30000,
    stages: [
      { duration: "15m", target: 10000 },
      { duration: "20m", target: 30000 },
      { duration: "20m", target: 30000 },
      { duration: "15m", target: 0 }
    ]
  },
  "100k": {
    peakVus: 100000,
    stages: [
      { duration: "20m", target: 30000 },
      { duration: "30m", target: 100000 },
      { duration: "30m", target: 100000 },
      { duration: "20m", target: 0 }
    ]
  }
};

if (!tiers[LOAD_TIER]) {
  throw new Error(`Unsupported LOAD_TIER: ${LOAD_TIER}`);
}

export const options = {
  scenarios: {
    anonymous_api_read: {
      executor: "ramping-vus",
      exec: "anonymousApiRead",
      stages: tiers[LOAD_TIER].stages,
      gracefulRampDown: "30s",
      tags: { flow: "anonymous_read", tier: LOAD_TIER }
    },
    static_asset_read: {
      executor: "constant-arrival-rate",
      exec: "staticAssetRead",
      rate: Math.max(10, Math.floor(tiers[LOAD_TIER].peakVus / 20)),
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: Math.min(1000, Math.max(50, Math.floor(tiers[LOAD_TIER].peakVus / 20))),
      maxVUs: Math.min(5000, Math.max(100, Math.floor(tiers[LOAD_TIER].peakVus / 5))),
      tags: { flow: "static_asset", tier: LOAD_TIER }
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{flow:anonymous_read}": ["p(50)<250", "p(95)<800", "p(99)<1500"],
    "http_req_duration{flow:static_asset}": ["p(95)<300", "p(99)<800"]
  }
};

export function setup() {
  if (!LOAD_TEST_EMAIL || !LOAD_TEST_PASSWORD) {
    return { accessToken: "" };
  }

  const response = http.post(
    `${BASE_URL}${API_PREFIX}/auth/login`,
    JSON.stringify({
      email: LOAD_TEST_EMAIL,
      password: LOAD_TEST_PASSWORD
    }),
    {
      headers: { "content-type": "application/json" },
      tags: { flow: "auth_login", tier: LOAD_TIER }
    }
  );

  check(response, {
    "login returns 200": (result) => result.status === 200,
    "login returns access token": (result) => Boolean(result.json("data.accessToken"))
  });

  return { accessToken: response.json("data.accessToken") || "" };
}

export function anonymousApiRead() {
  group("health and readiness", () => {
    check(http.get(`${BASE_URL}${API_PREFIX}/health`), {
      "health is 200": (response) => response.status === 200
    });
    check(http.get(`${BASE_URL}${API_PREFIX}/ready`), {
      "ready is 200": (response) => response.status === 200
    });
  });

  group("anonymous read APIs", () => {
    const endpoints = [
      "/categories?page=1&pageSize=20",
      "/services?page=1&pageSize=20&sort=recommended",
      "/home/recommendations?city=tokyo&limit=10",
      "/search?keyword=tokyo&page=1&pageSize=20"
    ];

    endpoints.forEach((endpoint) => {
      const response = http.get(`${BASE_URL}${API_PREFIX}${endpoint}`, {
        tags: { flow: "anonymous_read", tier: LOAD_TIER, endpoint }
      });
      check(response, {
        "read status is 200": (result) => result.status === 200,
        "read uses unified response": (result) => result.json("code") === 0
      });
    });
  });

  sleep(1);
}

export function staticAssetRead() {
  if (!CDN_URL) {
    return;
  }

  const response = http.get(`${CDN_URL}${CDN_ASSET_PATH}`, {
    tags: { flow: "static_asset", tier: LOAD_TIER }
  });
  check(response, {
    "static asset is cacheable": (result) =>
      result.status === 200 &&
      /max-age|immutable|s-maxage/.test(result.headers["Cache-Control"] || "")
  });
}
