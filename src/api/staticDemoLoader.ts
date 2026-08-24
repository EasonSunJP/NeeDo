import { isStaticDemoMode } from "./staticDemoMode";
import type { HttpClientRequestOptions } from "./httpClient";

type StaticDemoResult<TData> =
  | { handled: false }
  | {
      handled: true;
      data: TData;
    };

let staticDemoModulePromise: Promise<typeof import("./staticDemo")> | null = null;

function loadStaticDemoModule() {
  if (!__NEEDO_STATIC_DEMO_BUILD__) {
    throw new Error("Static demo runtime is not included in this production build");
  }

  staticDemoModulePromise ??= import("./staticDemo");
  return staticDemoModulePromise;
}

export async function resolveLoadedStaticDemoRequest<TData>(
  path: string,
  options: HttpClientRequestOptions
): Promise<StaticDemoResult<TData>> {
  if (!__NEEDO_STATIC_DEMO_BUILD__ || !isStaticDemoMode()) {
    return { handled: false };
  }

  const staticDemo = await loadStaticDemoModule();
  return staticDemo.resolveStaticDemoRequest<TData>(path, options);
}

export async function resolveLoadedStaticDemoDataUrl(
  path: string
): Promise<StaticDemoResult<string>> {
  if (!__NEEDO_STATIC_DEMO_BUILD__ || !isStaticDemoMode()) {
    return { handled: false };
  }

  const staticDemo = await loadStaticDemoModule();
  return staticDemo.resolveStaticDemoDataUrl(path);
}

export async function resolveLoadedStaticDemoGoogleAccountApi<TData>(
  path: string
): Promise<StaticDemoResult<TData>> {
  if (!__NEEDO_STATIC_DEMO_BUILD__ || !isStaticDemoMode()) {
    return { handled: false };
  }

  const staticDemo = await loadStaticDemoModule();
  return staticDemo.resolveStaticDemoGoogleAccountApi<TData>(path);
}

export async function resolveLoadedStaticDemoGoogleCalendarApi<TData>(
  path: string,
  init: RequestInit = {}
): Promise<StaticDemoResult<TData>> {
  if (!__NEEDO_STATIC_DEMO_BUILD__ || !isStaticDemoMode()) {
    return { handled: false };
  }

  const staticDemo = await loadStaticDemoModule();
  return staticDemo.resolveStaticDemoGoogleCalendarApi<TData>(path, init);
}

export function installLoadedStaticDemoFetchGuard(): void {
  if (!__NEEDO_STATIC_DEMO_BUILD__ || !isStaticDemoMode()) {
    return;
  }

  void loadStaticDemoModule().then((staticDemo) => staticDemo.installStaticDemoFetchGuard());
}
