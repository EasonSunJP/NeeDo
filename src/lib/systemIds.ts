export type SystemEntityPrefix = "u" | "b" | "s";

export function formatSystemId(prefix: SystemEntityPrefix, sequence: number) {
  return `${prefix}${String(sequence).padStart(10, "0")}`;
}

export function hashSystemId(prefix: SystemEntityPrefix, seed: string | number) {
  const source = String(seed);
  let hash = 0;

  for (const char of source) {
    hash = (hash * 131 + char.charCodeAt(0)) % 10_000_000_000;
  }

  return formatSystemId(prefix, hash || 1);
}
