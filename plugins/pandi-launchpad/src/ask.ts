import { type Cell, padNote, rectCells } from "./protocol.ts";

export type Option = { label: string; col: number; row: number; color: string; colSpan?: number; rowSpan?: number };

/** Cells to light for each option's block, plus a note->label map for reading the press back. */
export function optionCells(options: readonly Option[]): { cells: Cell[]; byNote: Map<number, string> } {
  const byNote = new Map<number, string>();
  const cells: Cell[] = [];
  for (const opt of options) {
    for (const { col, row } of rectCells(opt.col, opt.row, opt.colSpan ?? 2, opt.rowSpan ?? 2)) {
      byNote.set(padNote(col, row), opt.label);
      cells.push({ col, row, color: opt.color, mode: "static" });
    }
  }
  return { cells, byNote };
}

/** Fixed yes/no layout: green 2x2 bottom-left, red 2x2 bottom-right - the pattern
 * used by hand throughout everyday confirm-style questions. */
export function confirmOptions(yesLabel: string = "si", noLabel: string = "no"): Option[] {
  return [
    { label: yesLabel, col: 1, row: 1, color: "green" },
    { label: noLabel, col: 6, row: 1, color: "red" },
  ];
}
