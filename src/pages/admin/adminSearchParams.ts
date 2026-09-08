export function readPositiveIntegerSearchParam(
  params: URLSearchParams,
  key: string
): number | null {
  const raw = params.get(key);
  if (!raw || !/^\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
