import { describe, expect, it } from "vitest";
import { confirmOptions, countdownColor, DEFAULT_DONE_OPTION, multiSelectCells, optionCells } from "../src/ask.ts";

describe("optionCells", () => {
  it("builds one cell per pad in each option's block, keyed by pad note", () => {
    const { cells, byNote } = optionCells([{ label: "si", col: 1, row: 1, color: "green" }]);
    expect(cells).toEqual([
      { col: 1, row: 1, color: "green", mode: "static" },
      { col: 1, row: 2, color: "green", mode: "static" },
      { col: 2, row: 1, color: "green", mode: "static" },
      { col: 2, row: 2, color: "green", mode: "static" },
    ]);
    expect(byNote.get(11)).toBe("si");
    expect(byNote.get(21)).toBe("si");
    expect(byNote.get(12)).toBe("si");
    expect(byNote.get(22)).toBe("si");
  });

  it("defaults each option's block to 2x2", () => {
    const { cells } = optionCells([{ label: "si", col: 1, row: 1, color: "green" }]);
    expect(cells).toHaveLength(4);
  });

  it("respects an explicit colSpan/rowSpan", () => {
    const { cells } = optionCells([{ label: "si", col: 1, row: 1, color: "green", colSpan: 1, rowSpan: 1 }]);
    expect(cells).toEqual([{ col: 1, row: 1, color: "green", mode: "static" }]);
  });

  it("keeps separate options' pads distinct in byNote", () => {
    const { byNote } = optionCells([
      { label: "si", col: 1, row: 1, color: "green" },
      { label: "no", col: 6, row: 1, color: "red" },
    ]);
    expect(byNote.get(11)).toBe("si");
    expect(byNote.get(16)).toBe("no");
  });
});

describe("confirmOptions", () => {
  it("defaults to green 'si' at (1,1) and red 'no' at (6,1)", () => {
    expect(confirmOptions()).toEqual([
      { label: "si", col: 1, row: 1, color: "green" },
      { label: "no", col: 6, row: 1, color: "red" },
    ]);
  });

  it("uses custom labels while keeping the fixed layout/colors", () => {
    expect(confirmOptions("dale", "paso")).toEqual([
      { label: "dale", col: 1, row: 1, color: "green" },
      { label: "paso", col: 6, row: 1, color: "red" },
    ]);
  });
});

describe("multiSelectCells", () => {
  const options = [
    { label: "a", col: 1, row: 1, color: "green" },
    { label: "b", col: 6, row: 1, color: "red" },
  ];

  it("lights unselected options in static mode", () => {
    const { cells } = multiSelectCells(options, new Set());
    const optionCellsOnly = cells.filter((c) => c.color === "green" || c.color === "red");
    expect(optionCellsOnly.length).toBeGreaterThan(0);
    expect(optionCellsOnly.every((c) => c.mode === "static")).toBe(true);
  });

  it("lights selected options in pulse mode, leaving others static", () => {
    const { cells } = multiSelectCells(options, new Set(["a"]));
    const aCells = cells.filter((c) => c.color === "green");
    const bCells = cells.filter((c) => c.color === "red");
    expect(aCells.every((c) => c.mode === "pulse")).toBe(true);
    expect(bCells.every((c) => c.mode === "static")).toBe(true);
  });

  it("maps each option's pads to its label in byNote, same as optionCells", () => {
    const { byNote } = multiSelectCells(options, new Set());
    expect(byNote.get(11)).toBe("a");
    expect(byNote.get(16)).toBe("b");
  });

  it("adds a fixed 'done' block outside row 8 (reserved for the countdown bar) and rows 1-2 (typical options)", () => {
    const { doneNotes } = multiSelectCells(options, new Set());
    expect(doneNotes.size).toBeGreaterThan(0);
    for (const note of doneNotes) {
      const row = Math.floor(note / 10);
      expect(row).not.toBe(8);
      expect(row).not.toBe(1);
      expect(row).not.toBe(2);
    }
  });

  it("uses DEFAULT_DONE_OPTION's block when no override is given", () => {
    const { doneNotes } = multiSelectCells(options, new Set());
    const expected = new Set<number>();
    const span = DEFAULT_DONE_OPTION.colSpan ?? 1;
    const rowSpan = DEFAULT_DONE_OPTION.rowSpan ?? 1;
    for (let c = DEFAULT_DONE_OPTION.col; c < DEFAULT_DONE_OPTION.col + span; c++) {
      for (let r = DEFAULT_DONE_OPTION.row; r < DEFAULT_DONE_OPTION.row + rowSpan; r++) {
        expected.add(r * 10 + c);
      }
    }
    expect(doneNotes).toEqual(expected);
  });

  it("respects a custom done option position", () => {
    const { doneNotes } = multiSelectCells(options, new Set(), { col: 3, row: 5, colSpan: 1, rowSpan: 1 });
    expect(doneNotes).toEqual(new Set([53]));
  });
});

describe("countdownColor", () => {
  it("uses the normal color above the urgent threshold", () => {
    expect(countdownColor(5000, 3000, "white", "red")).toBe("white");
  });

  it("uses the urgent color at or below the threshold", () => {
    expect(countdownColor(3000, 3000, "white", "red")).toBe("red");
    expect(countdownColor(2999, 3000, "white", "red")).toBe("red");
  });

  it("defaults to a 3s white/red urgent threshold", () => {
    expect(countdownColor(3001)).toBe("white");
    expect(countdownColor(3000)).toBe("red");
  });

  it("respects custom colors", () => {
    expect(countdownColor(1000, 3000, "blue", "yellow")).toBe("yellow");
  });
});
