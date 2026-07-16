import type { Cell } from "./protocol.ts";

// 8x8 fixed icon patterns, each row top-to-bottom, '#' = lit, '.' = blank.
const ICON_ROWS: Record<string, string[]> = {
  check: [
    "........",
    "........",
    ".......#",
    "......#.",
    "#....#..",
    ".#..#...",
    "..##....",
    "........",
  ],
  x: [
    "#......#",
    ".#....#.",
    "..#..#..",
    "...##...",
    "...##...",
    "..#..#..",
    ".#....#.",
    "#......#",
  ],
  hourglass: [
    "########",
    ".######.",
    "..####..",
    "...##...",
    "...##...",
    "..####..",
    ".######.",
    "########",
  ],
  "arrow-up": [
    "...##...",
    "..####..",
    ".######.",
    "...##...",
    "...##...",
    "...##...",
    "...##...",
    "...##...",
  ],
  "arrow-down": [
    "...##...",
    "...##...",
    "...##...",
    "...##...",
    "...##...",
    ".######.",
    "..####..",
    "...##...",
  ],
};

export const ICON_NAMES = Object.keys(ICON_ROWS);

const ICON_SIZE = 8;

/** All 64 cells of an 8x8 icon pattern, `color` where lit and 'off' elsewhere
 * (same bottom-to-top row convention as glyphColumns/textFrameCells). */
export function iconCells(name: string, color: string): Cell[] {
  const rows = ICON_ROWS[name];
  if (!rows) {
    throw new Error(`Unknown icon ${JSON.stringify(name)}. Available: ${ICON_NAMES.join(", ")}`);
  }
  const cells: Cell[] = [];
  for (let col = 1; col <= ICON_SIZE; col++) {
    for (let row = 1; row <= ICON_SIZE; row++) {
      const lit = rows[ICON_SIZE - row]![col - 1] === "#";
      cells.push({ col, row, color: lit ? color : "off", mode: "static" });
    }
  }
  return cells;
}
