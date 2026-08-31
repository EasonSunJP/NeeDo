import { createHash } from "node:crypto";

export const stableJson = (value: unknown): string => {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const sha256StableJson = (value: unknown): string =>
  createHash("sha256").update(stableJson(value)).digest("hex");
