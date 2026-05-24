import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const workspaceRoot = "/Users/eason/Documents/New project";
const appSourcePath = path.join(workspaceRoot, "src/App.tsx");
const defaultBaseUrl = "http://127.0.0.1:4173";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputRoot = path.join(workspaceRoot, "exports/i18n/page-screenshots");
const languageHtmlLang = {
  ja: "ja",
  en: "en"
};
const authStorageKey = "needo.auth.session";
const allPortals = ["user", "merchant", "technician", "business", "admin"];
const portalEmails = {
  user: "admin@needo.jp",
  merchant: "store-admin@needo.jp",
  technician: "admin@needo.jp",
  business: "afirieito@needo.jp",
  admin: "admin@needo.jp"
};
const viewport = {
  mobile: { width: 430, height: 932, deviceScaleFactor: 1, mobile: true },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
};

function parseArgs() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const item = process.argv[index];
    if (!item.startsWith("--")) {
      continue;
    }

    const [key, rawValue] = item.slice(2).split("=");
    args.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: args.get("base-url") ?? defaultBaseUrl,
    limit: args.has("limit") ? Number(args.get("limit")) : null,
    languages: (args.get("languages") ?? "ja,en").split(",").map((item) => item.trim()).filter(Boolean),
    routes: args.has("routes") ? args.get("routes").split(",").map((item) => item.trim()).filter(Boolean) : null,
    outputDir: args.get("output-dir") ?? path.join(outputRoot, new Date().toISOString().replace(/[:.]/g, "-"))
  };
}

function slugify(value) {
  return value
    .replace(/^\/+/, "root/")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "root";
}

function unique(items) {
  return Array.from(new Set(items));
}

