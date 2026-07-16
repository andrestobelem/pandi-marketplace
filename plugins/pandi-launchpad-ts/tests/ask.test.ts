import { describe, expect, it } from "vitest";
import { confirmOptions, optionCells } from "../src/ask.ts";

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
