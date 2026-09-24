import type { ExchangePostPayload, ExchangeRequestAddressPayload } from "../types/exchange.types";
import administrativeCatalog from "../../prisma/reference/jp-administrative-regions-2026.json";

type AdministrativeRegionName = {
  officialCode: string;
  level: "ADMIN1" | "ADMIN2";
  parentOfficialCode: string | null;
  nameJa: string;
};

const regions = administrativeCatalog.regions
  .filter(
    (region): region is (typeof administrativeCatalog.regions)[number] & AdministrativeRegionName =>
      region.level === "ADMIN1" || region.level === "ADMIN2"
  )
  .sort((left, right) => right.nameJa.length - left.nameJa.length);
const prefectures = regions.filter((region) => region.level === "ADMIN1");
const municipalities = regions.filter((region) => region.level === "ADMIN2");

const longestAdministrativePrefix = (
  value: string,
  candidates: AdministrativeRegionName[]
): AdministrativeRegionName | null =>
  candidates.find((candidate) => value.startsWith(candidate.nameJa)) ?? null;

/**
 * Historical Requests persisted address line 1 without a publication notice.
 * Only explicitly public new lines may be returned to unmatched viewers.
 * Otherwise, project a recognised administrative boundary and fail closed.
 */
export const coarseExchangeServiceArea = (value: string): string => {
  const normalized = value
    .trim()
    .replace(/^〒?\d{3}-?\d{4}\s*/u, "")
    .replace(/\s+/gu, "");
  const prefecture = longestAdministrativePrefix(normalized, prefectures);
  if (prefecture) {
    const municipality = longestAdministrativePrefix(
      normalized.slice(prefecture.nameJa.length),
      municipalities.filter((candidate) => candidate.parentOfficialCode === prefecture.officialCode)
    );
    return municipality ? `${prefecture.nameJa}${municipality.nameJa}` : prefecture.nameJa;
  }
  return longestAdministrativePrefix(normalized, municipalities)?.nameJa ?? "—";
};

export const projectExchangeRequestAddress = (input: {
  areaLabel: string;
  address: ExchangeRequestAddressPayload;
}): { areaLabel: string; address: ExchangeRequestAddressPayload } => {
  if (input.address.disclosure !== "general") return input;
  return {
    areaLabel: coarseExchangeServiceArea(input.address.line1 ?? input.areaLabel),
    address: {
      line1: input.address.line1GenerallyVisible ? input.address.line1 : null,
      line2: null,
      line3: null,
      line1GenerallyVisible: input.address.line1GenerallyVisible ?? false,
      line2GenerallyVisible: false,
      line3GenerallyVisible: false,
      disclosure: "general"
    }
  };
};

export const enforceExchangeRequestAddressPrivacy = (
  post: ExchangePostPayload
): ExchangePostPayload => {
  if (!post.demand) return post;
  const projection = projectExchangeRequestAddress({
    areaLabel: post.areaLabel,
    address: post.demand.address
  });
  if (projection.areaLabel === post.areaLabel && projection.address === post.demand.address) {
    return post;
  }
  return {
    ...post,
    areaLabel: projection.areaLabel,
    demand: { ...post.demand, address: projection.address }
  };
};
