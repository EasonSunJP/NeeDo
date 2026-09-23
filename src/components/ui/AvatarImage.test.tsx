// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AvatarImage } from "./AvatarImage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const defaultAvatar = "/images/generated/profiles/dodo-default-avatar.webp";
const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);

afterEach(async () => {
  await act(async () => root.render(null));
});

describe("AvatarImage", () => {
  it("shows the system image for an unset or failed avatar and preserves a working custom image", async () => {
    await act(async () => root.render(<AvatarImage alt="新人" src="" />));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(defaultAvatar);

    await act(async () => root.render(<AvatarImage alt="新人" src="/uploads/custom-avatar.jpg" />));
    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("/uploads/custom-avatar.jpg");

    await act(async () => image.dispatchEvent(new Event("error")));
    expect(image.getAttribute("src")).toBe(defaultAvatar);

    await act(async () => root.render(<AvatarImage alt="新人" src="/uploads/next-avatar.jpg" />));
    expect(image.getAttribute("src")).toBe("/uploads/next-avatar.jpg");

    await act(async () => root.render(<AvatarImage alt="新人" src="/images/generated/profiles/custom.jpg" />));
    expect(image.getAttribute("src")).toBe("/images/generated/thumbnails/profiles/custom.jpg");
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(image.getAttribute("src")).toBe("/images/generated/profiles/custom.jpg");
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(image.getAttribute("src")).toBe(defaultAvatar);
  });
});
