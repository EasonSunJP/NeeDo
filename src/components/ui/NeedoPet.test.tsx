import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import source from "./NeedoPet.tsx?raw";
import { NeedoPetRunningSprite } from "./NeedoPet";

describe("NeedoPetRunningSprite", () => {
  it("renders nothing while Xiaobai running assets are not ready", () => {
    expect(renderToStaticMarkup(<NeedoPetRunningSprite />)).toBe("");
  });

  it("loads motion clips on demand instead of preloading every idle animation", () => {
    expect(source).not.toContain("clips.forEach");
    expect(source).toContain('fallbackSrc={petSpriteSrc.idle}');
    expect(source).toContain('fallbackSrc={petSpriteSrc.running}');
    expect(source).toContain('src={sprite === "death" ? petSpriteSrc.grave : petSpriteSrc.idle}');
  });
});
