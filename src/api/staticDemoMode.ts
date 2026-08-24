function isEnabledFlag(value: string | undefined) {
  return ["1", "static", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

export function isStaticDemoMode() {
  const isDedicatedStaticBuild = import.meta.env.VITE_NEEDO_BUILD_TARGET === "static-demo";
  if (import.meta.env.PROD && !isDedicatedStaticBuild) {
    return false;
  }

  return isEnabledFlag(import.meta.env.VITE_NEEDO_STATIC_DEMO) || isEnabledFlag(import.meta.env.VITE_STATIC_DEMO);
}

export function isStaticDemoStrictMode() {
  return isEnabledFlag(import.meta.env.VITE_NEEDO_STATIC_DEMO_STRICT) || isEnabledFlag(import.meta.env.VITE_STATIC_DEMO_STRICT);
}