async function extractRoutePaths() {
  const source = await fs.readFile(appSourcePath, "utf8");
  return unique(Array.from(source.matchAll(/<Route\s+path="([^"]+)"/g), (match) => match[1])).filter((route) => route !== "*");
}

function resolveDynamicRoute(route) {
  if (route.includes("*")) {
    return null;
  }

  let resolved = route;
  const replacements = [
    [/\/login\/:portal\b/, "/login/user"],
    [/\/services\/:id\b/, "/services/svc-massage-1"],
    [/\/stores\/:id\b/, "/stores/store-1"],
    [/\/profiles\/:entityType\/:id\/followers\b/, "/profiles/technician/tech-1/followers"],
    [/\/profiles\/:entityType\/:id\/following\b/, "/profiles/technician/tech-1/following"],
    [/\/profiles\/:entityType\/:id\b/, "/profiles/technician/tech-1"],
    [/\/checkout\/:serviceId\b/, "/checkout/svc-massage-1"],
    [/\/q\/:token\b/, "/q/demo"],
    [/\/dine\/:sessionId\/menu\b/, "/dine/demo/menu"],
    [/\/dine\/:sessionId\/bill\b/, "/dine/demo/bill"],
    [/\/dine\/orders\/:orderId\b/, "/dine/orders/ord-1"],
    [/\/dine\/items\/:itemId\b/, "/dine/items/item-1"],
    [/\/messages\/:conversationId\/info\b/, "/messages/conv-user-store-1/info"],
    [/\/messages\/:conversationId\/media\b/, "/messages/conv-user-store-1/media"],
    [/\/messages\/:conversationId\b/, "/messages/conv-user-store-1"],
    [/\/contacts\/:contactId\b/, "/contacts/contact-tech-1"],
    [/\/moments\/tags\/:tag\b/, "/moments/tags/%E6%8C%89%E6%91%A9"],
    [/\/moments\/posts\/:postId\/replies\b/, "/moments/posts/post-1/replies"],
    [/\/moments\/posts\/:postId\/repost\b/, "/moments/posts/post-1/repost"],
    [/\/moments\/posts\/:postId\/media\/:mediaId\b/, "/moments/posts/post-1/media/media-1"],
    [/\/moments\/posts\/:postId\b/, "/moments/posts/post-1"],
    [/\/needo\/posts\/:postId\/customer\b/, "/needo/posts/needo-post-1/customer"],
    [/\/needo\/posts\/:postId\b/, "/needo/posts/needo-post-1"],
    [/\/orders\/:orderId\b/, "/orders/ord-1"],
    [/\/merchant\/schedule\/arrangements\/:orderId\b/, "/merchant/schedule/arrangements/ord-1"],
    [/\/merchant\/schedule\/cells\/:date\/:slot\/:technicianId\b/, "/merchant/schedule/cells/2026-04-12/21%3A00/tech-1"],
    [/\/merchant\/orders\/:orderId\/change\b/, "/merchant/orders/ord-1/change"],
    [/\/merchant\/orders\/:orderId\/dispatch\b/, "/merchant/orders/ord-1/dispatch"],
    [/\/merchant\/orders\/:orderId\b/, "/merchant/orders/ord-1"],
    [/\/merchant\/dine\/orders\/:orderId\b/, "/merchant/dine/orders/ord-1"],
    [/\/merchant\/staff\/:staffId\b/, "/merchant/staff/tech-1"],
    [/\/merchant\/member\/:section\b/, "/merchant/member/overview"],
    [/\/shop\/member\/:section\b/, "/shop/member/overview"],
    [/\/merchant\/profiles\/:entityType\/:id\/followers\b/, "/merchant/profiles/technician/tech-1/followers"],
    [/\/merchant\/profiles\/:entityType\/:id\/following\b/, "/merchant/profiles/technician/tech-1/following"],
    [/\/merchant\/profiles\/:entityType\/:id\b/, "/merchant/profiles/technician/tech-1"],
    [/\/merchant\/:view\b/, "/merchant/schedule"],
    [/\/merchant-admin\/orders\/:orderId\b/, "/merchant-admin/orders/ord-1"],
    [/\/technician\/schedule\/events\/:eventId\/edit\b/, "/technician/schedule/events/booking-self-1/edit"],
    [/\/technician\/schedule\/events\/:eventId\b/, "/technician/schedule/events/booking-self-1"],
    [/\/technician\/schedule\/shifts\/:shiftId\/transfer\b/, "/technician/schedule/shifts/duty-demo-appt-tech-1-2026-05-24/transfer"],
    [/\/technician\/orders\/:orderId\b/, "/technician/orders/ord-1"],
    [/\/technician\/messages\/:conversationId\/info\b/, "/technician/messages/conv-tech-store-1/info"],
    [/\/technician\/messages\/:conversationId\/media\b/, "/technician/messages/conv-tech-store-1/media"],
    [/\/technician\/messages\/:conversationId\b/, "/technician/messages/conv-tech-store-1"],
    [/\/technician\/contacts\/:contactId\b/, "/technician/contacts/contact-store-1"],
    [/\/technician\/moments\/tags\/:tag\b/, "/technician/moments/tags/%E6%8E%A5%E5%AE%A2"],
    [/\/technician\/moments\/posts\/:postId\/replies\b/, "/technician/moments/posts/post-1/replies"],
    [/\/technician\/moments\/posts\/:postId\/repost\b/, "/technician/moments/posts/post-1/repost"],
    [/\/technician\/moments\/posts\/:postId\/media\/:mediaId\b/, "/technician/moments/posts/post-1/media/media-1"],
    [/\/technician\/moments\/posts\/:postId\b/, "/technician/moments/posts/post-1"],
    [/\/technician\/profiles\/:entityType\/:id\/followers\b/, "/technician/profiles/technician/tech-1/followers"],
    [/\/technician\/profiles\/:entityType\/:id\/following\b/, "/technician/profiles/technician/tech-1/following"],
    [/\/technician\/profiles\/:entityType\/:id\b/, "/technician/profiles/technician/tech-1"],
    [/\/technician\/:view\b/, "/technician/schedule"]
  ];

  for (const [pattern, value] of replacements) {
    resolved = resolved.replace(pattern, value);
  }

  if (resolved.includes(":")) {
    return null;
  }

  return resolved;
}

function getSurface(route) {
  return route.startsWith("/merchant-admin") || route.startsWith("/admin") || route.startsWith("/NDA-admin")
    ? "desktop"
    : "mobile";
}

function getPortalForRoute(route) {
  if (route.startsWith("/login")) {
    return null;
  }

  if (route.startsWith("/merchant-admin") || route.startsWith("/merchant") || route.startsWith("/shop")) {
    return "merchant";
  }

  if (route.startsWith("/technician")) {
    return "technician";
  }

  if (route.startsWith("/afirieito") || route.startsWith("/business") || route.startsWith("/cps")) {
    return "business";
  }

  if (route.startsWith("/admin")) {
    return "admin";
  }

  return "user";
}

function buildAuthSession(portal) {
  return {
    authVersion: 2,
    username: portalEmails[portal] ?? "admin@needo.jp",
    email: portalEmails[portal] ?? "admin@needo.jp",
    portal,
    allowedPortals: allPortals,
    loginMethod: "password",
    loggedInAt: new Date().toISOString(),
    linkedCustomerId: "cus-1",
    linkedTechnicianId: "tech-1",
    linkedStoreId: "store-1"
  };
}

async function waitForUrl(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // Retry until Chrome starts listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
  }

  handleMessage(raw) {
    const message = JSON.parse(raw);
    if (!message.id) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result);
    }
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket.close();
  }
}

