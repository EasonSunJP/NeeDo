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
