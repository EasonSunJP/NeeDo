import { describe, expect, it } from "vitest";
import type { PermissionTreePayload } from "../../api/userManagement";
import { flattenPermissionTree } from "./permissionTree";

describe("flattenPermissionTree", () => {
  it("returns every permission from every module and type without a page-size cap", () => {
    const permissions = Array.from({ length: 121 }, (_, index) => ({
      id: index + 1,
      name: `Permission ${index + 1}`,
      code: `module:item:${index + 1}`,
      type: index % 2 === 0 ? "api" : "button",
      module: index < 61 ? "module-a" : "module-b",
      description: null,
      isSystem: true,
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-06T00:00:00.000Z",
      deletedAt: null
    }));
    const tree: PermissionTreePayload = {
      modules: [
        {
          module: "module-a",
          children: [
            { type: "api", permissions: permissions.slice(0, 31) },
            { type: "button", permissions: permissions.slice(31, 61) }
          ]
        },
        {
          module: "module-b",
          children: [{ type: "api", permissions: permissions.slice(61) }]
        }
      ]
    };

    expect(flattenPermissionTree(tree)).toHaveLength(121);
    expect(flattenPermissionTree(tree).at(-1)?.code).toBe("module:item:121");
  });
});