async function createCdpClient(port) {
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const target = await targetResponse.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return new CdpClient(socket);
}

async function waitForPageReady(client) {
  const expression = `(() => {
    const text = document.body?.innerText || "";
    return {
      readyState: document.readyState,
      hasMain: Boolean(document.querySelector("main")),
      splash: text.includes("Splash screen loading") || text.includes("正在Enter"),
      length: text.length
    };
  })()`;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await client.send("Runtime.evaluate", { expression, returnByValue: true });
    const value = result.result.value;
    if (value?.readyState !== "loading" && value?.hasMain && !value?.splash) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return null;
}

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  await waitForPageReady(client);
}

async function setLanguage(client, baseUrl, language) {
  await navigate(client, `${baseUrl}/#/me/settings/language`);
  await client.send("Runtime.evaluate", {
    expression: `localStorage.setItem("needo.language", ${JSON.stringify(language)}); localStorage.setItem("needo.language.mode", "manual");`,
    returnByValue: true
  });
}

async function seedAuthForRoute(client, route) {
  const portal = getPortalForRoute(route);
  const sessionExpression = portal
    ? `localStorage.setItem(${JSON.stringify(authStorageKey)}, ${JSON.stringify(JSON.stringify(buildAuthSession(portal)))});`
    : `localStorage.removeItem(${JSON.stringify(authStorageKey)});`;

  await client.send("Runtime.evaluate", {
    expression: sessionExpression,
    returnByValue: true
  });
}

function inspectLanguageText(text, language) {
  const compact = text.replace(/\s+/g, " ");
  const allowedCjk = /NeeDo|Afirieito|NDP|CPS|CPA|QR|LINE|KYC|GINZA|Tokyo|Lv\.|VIP|Bed|EASON|日本語|한국어|繁中|简中|English/g;
  const normalized = compact.replace(allowedCjk, "");
  const flags = [];
  const matches = [];

  if (language === "en" && /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(normalized)) {
    flags.push("English page contains CJK text");
    matches.push(...(normalized.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g) ?? []));
  }

  if (language === "ja" && /[\uac00-\ud7af]/.test(normalized)) {
    flags.push("Japanese page contains Korean text");
    matches.push(...(normalized.match(/[\uac00-\ud7af]+/g) ?? []));
  }

  const simplifiedMatches = normalized.match(/(门户|预约|筛选|设置|状态|订单|店铺|扫码|二维码|暂无|当前|可以|规则|数据|组织|层级|节点|点击|查看|提现|冻结|收益|触发|对象|涉及|后台|前台|上传|生成|创建|添加|用户|商户|技师|评价)/g) ?? [];

  if (language === "ja" && simplifiedMatches.length > 0) {
    flags.push("Japanese page may contain simplified Chinese");
    matches.push(...simplifiedMatches);
  }

  return { flags, matches: [...new Set(matches)].slice(0, 30) };
}

