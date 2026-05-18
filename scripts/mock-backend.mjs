import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";

const requestedPort = Number(process.env.MOCK_BACKEND_PORT || 4176);
const host = process.env.MOCK_BACKEND_HOST || "0.0.0.0";
const maxPortRetries = 12;
let activePort = requestedPort;
const supportedLanguages = ["zh", "zh-Hant", "ja", "en", "ko"];

const backendText = {
  missingRequestUrl: {
    zh: "缺少请求 URL",
    "zh-Hant": "缺少請求 URL",
    ja: "リクエスト URL がありません",
    en: "Missing request URL",
    ko: "요청 URL이 없습니다"
  },
  healthMessage: {
    zh: "NeeDo 当前仓库未接入独立真实后端，前端使用浏览器内 mock API。这个服务用于本地启动联调与健康检查。",
    "zh-Hant": "NeeDo 目前的工作區尚未接入獨立真實後端，前端使用瀏覽器內 mock API。這個服務用於本地啟動聯調與健康檢查。",
    ja: "NeeDo の現在のワークツリーには独立した実バックエンドが接続されておらず、フロントエンドはブラウザ内 mock API を利用しています。このサービスはローカル起動時の連携確認とヘルスチェック用です。",
    en: "This NeeDo workspace is not connected to a standalone real backend yet. The frontend is currently using browser-side mock APIs, and this service is only for local health checks and integration startup.",
    ko: "현재 NeeDo 워크스페이스는 독립된 실제 백엔드에 연결되어 있지 않으며, 프런트엔드는 브라우저 내부 mock API를 사용합니다. 이 서비스는 로컬 연동 실행과 헬스 체크용입니다."
  },
  statusNote: {
    zh: "IM 等接口由 src/features/im/api.ts 在前端运行时拦截模拟，当前不是独立 Node API。",
    "zh-Hant": "IM 等介面由 src/features/im/api.ts 在前端執行時攔截模擬，目前不是獨立 Node API。",
    ja: "IM などの API は src/features/im/api.ts がフロントエンド実行時に横取りして模擬しており、現在は独立した Node API ではありません。",
    en: "IM and related endpoints are intercepted and simulated by src/features/im/api.ts in the frontend runtime. This is not a standalone Node API right now.",
    ko: "IM 등 관련 엔드포인트는 프런트엔드 런타임의 src/features/im/api.ts 에서 가로채 모의 처리하고 있으며, 현재는 독립된 Node API가 아닙니다."
  },
  unknownRoute: {
    zh: "未知的 mock backend 路由",
    "zh-Hant": "未知的 mock backend 路由",
    ja: "不明な mock backend ルートです",
    en: "Unknown mock backend route",
    ko: "알 수 없는 mock backend 경로입니다"
  }
};

function normalizeLanguage(input) {
  if (typeof input !== "string" || input.length === 0) {
    return null;
  }

  const locale = input.trim().toLowerCase();

  if (locale === "zh-hant" || locale.startsWith("zh-tw") || locale.startsWith("zh-hk") || locale.startsWith("zh-mo") || locale.includes("-hant")) {
    return "zh-Hant";
  }

  if (locale.startsWith("ja")) {
    return "ja";
  }

  if (locale.startsWith("en")) {
    return "en";
  }

  if (locale.startsWith("ko")) {
    return "ko";
  }

  if (locale.startsWith("zh")) {
    return "zh";
  }

  return null;
}

function resolveLanguage(request, url) {
  const explicit = normalizeLanguage(url.searchParams.get("lang"));

  if (explicit && supportedLanguages.includes(explicit)) {
    return explicit;
  }

  const acceptLanguage = request.headers["accept-language"];

  if (typeof acceptLanguage === "string") {
    for (const segment of acceptLanguage.split(",")) {
      const normalized = normalizeLanguage(segment);
      if (normalized && supportedLanguages.includes(normalized)) {
        return normalized;
      }
    }
  }

  return "zh";
}

