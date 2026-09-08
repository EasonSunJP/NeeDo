import type { PermissionPayload, PermissionTreePayload } from "../../api/userManagement";

export function flattenPermissionTree(tree: PermissionTreePayload | null): PermissionPayload[] {
  if (!tree) return [];

  const permissionsById = new Map<number, PermissionPayload>();
  for (const moduleNode of tree.modules) {
    for (const typeNode of moduleNode.children) {
      for (const permission of typeNode.permissions) {
        permissionsById.set(permission.id, permission);
      }
    }
  }
  return Array.from(permissionsById.values());
}
