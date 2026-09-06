import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import pageSource from "../../pages/admin/LiveDashboardPage.tsx?raw";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const block = (selector: string) => styles.slice(styles.indexOf(`${selector} {`)).split("}")[0];

describe("live dashboard responsive layout contract", () => {
  it("uses theme text for new controls and one-row desktop region controls", () => {
    for (const selector of [".live-dashboard-region-navigator input, .live-dashboard-region-navigator select", ".live-dashboard-region-results li", ".live-dashboard-map-viewport-controls button"]) {
      expect(block(selector)).toContain("var(--admin-text,");
    }
    expect(block(".live-dashboard-region-navigator")).toContain("repeat(2, minmax(0, 1fr))");
    expect(block(".live-dashboard-region-search")).not.toContain("grid-column: 1 / -1");
    expect(block(".live-dashboard-map-tooltip")).toContain("min-height: 0");
    expect(block(".live-dashboard-map-stage")).toContain("grid-column: 1 / -1");
  });
  it("allocates the desktop viewport without a scaled minimum canvas", () => {
    expect(pageSource).not.toContain("viewportScale");
    expect(pageSource).not.toContain("--live-dashboard-scale");
    expect(block(".live-dashboard-workspace")).not.toMatch(/1124|transform|--live-dashboard-width/);
    expect(block(".live-dashboard-shell")).toMatch(/height:\s*100dvh/);
    expect(block(".live-dashboard-canvas")).toMatch(/grid-template-columns:\s*minmax\(0,/);
    expect(block(".live-dashboard-map-svg")).toMatch(/min-height:\s*0/);
    expect(block(".live-dashboard-scroll-list")).toMatch(/overflow-y:\s*auto/);
  });

  it("keeps a dedicated readable chart track in compact desktop mode", () => {
    expect(styles).toMatch(/\.live-dashboard-center\s*\{[^}]*minmax\(140px,/);
    const compact = styles.slice(styles.indexOf("@media (max-height: 700px)"));
    expect(compact).toContain(".live-dashboard-center");
    expect(compact).toMatch(/grid-template-rows:[^}]*140px/);
    expect(block(".live-dashboard-trend-chart svg")).not.toContain("110px");
  });

  it("hides only the graphic on portrait phones and uses a scrollable single column", () => {
    const portrait = styles.slice(styles.indexOf("@media (max-width: 767px) and (orientation: portrait)"));
    expect(portrait).toMatch(/\.live-dashboard-map-graphic\s*\{[^}]*display:\s*none/);
    expect(portrait).toMatch(/\.live-dashboard-shell\s*\{[^}]*overflow-y:\s*auto/);
    expect(portrait).toMatch(/\.live-dashboard-shell\s*\{[^}]*overflow-x:\s*clip/);
    expect(portrait).toMatch(/\.live-dashboard-canvas\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(portrait).not.toMatch(/\.live-dashboard-region-navigator\s*\{[^}]*display:\s*none/);
    expect(portrait).toContain(".is-service-ranking");
    expect(portrait).toContain(".is-technician-ranking");
  });
});
