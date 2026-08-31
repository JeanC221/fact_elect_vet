"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortState } from "@/mappers/tableSort";

interface SortableHeaderProps<K extends string> {
  label: string;
  column: K;
  sort: SortState<K> | null;
  onSort: (column: K) => void;
  className?: string;
}

export function SortableHeader<K extends string>({ label, column, sort, onSort, className = "" }: SortableHeaderProps<K>) {
  const active = sort?.column === column;
  const Icon = active ? (sort!.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 font-semibold hover:text-clinical-blue ${active ? "text-clinical-blue" : "text-muted"}`}
      >
        {label}
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
    </th>
  );
}