import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import source from "./NeedoPet.tsx?raw";
import { getPetMotionFrameIndex, getPetMotionFrameSource, NeedoPetRunningSprite } from "./NeedoPet";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("NeedoPetRunningSprite", () => {
  it("shows the pet name as Dodo", () => {
    expect(source).toContain("<span>Dodo</span>");
    expect(source).not.toContain("小白 / Xiaobai");
  });

  it("selects deterministic looping and one-shot atlas frames", () => {
    expect(getPetMotionFrameIndex(2_000, 1_000 / 6, 14, true)).toBe(12);
    expect(getPetMotionFrameIndex(3_000, 1_000 / 6, 14, true)).toBe(4);
    expect(getPetMotionFrameIndex(3_000, 1_000 / 6, 14, false)).toBe(13);
    expect(getPetMotionFrameSource(12, 10, 132, 143)).toEqual({ sourceX: 264, sourceY: 143 });
  });

  it("renders nothing while Xiaobai running assets are not ready", () => {
    expect(renderToStaticMarkup(<NeedoPetRunningSprite />)).toBe("");
  });

  it("loads motion clips on demand instead of preloading every idle animation", () => {
    expect(source).not.toContain("clips.forEach");
    expect(source).toContain("const nextAtlas = new Image()");
    expect(source).toContain("nextAtlas.onload = switchClip");
    expect(source).toContain('fallbackSrc={petSpriteSrc.idle}');
    expect(source).toContain('fallbackSrc={petSpriteSrc.running}');
    expect(source).toContain('fallbackSrc={sprite === "death" ? petSpriteSrc.grave : petSpriteSrc.idle}');
  });

  it("uses one fixed canvas per motion instead of native animated images", () => {
    const motionSequenceSource = source.slice(
      source.indexOf("function NeedoPetMotionSequence"),
      source.indexOf("function NeedoPetOneShotMotion")
    );
    const oneShotMotionSource = source.slice(
      source.indexOf("function NeedoPetOneShotMotion"),
      source.indexOf("function NeedoPetSprite")
    );

    expect(motionSequenceSource.match(/<NeedoPetCanvas\b/g)).toHaveLength(1);
    expect(oneShotMotionSource.match(/<NeedoPetCanvas\b/g)).toHaveLength(1);
    expect(motionSequenceSource).not.toContain("<img");
    expect(oneShotMotionSource).not.toContain("<img");
    expect(source).not.toContain("is-preloader");
    expect(source).not.toContain("is-fallback");
  });

  it("does not keep hidden native animation decoders in the composited pet layer", () => {
    expect(styles).not.toMatch(/\.needo-pet-motion-image\.is-preloader/);
    expect(styles).not.toMatch(/\.needo-pet-motion-image\.is-fallback/);
    expect(styles).toMatch(/\.needo-pet-motion-canvas\s*{[^}]*width:\s*132px;[^}]*height:\s*143px;/s);
  });

  it("keeps the pet button above its operation panel", () => {
    expect(styles).toMatch(/\.needo-pet-button\s*{[^}]*z-index:\s*2;/s);
    expect(styles).toMatch(/\.needo-pet-panel\s*{[^}]*z-index:\s*1;/s);
  });
});
