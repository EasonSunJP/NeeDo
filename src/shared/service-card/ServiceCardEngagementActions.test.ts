import { describe, expect, it } from "vitest";
import actionSource from "./ServiceCardEngagementActions.tsx?raw";
import frameSource from "../info-card-system/UnifiedInfoCardFrame.tsx?raw";

describe("shared card engagement icons", () => {
  it("uses the application share icon in both interactive and read-only card metrics", () => {
    expect(actionSource).toContain("<AppIcon");
    expect(actionSource).toContain('name="share"');
    expect(frameSource).toContain("<AppIcon");
    expect(frameSource).toContain("name={name}");
    expect(actionSource).not.toContain("⌯");
    expect(frameSource).not.toContain('share: "⌯"');
  });
});
