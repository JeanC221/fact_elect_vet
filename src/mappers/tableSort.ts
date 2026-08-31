/** Ascending or descending sort direction, toggled by re-clicking the same column header. */
export type SortDirection = "asc" | "desc";

/** Currently active sort: which column (by generic key) and which direction. Null = insertion order (unsorted). */
export interface SortState<K extends string> {
  column: K;
  direction: SortDirection;
}

export function nextSortState<K extends string>(
  current: SortState<K> | null,
  clicked: K,
): SortState<K> | null {
  if (!current || current.column !== clicked) return { column: clicked, direction: "asc" };
  if (current.direction === "asc") return { column: clicked, direction: "desc" };
  return null;
}

export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K> | null,
  extract: (row: T, column: K) => string | number | Date,
): T[] {
  if (!sort) return rows;
  const { column, direction } = sort;
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = extract(a, column);
    const vb = extract(b, column);
    if (va instanceof Date && vb instanceof Date) return (va.getTime() - vb.getTime()) * dir;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "es", { sensitivity: "base" }) * dir;
  });
}