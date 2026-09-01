import { describe, expect, it } from "vitest";
import source from "./UserListPage.tsx?raw";
import filtersSource from "./UserFilters.tsx?raw";

describe("formal all-user workspace", () => {
  it("uses URL filters and server pagination", () => {
    expect(source).toContain("useSearchParams");
    expect(source).toContain("platformUserManagementApi.listUsers");
    expect(source).toContain("page_size: 20");
    expect(source).toContain("setSearchParams");
    expect(filtersSource).toContain("onSubmit");
  });

  it("renders explicit loading, empty, retry and bounded account facts", () => {
    for (const text of ["正在读取全部用户", "没有符合条件的用户", "重新加载", "手机已绑定", "邮箱已绑定", "eKYC"]) {
      expect(source).toContain(text);
    }
    expect(source).toContain("row.experience ?");
    expect(source).not.toMatch(/passwordHash|accessToken|refreshToken|otp/i);
  });
});