function t(table, language) {
  return table[language] ?? table.zh;
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(body, null, 2));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function normalizeQrToken(input) {
  const text = typeof input === "string" ? input.trim() : "";

  if (text.startsWith("needo://qr/")) {
    return text.replace("needo://qr/", "");
  }

  const match = text.match(/\/q\/([^/?#]+)/);
  return match?.[1] ?? text;
}

function normalizeTranslationTargets(input) {
  const rawTargets = Array.isArray(input) ? input : supportedLanguages;
  const targets = rawTargets
    .map((item) => normalizeLanguage(String(item)))
    .filter((item) => item && supportedLanguages.includes(item));

  return Array.from(new Set(targets));
}

function googleTranslateLanguage(language) {
  if (language === "zh") {
    return "zh-CN";
  }

  if (language === "zh-Hant") {
    return "zh-TW";
  }

  return language;
}

function parseGoogleTranslatePayload(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return "";
  }

  return payload[0]
    .map((segment) => Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "")
    .join("")
    .trim();
}

async function translateWithGooglePublicEndpoint(text, sourceLanguage, targetLanguage) {
  if (sourceLanguage === targetLanguage) {
    return text;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const translateUrl = new URL("https://translate.googleapis.com/translate_a/single");

  translateUrl.searchParams.set("client", "gtx");
  translateUrl.searchParams.set("sl", googleTranslateLanguage(sourceLanguage));
  translateUrl.searchParams.set("tl", googleTranslateLanguage(targetLanguage));
  translateUrl.searchParams.set("dt", "t");
  translateUrl.searchParams.set("q", text);

  try {
    const translateResponse = await fetch(translateUrl, { signal: controller.signal });

    if (!translateResponse.ok) {
      throw new Error(`Google translate returned ${translateResponse.status}`);
    }

    const translated = parseGoogleTranslatePayload(await translateResponse.json());

    return translated || text;
  } finally {
    clearTimeout(timeout);
  }
}

const demoQrResolutions = {
  "qr-table-a08": {
    qr_id: "qr-table-a08",
    type: "TABLE_MENU",
    shop_id: "store-1",
    facility_unit_id: "facility-table-a08",
    session_id: "session-a08",
    action: { type: "OPEN_DINE_IN_MENU", url: "/dine/session-a08/menu" },
    context: { shop_name: "GINZA Calm Body Lab", facility_label: "A区 8号桌", service_mode: "DINE_IN" }
  },
  "qr-room-vip3": {
    qr_id: "qr-room-vip3",
    type: "ROOM_MENU",
    shop_id: "store-1",
    facility_unit_id: "facility-room-vip3",
    session_id: "session-vip3",
    action: { type: "OPEN_DINE_IN_MENU", url: "/dine/session-vip3/menu" },
    context: { shop_name: "GINZA Calm Body Lab", facility_label: "VIP 3号包厢", service_mode: "DINE_IN" }
  },
  "qr-bed-2": {
    qr_id: "qr-bed-2",
    type: "BED_MENU",
    shop_id: "store-1",
    facility_unit_id: "facility-bed-2",
    session_id: "session-bed2",
    action: { type: "OPEN_DINE_IN_MENU", url: "/dine/session-bed2/menu" },
    context: { shop_name: "GINZA Calm Body Lab", facility_label: "2号床", service_mode: "DINE_IN" }
  },
  "qr-checkout-a08": {
    qr_id: "qr-checkout-a08",
    type: "CHECKOUT",
    shop_id: "store-1",
    facility_unit_id: "facility-table-a08",
    session_id: "session-a08",
    action: { type: "OPEN_DINE_IN_BILL", url: "/dine/session-a08/bill" },
    context: { shop_name: "GINZA Calm Body Lab", facility_label: "A区 8号桌", service_mode: "DINE_IN" }
  }
};

const server = createServer(async (request, response) => {
  if (!request.url) {
    json(response, 400, { ok: false, message: backendText.missingRequestUrl.en });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const language = resolveLanguage(request, url);

  if (url.pathname === "/" || url.pathname === "/health") {
    json(response, 200, {
      ok: true,
      mode: "mock-backend",
      host,
      port: activePort,
      message: t(backendText.healthMessage, language),
      frontendDevCommand: "npm run dev:frontend",
      backendDevCommand: "npm run dev:backend",
      combinedDevCommand: "npm run dev:all"
    });
    return;
  }

  if (url.pathname === "/api/status") {
    json(response, 200, {
      ok: true,
      host,
      port: activePort,
      apiMode: "browser-mock",
      note: t(backendText.statusNote, language)
    });
    return;
  }

  if (url.pathname === "/api/translate" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const source = normalizeLanguage(body.source) ?? "zh";
      const targets = normalizeTranslationTargets(body.targets);

      if (!text || targets.length === 0) {
        json(response, 400, {
          ok: false,
          message: "Missing translation text or target languages"
        });
        return;
      }

      const translations = {};

      await Promise.all(
        targets.map(async (target) => {
          translations[target] = await translateWithGooglePublicEndpoint(text, source, target);
        })
      );

      json(response, 200, {
        ok: true,
        provider: "google-public",
        source,
        translations
      });
    } catch (error) {
      json(response, 502, {
        ok: false,
        provider: "google-public",
        message: "Translation service is unavailable",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (url.pathname === "/api/v1/qr/resolve" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const token = normalizeQrToken(body.token);
      const resolution = demoQrResolutions[token];

      if (!resolution) {
        json(response, 404, {
          ok: false,
          message: "Unknown or inactive QR token",
          token
        });
        return;
      }

      json(response, 200, {
        ok: true,
        ...resolution
      });
    } catch (error) {
      json(response, 400, {
        ok: false,
        message: "Invalid JSON body",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  json(response, 404, {
    ok: false,
    message: t(backendText.unknownRoute, language),
    path: url.pathname
  });
});

function resolveAvailablePort(port, attempt = 0) {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.unref();

    probe.once("error", (error) => {
      probe.close();

      if (error?.code === "EADDRINUSE" && attempt < maxPortRetries) {
        const nextPort = port + 1;
        console.warn(`[mock-backend] port ${port} is already in use, retrying on ${nextPort}`);
        resolve(resolveAvailablePort(nextPort, attempt + 1));
        return;
      }

      reject(error);
    });

    probe.once("listening", () => {
      const address = probe.address();
      const availablePort = typeof address === "object" && address ? address.port : port;
      probe.close(() => resolve(availablePort));
    });

    probe.listen(port, host);
  });
}

try {
  activePort = await resolveAvailablePort(requestedPort);
  server.listen(activePort, host, () => {
    console.log(`[mock-backend] listening on http://${host}:${activePort}`);
    console.log(`[mock-backend] health: http://${host}:${activePort}/health`);
    console.log("[mock-backend] mode: browser-side mock API bridge");
  });
} catch (error) {
  console.error(`[mock-backend] failed to start near ${host}:${requestedPort}`);
  throw error;
}

function shutdown(signal) {
  console.log(`[mock-backend] received ${signal}, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