async function inspectPage(client, language) {
  const expression = `(() => {
    const pageText = () => {
      const nodes = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest("[data-no-i18n], [aria-hidden='true'], script, style, noscript, code, pre")) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      let current = walker.nextNode();
      while (current) {
        nodes.push(current.nodeValue || "");
        current = walker.nextNode();
      }
      return nodes.join(" ");
    };
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 1 && rect.height > 1;
    };
    const overflow = Array.from(document.querySelectorAll("button, a, [role='button'], [class*='card'], [class*='tab'], [class*='chip'], h1, h2, h3, p, span"))
      .filter(visible)
      .filter((element) => {
        const style = getComputedStyle(element);
        const text = (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim();
        const isScrollableContainer = style.overflowX === "auto" || style.overflowX === "scroll" || style.overflow === "auto" || style.overflow === "scroll";
        const isLineClamped = style.webkitLineClamp && style.webkitLineClamp !== "none";
        const isEllipsized = style.textOverflow === "ellipsis";
        const isSmallNumericBadge = /^\\d+$/.test(text) && element.clientWidth <= 32 && element.scrollWidth <= element.clientWidth + 12;
        const horizontalOverflow = !isScrollableContainer && !isEllipsized && !isSmallNumericBadge && element.scrollWidth > element.clientWidth + 8;
        const verticalOverflow = !isLineClamped && (style.overflowY === "hidden" || style.overflow === "hidden") && element.scrollHeight > element.clientHeight + 8;
        return horizontalOverflow || verticalOverflow;
      })
      .slice(0, 30)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 140),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight
        };
      });
    return {
      url: window.location.href,
      hash: window.location.hash,
      htmlLang: document.documentElement.lang,
      title: document.title,
      text: pageText().slice(0, 4000),
      recovery: (document.body?.innerText || "").includes("runtime error") || (document.body?.innerText || "").includes("恢复"),
      overflow
    };
  })()`;
  const result = await client.send("Runtime.evaluate", { expression, returnByValue: true });
  const value = result.result.value;
  const languageInspection = inspectLanguageText(value.text, language);
  return {
    ...value,
    languageMatches: languageInspection.matches,
    flags: [
      ...(value.htmlLang !== languageHtmlLang[language] ? [`Expected html lang ${languageHtmlLang[language]}, got ${value.htmlLang}`] : []),
      ...(value.recovery ? ["Recovery/runtime error page visible"] : []),
      ...languageInspection.flags,
      ...(value.overflow.length > 0 ? [`${value.overflow.length} possible overflow elements`] : [])
    ]
  };
}

async function captureRoute(client, options) {
  const surface = getSurface(options.route);
  const viewportConfig = viewport[surface];
  await seedAuthForRoute(client, options.route);
  await client.send("Emulation.setDeviceMetricsOverride", viewportConfig);
  await navigate(client, `${options.baseUrl}/?i18n=${options.language}-${Date.now()}#${options.route}`);
  await new Promise((resolve) => setTimeout(resolve, surface === "desktop" ? 1100 : 800));
  const inspection = await inspectPage(client, options.language);
  const redirectedToLogin = !options.route.startsWith("/login") && inspection.hash.startsWith("#/login");
  const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const fileName = `${String(options.index + 1).padStart(3, "0")}-${slugify(options.route)}.png`;
  const languageDir = path.join(options.outputDir, options.language);
  await fs.mkdir(languageDir, { recursive: true });
  const filePath = path.join(languageDir, fileName);
  await fs.writeFile(filePath, Buffer.from(screenshot.data, "base64"));

  return {
    route: options.route,
    language: options.language,
    surface,
    screenshot: filePath,
    url: inspection.url,
    hash: inspection.hash,
    title: inspection.title,
    htmlLang: inspection.htmlLang,
    flags: redirectedToLogin ? ["Redirected to login instead of target route", ...inspection.flags] : inspection.flags,
    languageMatches: inspection.languageMatches,
    overflow: inspection.overflow,
    excerpt: inspection.text.replace(/\s+/g, " ").trim().slice(0, 240)
  };
}

