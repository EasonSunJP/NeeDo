const imMediaCachePolicyParameter = "needo_media_policy";
const imMediaCachePolicyVersion = "2";

export function resolveImNoStoreMediaSource(source: string) {
  const absolute = /^https?:\/\//i.test(source);
  let resolved: URL;
  try {
    resolved = new URL(source, "http://needo.invalid");
  } catch {
    return source;
  }
  if (!resolved.pathname.startsWith("/media/im/")) return source;
  if (!resolved.searchParams.has(imMediaCachePolicyParameter)) {
    resolved.searchParams.set(
      imMediaCachePolicyParameter,
      imMediaCachePolicyVersion,
    );
  }
  return absolute
    ? resolved.toString()
    : `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export async function classifyImMediaDeliveryFailure(
  source: string,
  currentOrigin: string,
  fetcher: typeof fetch = fetch,
): Promise<"retryable" | "unavailable"> {
  let resolved: URL;
  try {
    resolved = new URL(source, currentOrigin);
  } catch {
    return "unavailable";
  }
  if (
    !["http:", "https:"].includes(resolved.protocol) ||
    !resolved.pathname.startsWith("/media/im/")
  ) {
    return "unavailable";
  }

  try {
    const response = await fetcher(`${resolved.pathname}${resolved.search}`, {
      cache: "no-store",
      credentials: "same-origin",
      method: "HEAD",
    });
    if ([401, 403, 408, 429].includes(response.status) || response.status >= 500) {
      return "retryable";
    }
    return response.ok ? "retryable" : "unavailable";
  } catch {
    return "retryable";
  }
}
