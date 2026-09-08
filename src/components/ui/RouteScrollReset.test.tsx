// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { RouteScrollReset } from "./RouteScrollReset";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps page position for drawer open and close, but resets for actual pagination and route changes", async () => {
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  let navigate: ReturnType<typeof useNavigate>;

  function Screen() {
    navigate = useNavigate();
    return <RouteScrollReset />;
  }

  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    await act(async () => root.render(<MemoryRouter initialEntries={["/admin/users?page=2"]}><Screen /></MemoryRouter>));
    expect(scroll).toHaveBeenCalledTimes(1);

    await act(async () => navigate("/admin/users?page=2&detailUserId=41"));
    expect(scroll).toHaveBeenCalledTimes(1);

    await act(async () => navigate("/admin/users?page=2"));
    expect(scroll).toHaveBeenCalledTimes(1);

    await act(async () => navigate("/admin/users?page=3"));
    expect(scroll).toHaveBeenCalledTimes(2);

    await act(async () => navigate("/admin/technicians"));
    expect(scroll).toHaveBeenCalledTimes(3);

    await act(async () => navigate("/admin/technicians?detailTechnicianId=23"));
    expect(scroll).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
    scroll.mockRestore();
  }
});
