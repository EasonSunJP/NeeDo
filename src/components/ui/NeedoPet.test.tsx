import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import source from "./NeedoPet.tsx?raw";
import { NeedoPetRunningSprite } from "./NeedoPet";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

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

  it("stages transparent APNGs before swapping out fallback sprites", () => {
    expect(source).toContain("const [loadedSrc, setLoadedSrc] = useState<string | null>(null)");
    expect(source).toContain("{loadedSrc === clip.src ? (");
    expect(source).toContain("setLoadedSrc(clip.src)");
    expect(source).toContain("const [loadedRunId, setLoadedRunId] = useState<number | null>(null)");
    expect(source).toContain("{loadedRunId === runId ? (");
    expect(source).toContain("onLoad={() => setLoadedRunId(runId)}");
  });

  it("never paints a fallback underneath a transparent animation", () => {
    const motionSequenceSource = source.slice(
      source.indexOf("function NeedoPetMotionSequence"),
      source.indexOf("function NeedoPetOneShotMotion")
    );
    const oneShotMotionSource = source.slice(
      source.indexOf("function NeedoPetOneShotMotion"),
      source.indexOf("function NeedoPetSprite")
    );

    expect(motionSequenceSource).toContain('className="needo-pet-motion-image is-preloader"');
    expect(motionSequenceSource).toContain("{loadedSrc === clip.src ? (");
    expect(oneShotMotionSource).toContain('className="needo-pet-motion-image is-preloader"');
    expect(oneShotMotionSource).toContain("{loadedRunId === runId ? (");
  });

  it("keeps APNG preload probes out of the painted frame", () => {
    expect(styles).toMatch(/\.needo-pet-motion-image\.is-preloader\s*{[^}]*visibility:\s*hidden;/s);
  });

  it("keeps the pet button above its operation panel", () => {
    expect(styles).toMatch(/\.needo-pet-button\s*{[^}]*z-index:\s*2;/s);
    expect(styles).toMatch(/\.needo-pet-panel\s*{[^}]*z-index:\s*1;/s);
  });
});
