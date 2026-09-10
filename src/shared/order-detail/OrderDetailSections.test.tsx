import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderDetailFactGrid, OrderDetailSection } from "./OrderDetailSections";

describe("shared order detail sections", () => {
  it("renders the same titled profile section for every portal", () => {
    const html = renderToStaticMarkup(
      <OrderDetailSection title="技师 / 担当">
        <article>正式技师资料</article>
      </OrderDetailSection>
    );

    expect(html).toContain("技师 / 担当");
    expect(html).toContain("正式技师资料");
    expect(html).toContain("space-y-3");
  });

  it("renders labeled facts with the user booking-detail card treatment", () => {
    const html = renderToStaticMarkup(
      <OrderDetailFactGrid
        rows={[["预约编号", <span key="number">ND-1</span>], ["状态", "已确认"]]}
        title="预约情报"
      />
    );

    expect(html).toContain("预约情报");
    expect(html).toContain("预约编号");
    expect(html).toContain("ND-1");
    expect(html).toContain("shadow-panel");
  });
});