async function writeReports(outputDir, results, skipped) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "report.json");
  const mdPath = path.join(outputDir, "report.md");
  await fs.writeFile(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), skipped, results }, null, 2));

  const lines = [
    "# NeeDo i18n Page Screenshot Audit",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `Screenshots: ${results.length}`,
    `Flagged screenshots: ${results.filter((item) => item.flags.length > 0).length}`,
    "",
    "## Flagged",
    "",
    "| Language | Route | Screenshot | Flags |",
    "| --- | --- | --- | --- |"
  ];

  results
    .filter((item) => item.flags.length > 0)
    .forEach((item) => {
      lines.push(`| ${item.language} | ${item.route} | ${item.screenshot} | ${item.flags.join("<br>")} |`);
    });

  lines.push("", "## All Screenshots", "", "| Language | Route | Surface | Screenshot |", "| --- | --- | --- | --- |");
  results.forEach((item) => {
    lines.push(`| ${item.language} | ${item.route} | ${item.surface} | ${item.screenshot} |`);
  });

  if (skipped.length > 0) {
    lines.push("", "## Skipped Dynamic Routes", "", ...skipped.map((item) => `- ${item}`));
  }

  await fs.writeFile(mdPath, `${lines.join("\n")}\n`);
  return { jsonPath, mdPath };
}

async function main() {
  const options = parseArgs();
  const routePaths = await extractRoutePaths();
  const concreteRoutes = [];
  const skipped = [];

  routePaths.forEach((route) => {
    const resolved = resolveDynamicRoute(route);
    if (resolved) {
      concreteRoutes.push(resolved);
    } else {
      skipped.push(route);
    }
  });

  const routePool = options.routes?.length ? options.routes : unique(concreteRoutes);
  const routes = routePool.slice(0, options.limit ?? undefined);
  const port = 9300 + Math.floor(Math.random() * 500);
  const userDataDir = path.join("/private/tmp", `needo-i18n-chrome-${Date.now()}`);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    "about:blank"
  ], { stdio: "ignore" });

  try {
    await waitForUrl(`http://127.0.0.1:${port}/json/version`, 30_000);
    const client = await createCdpClient(port);
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    const results = [];
    for (const language of options.languages) {
      if (!languageHtmlLang[language]) {
        throw new Error(`Unsupported language for screenshot audit: ${language}`);
      }

      await setLanguage(client, options.baseUrl, language);

      for (let index = 0; index < routes.length; index += 1) {
        const route = routes[index];
        try {
          results.push(await captureRoute(client, {
            baseUrl: options.baseUrl,
            index,
            language,
            outputDir: options.outputDir,
            route
          }));
        } catch (error) {
          results.push({
            route,
            language,
            surface: getSurface(route),
            screenshot: null,
            title: "",
            htmlLang: "",
            flags: [`Capture failed: ${error instanceof Error ? error.message : String(error)}`],
            overflow: [],
            excerpt: ""
          });
        }
      }
    }

    client.close();
    const reports = await writeReports(options.outputDir, results, skipped);
    console.log(JSON.stringify({
      outputDir: options.outputDir,
      routeCount: routes.length,
      screenshotCount: results.filter((item) => item.screenshot).length,
      flaggedCount: results.filter((item) => item.flags.length > 0).length,
      skippedDynamicRoutes: skipped.length,
      ...reports
    }, null, 2));
  } finally {
    chrome.kill();
    await fs.rm(userDataDir, { force: true, recursive: true, maxRetries: 5, retryDelay: 150 }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
