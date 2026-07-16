import { type Cell, type Mode, padNote, rectCells } from "./protocol.ts";

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

export type DoneOption = { col: number; row: number; color?: string; colSpan?: number; rowSpan?: number };

/** Upper-right 2x2 block: clear of row 8 (countdown bar) and rows 1-2 (where
 * ask/confirm's options usually sit). */
export const DEFAULT_DONE_OPTION: DoneOption = { col: 7, row: 6, color: "white", colSpan: 2, rowSpan: 2 };

/** optionCells variant for multi-select: each option's block pulses once
 * selected (vs static otherwise), plus a fixed "done" block to confirm the
 * current selection - its notes are returned separately in `doneNotes` so
 * the caller can tell a toggle from a "confirm and exit". */
export function multiSelectCells(
  options: readonly Option[],
  selected: ReadonlySet<string>,
  doneOption: DoneOption = DEFAULT_DONE_OPTION,
): { cells: Cell[]; byNote: Map<number, string>; doneNotes: Set<number> } {
  const byNote = new Map<number, string>();
  const cells: Cell[] = [];
  for (const opt of options) {
    const mode: Mode = selected.has(opt.label) ? "pulse" : "static";
    for (const { col, row } of rectCells(opt.col, opt.row, opt.colSpan ?? 2, opt.rowSpan ?? 2)) {
      byNote.set(padNote(col, row), opt.label);
      cells.push({ col, row, color: opt.color, mode });
    }
  }
  const doneNotes = new Set<number>();
  for (const { col, row } of rectCells(doneOption.col, doneOption.row, doneOption.colSpan ?? 1, doneOption.rowSpan ?? 1)) {
    doneNotes.add(padNote(col, row));
    cells.push({ col, row, color: doneOption.color ?? "white", mode: "flash" });
  }
  return { cells, byNote, doneNotes };
}

/** Fixed yes/no layout: green 2x2 bottom-left, red 2x2 bottom-right - the pattern
 * used by hand throughout everyday confirm-style questions. */
export function confirmOptions(yesLabel: string = "si", noLabel: string = "no"): Option[] {
  return [
    { label: yesLabel, col: 1, row: 1, color: "green" },
    { label: noLabel, col: 6, row: 1, color: "red" },
  ];
}

/** Color for the countdown bar: `urgentColor` once `remainingMs` drops to (or
 * below) `urgentMs`, `normalColor` otherwise. */
export function countdownColor(
  remainingMs: number,
  urgentMs: number = 3000,
  normalColor: string = "white",
  urgentColor: string = "red",
): string {
  return remainingMs <= urgentMs ? urgentColor : normalColor;
}
