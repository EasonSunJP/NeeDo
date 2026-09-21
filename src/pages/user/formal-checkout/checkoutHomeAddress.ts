import type { JapaneseRouteAddress } from "../../../api/travelFare";

function normalizeAddressPart(value: string | undefined) {
  return value?.normalize("NFKC").trim().replace(/\s+/gu, " ") ?? "";
}

export function normalizeCheckoutHomeAddress(address: JapaneseRouteAddress): JapaneseRouteAddress {
  const addressLine2 = normalizeAddressPart(address.addressLine2);
  const building = normalizeAddressPart(address.building);

  return {
    countryCode: "JP",
    postalCode: normalizeAddressPart(address.postalCode),
    prefecture: normalizeAddressPart(address.prefecture),
    city: normalizeAddressPart(address.city),
    addressLine1: normalizeAddressPart(address.addressLine1),
    ...(addressLine2 ? { addressLine2 } : {}),
    ...(building ? { building } : {})
  };
}

export function isTravelEstimateAddressComplete(
  address: JapaneseRouteAddress,
  admin1Code: string,
  admin2Code: string
) {
  const normalized = normalizeCheckoutHomeAddress(address);
  return /^\d{3}-?\d{4}$/u.test(normalized.postalCode)
    && Boolean(admin1Code.trim())
    && Boolean(admin2Code.trim())
    && Boolean(normalized.prefecture)
    && Boolean(normalized.city)
    && Boolean(normalized.addressLine1);
}
