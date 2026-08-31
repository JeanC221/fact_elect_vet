import { describe, it, expect } from "vitest";
import { nextSortState, sortRows, type SortState } from "./tableSort";

describe("nextSortState", () => {
  it("starts a new column ascending", () => {
    expect(nextSortState(null, "name")).toEqual({ column: "name", direction: "asc" });
  });
  it("toggles asc -> desc on the same column", () => {
    expect(nextSortState({ column: "name", direction: "asc" }, "name")).toEqual({ column: "name", direction: "desc" });
  });
  it("toggles desc -> null (back to unsorted) on the same column", () => {
    expect(nextSortState({ column: "name", direction: "desc" }, "name")).toBeNull();
  });
  it("clicking a different column resets to ascending on the new column", () => {
    expect(nextSortState({ column: "name", direction: "desc" }, "total")).toEqual({ column: "total", direction: "asc" });
  });
});

describe("sortRows", () => {
  const rows = [
    { name: "Beta", total: 200, date: new Date("2026-08-20") },
    { name: "alfa", total: 50, date: new Date("2026-08-25") },
    { name: "Gamma", total: 100, date: new Date("2026-08-15") },
  ];
  const extract = (r: (typeof rows)[number], col: "name" | "total" | "date") => r[col];

  it("returns rows unchanged (same order) when sort is null", () => {
    expect(sortRows(rows, null, extract)).toEqual(rows);
  });
  it("sorts strings case-insensitively with Spanish collation, ascending", () => {
    const sort: SortState<"name" | "total" | "date"> = { column: "name", direction: "asc" };
    expect(sortRows(rows, sort, extract).map((r) => r.name)).toEqual(["alfa", "Beta", "Gamma"]);
  });
  it("sorts strings descending", () => {
    const sort: SortState<"name" | "total" | "date"> = { column: "name", direction: "desc" };
    expect(sortRows(rows, sort, extract).map((r) => r.name)).toEqual(["Gamma", "Beta", "alfa"]);
  });
  it("sorts numbers ascending", () => {
    const sort: SortState<"name" | "total" | "date"> = { column: "total", direction: "asc" };
    expect(sortRows(rows, sort, extract).map((r) => r.total)).toEqual([50, 100, 200]);
  });
  it("sorts Dates ascending (oldest first)", () => {
    const sort: SortState<"name" | "total" | "date"> = { column: "date", direction: "asc" };
    expect(sortRows(rows, sort, extract).map((r) => r.name)).toEqual(["Gamma", "Beta", "alfa"]);
  });
  it("does not mutate the input array", () => {
    const original = [...rows];
    sortRows(rows, { column: "name", direction: "asc" }, extract);
    expect(rows).toEqual(original);
  });
});