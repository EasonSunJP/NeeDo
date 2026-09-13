import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  coarseExchangeServiceArea,
  projectExchangeRequestAddress
} from "../src/domain/exchange-address-privacy";

describe("Exchange Request address privacy", () => {
  it.each([
    ["東京都渋谷区道玄坂1-12-1", "東京都渋谷区"],
    ["〒530-0001 大阪府大阪市北区梅田1-1-3", "大阪府大阪市北区"],
    ["神奈川県横浜市西区みなとみらい2-3", "神奈川県横浜市西区"],
    ["東京都町田市原町田6-12-20", "東京都町田市"],
    ["千葉県市川市八幡1-1-1", "千葉県市川市"],
    ["長野県大町市大町3887", "長野県大町市"],
    ["渋谷区", "渋谷区"]
  ])("projects %s to the administrative service area %s", (address, area) => {
    expect(coarseExchangeServiceArea(address)).toBe(area);
  });

  it("fails closed when an address has no recognised administrative boundary", () => {
    expect(coarseExchangeServiceArea("1 Main Street, private building")).toBe("—");
  });

  it("does not redact an owner or completed-match participant projection", () => {
    for (const disclosure of ["owner", "matched_participant"] as const) {
      const address = {
        line1: "東京都渋谷区道玄坂1-12-1",
        line2: "12F",
        line3: null,
        line2GenerallyVisible: false,
        line3GenerallyVisible: false,
        disclosure
      };
      expect(
        projectExchangeRequestAddress({
          areaLabel: "東京都渋谷区道玄坂1-12-1",
          address
        })
      ).toEqual({ areaLabel: "東京都渋谷区道玄坂1-12-1", address });
    }
  });

  it("packages the authoritative administrative-region catalog in the runtime image", () => {
    const dockerfile = readFileSync(join(__dirname, "../Dockerfile"), "utf8");

    expect(dockerfile).toContain(
      "COPY --from=build /app/prisma/reference/jp-administrative-regions-2026.json ./prisma/reference/jp-administrative-regions-2026.json"
    );
  });
});
