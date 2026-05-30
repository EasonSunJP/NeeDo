import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NeedoPetRunningSprite } from "./NeedoPet";

describe("NeedoPetRunningSprite", () => {
  it("renders nothing while Xiaobai running assets are not ready", () => {
    expect(renderToStaticMarkup(<NeedoPetRunningSprite />)).toBe("");
  });
});
