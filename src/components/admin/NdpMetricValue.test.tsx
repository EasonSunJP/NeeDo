import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NdpMetricValue } from "./NdpMetricValue";

describe("NdpMetricValue", () => {
  it("renders formal NDP as primary and Test NDP as secondary", () => {
    const markup = renderToStaticMarkup(<NdpMetricValue ndp={999} testNdp={999} />);

    expect(markup).toContain("999 NDP");
    expect(markup).toContain("+ 999 Test NDP");
    expect(markup).not.toContain("1,998 NDP");
  });
});
