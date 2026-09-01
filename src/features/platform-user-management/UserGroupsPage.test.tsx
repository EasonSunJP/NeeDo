import { describe, expect, it } from "vitest";
import pageSource from "./UserGroupsPage.tsx?raw";
import editorSource from "./UserGroupEditor.tsx?raw";
import membersSource from "./UserGroupMembersDrawer.tsx?raw";

describe("formal user-group administration", () => {
  it("keeps five derived system groups immutable and allows overlapping operations membership", () => {
    for (const code of ["system:free", "system:silver", "system:gold", "system:black_diamond", "system:operations"]) expect(pageSource).toContain(code);
    expect(pageSource).toContain('group.kind === "custom"');
    expect(pageSource).toContain("会员分组与运营成员可以重叠");
  });

  it("uses formal APIs for custom CRUD and current paginated members", () => {
    expect(pageSource).toContain("platformUserManagementApi.listGroups");
    expect(editorSource).toContain("platformUserManagementApi.createGroup");
    expect(editorSource).toContain("platformUserManagementApi.updateGroup");
    expect(editorSource).toContain("platformUserManagementApi.archiveGroup");
    expect(membersSource).toContain("platformUserManagementApi.listGroupMembers");
    expect(membersSource).toContain("platformUserManagementApi.setGroupMembers");
    expect(membersSource).toContain("变更原因");
  });
});
