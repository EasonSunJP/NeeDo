export type SortableDirectoryContact = {
  name: string;
  todayPriority?: boolean;
  followed?: boolean;
};

export function sortDirectoryContacts<T extends SortableDirectoryContact>(items: T[]) {
  return [...items].sort((left, right) =>
    Number(right.todayPriority) - Number(left.todayPriority)
    || Number(right.followed) - Number(left.followed)
    || left.name.localeCompare(right.name, "ja")
  );
}

export function partitionDirectoryContacts<T extends SortableDirectoryContact & { followed: boolean }>(items: T[]) {
  const sorted = sortDirectoryContacts(items);

  return {
    followed: sorted.filter((item) => item.followed),
    regular: sorted.filter((item) => !item.followed)
  };
}
