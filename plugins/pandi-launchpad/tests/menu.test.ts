import { describe, expect, it } from "vitest";
import { classifyMenuNote, DEFAULT_EXIT_ITEM, DEFAULT_MENU_ITEMS, menuCells } from "../src/menu.ts";

describe("menuCells", () => {
  const items = [{ label: "seguir", text: "seguí con lo que estabas haciendo", col: 1, row: 1, color: "green" }];

  it("builds one cell per pad in each item's block, keyed by pad note", () => {
    const { cells, byNote } = menuCells(items);
    const itemCells = cells.filter((c) => c.color === "green");
    expect(itemCells).toEqual([
      { col: 1, row: 1, color: "green", mode: "static" },
      { col: 1, row: 2, color: "green", mode: "static" },
      { col: 2, row: 1, color: "green", mode: "static" },
      { col: 2, row: 2, color: "green", mode: "static" },
    ]);
    expect(byNote.get(11)).toBe("seguir");
    expect(byNote.get(21)).toBe("seguir");
    expect(byNote.get(12)).toBe("seguir");
    expect(byNote.get(22)).toBe("seguir");
  });

  it("defaults each item's block to 2x2", () => {
    const { cells } = menuCells(items);
    const itemCells = cells.filter((c) => c.color === "green");
    expect(itemCells).toHaveLength(4);
  });

  it("respects an explicit colSpan/rowSpan", () => {
    const { cells } = menuCells([{ ...items[0]!, colSpan: 1, rowSpan: 1 }]);
    const itemCells = cells.filter((c) => c.color === "green");
    expect(itemCells).toEqual([{ col: 1, row: 1, color: "green", mode: "static" }]);
  });

  it("keeps separate items' pads distinct in byNote", () => {
    const { byNote } = menuCells([
      { label: "seguir", text: "seguí", col: 1, row: 1, color: "green" },
      { label: "commit", text: "hacé commit", col: 3, row: 1, color: "blue" },
    ]);
    expect(byNote.get(11)).toBe("seguir");
    expect(byNote.get(13)).toBe("commit");
  });

  it("adds a fixed exit block, its notes reported separately from byNote", () => {
    const { byNote, exitNotes } = menuCells(items);
    expect(exitNotes.size).toBeGreaterThan(0);
    for (const note of exitNotes) {
      expect(byNote.has(note)).toBe(false);
    }
  });

  it("uses DEFAULT_EXIT_ITEM's block when no override is given", () => {
    const { exitNotes } = menuCells(items);
    const expected = new Set<number>();
    const span = DEFAULT_EXIT_ITEM.colSpan ?? 1;
    const rowSpan = DEFAULT_EXIT_ITEM.rowSpan ?? 1;
    for (let c = DEFAULT_EXIT_ITEM.col; c < DEFAULT_EXIT_ITEM.col + span; c++) {
      for (let r = DEFAULT_EXIT_ITEM.row; r < DEFAULT_EXIT_ITEM.row + rowSpan; r++) {
        expected.add(r * 10 + c);
      }
    }
    expect(exitNotes).toEqual(expected);
  });

  it("respects a custom exit item position", () => {
    const { exitNotes } = menuCells(items, { col: 4, row: 8, colSpan: 1, rowSpan: 1 });
    expect(exitNotes).toEqual(new Set([84]));
  });

  it("lights the exit block in flash mode so it reads as distinct from the menu items", () => {
    const { cells } = menuCells(items);
    const exitCells = cells.filter((c) => c.color === DEFAULT_EXIT_ITEM.color);
    expect(exitCells.length).toBeGreaterThan(0);
    expect(exitCells.every((c) => c.mode === "flash")).toBe(true);
  });
});

describe("DEFAULT_MENU_ITEMS", () => {
  it("has unique labels", () => {
    const labels = DEFAULT_MENU_ITEMS.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("stays within the 1-8 grid", () => {
    for (const item of DEFAULT_MENU_ITEMS) {
      expect(item.col).toBeGreaterThanOrEqual(1);
      expect(item.col).toBeLessThanOrEqual(8);
      expect(item.row).toBeGreaterThanOrEqual(1);
      expect(item.row).toBeLessThanOrEqual(8);
    }
  });

  it("doesn't collide with DEFAULT_EXIT_ITEM's block", () => {
    const { byNote, exitNotes } = menuCells(DEFAULT_MENU_ITEMS);
    for (const note of exitNotes) {
      expect(byNote.has(note)).toBe(false);
    }
  });

  it("gives every item a non-empty label and text", () => {
    for (const item of DEFAULT_MENU_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.text.length).toBeGreaterThan(0);
    }
  });
});

describe("classifyMenuNote", () => {
  const items = [{ label: "seguir", text: "seguí", col: 1, row: 1, color: "green" }];
  const { byNote, exitNotes } = menuCells(items);

  it("classifies an item's pad as 'item'", () => {
    expect(classifyMenuNote(11, byNote, exitNotes)).toBe("item");
  });

  it("classifies the exit block's pad as 'exit'", () => {
    const [exitNote] = exitNotes;
    expect(classifyMenuNote(exitNote!, byNote, exitNotes)).toBe("exit");
  });

  it("classifies any other pad as 'unhandled'", () => {
    expect(classifyMenuNote(55, byNote, exitNotes)).toBe("unhandled");
  });
});
