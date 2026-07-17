import { type Cell, padNote, rectCells } from "./protocol.ts";

export type MenuItem = { label: string; text: string; col: number; row: number; color: string; colSpan?: number; rowSpan?: number };

export type ExitItem = { col: number; row: number; color?: string; colSpan?: number; rowSpan?: number };

/** Top-right 2x2 block, clear of the 6x4 area DEFAULT_MENU_ITEMS uses. */
export const DEFAULT_EXIT_ITEM: ExitItem = { col: 7, row: 7, color: "gray", colSpan: 2, rowSpan: 2 };

/** Sensible canned phrases for the standalone `menu` command: pick one with a
 * pad press, its `text` goes to the clipboard so a Claude Code conversation
 * can be started or continued by pasting instead of typing. */
export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  { label: "seguir", text: "seguí con lo que estabas haciendo", col: 1, row: 1, color: "green" },
  { label: "si", text: "sí", col: 3, row: 1, color: "lime" },
  { label: "no", text: "no", col: 5, row: 1, color: "red" },
  { label: "commit", text: "hacé commit de los cambios", col: 1, row: 3, color: "blue" },
  { label: "tests", text: "corré los tests", col: 3, row: 3, color: "yellow" },
  { label: "explicar", text: "explicame qué acabás de hacer", col: 5, row: 3, color: "purple" },
];

/** Cells for a standing menu: each item's block statically lit in its own
 * color, plus a fixed exit block (flash, so it reads as distinct from the
 * items) whose notes come back separately in `exitNotes` - the caller uses
 * that to tell "pick an item" from "close the menu". */
export function menuCells(
  items: readonly MenuItem[],
  exitItem: ExitItem = DEFAULT_EXIT_ITEM,
): { cells: Cell[]; byNote: Map<number, string>; exitNotes: Set<number> } {
  const byNote = new Map<number, string>();
  const cells: Cell[] = [];
  for (const item of items) {
    for (const { col, row } of rectCells(item.col, item.row, item.colSpan ?? 2, item.rowSpan ?? 2)) {
      byNote.set(padNote(col, row), item.label);
      cells.push({ col, row, color: item.color, mode: "static" });
    }
  }
  const exitNotes = new Set<number>();
  for (const { col, row } of rectCells(exitItem.col, exitItem.row, exitItem.colSpan ?? 1, exitItem.rowSpan ?? 1)) {
    exitNotes.add(padNote(col, row));
    cells.push({ col, row, color: exitItem.color ?? "gray", mode: "flash" });
  }
  return { cells, byNote, exitNotes };
}

export type MenuConfig = { items?: MenuItem[]; exitItem?: ExitItem };

/** Fills in defaults for whatever a user-supplied menu config leaves out, so
 * `~/.config/pandi-launchpad/menu.json` can override just the items, just the
 * exit block, or neither, without repeating the other. An empty `items` array
 * (a config that defines no items at all) falls back to the defaults too -
 * an empty menu isn't a useful override. */
export function resolveMenuConfig(config?: MenuConfig): { items: MenuItem[]; exitItem: ExitItem } {
  return {
    items: config?.items && config.items.length > 0 ? config.items : DEFAULT_MENU_ITEMS,
    exitItem: config?.exitItem ?? DEFAULT_EXIT_ITEM,
  };
}

/** What a pressed pad means to the standing menu: pick an item, close the
 * menu, or (any other pad, so every press gets acknowledged even off the
 * defined layout) "unhandled". */
export function classifyMenuNote(
  note: number,
  byNote: ReadonlyMap<number, string>,
  exitNotes: ReadonlySet<number>,
): "item" | "exit" | "unhandled" {
  if (exitNotes.has(note)) return "exit";
  if (byNote.has(note)) return "item";
  return "unhandled";
}
