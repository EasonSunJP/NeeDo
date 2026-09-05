import { describe, expect, it } from "vitest";
import source from "./UserListPage.tsx?raw";
import directorySource from "./UnifiedUserDirectory.tsx?raw";
import filtersSource from "./UserFilters.tsx?raw";

describe("formal all-user workspace", () => {
  it("uses URL filters and server pagination", () => {
    expect(directorySource).toContain("useSearchParams");
    expect(source).toContain('scope="operations"');
    expect(source).toContain("UnifiedUserDirectory");
    expect(filtersSource).toContain("onSubmit");
    expect(directorySource).toContain("setSearchParams");
    expect(directorySource).toContain("page_size: pageSize");
    expect(source).toContain('readPositiveIntegerSearchParam(searchParams, "detailUserId")');
  });

  it("renders explicit loading, empty, retry and bounded account facts", () => {
    expect(source).toContain("UnifiedUserDetailDrawer");
    expect(source).not.toContain("function UserTable");
    expect(source).not.toContain("邮箱已绑定");
    expect(source).not.toMatch(/passwordHash|accessToken|refreshToken|otp/i);
  });
});
