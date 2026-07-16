// Novation Launchpad X SysEx header. Source: Launchpad X Programmer's Reference Manual.
export const SYSEX_HEADER = [0x00, 0x20, 0x29, 0x02, 0x0c] as const;

export const FLASH = 1;
export const PULSE = 2;
export const RGB = 3;

export type Mode = "static" | "flash" | "pulse";

export type ColorEntry = { rgb: [number, number, number]; palette: number };

// name -> exact RGB (used for "static" pads) and nearest palette index
// (used for "flash"/"pulse", which the device only accepts as palette entries).
// Palette indices for red/green/blue are taken directly from the manual's own
// examples; the rest are eyeballed off the palette chart and safe to retune.
export const COLORS: Record<string, ColorEntry> = {
  off: { rgb: [0, 0, 0], palette: 0 },
  red: { rgb: [127, 0, 0], palette: 5 },
  green: { rgb: [0, 127, 0], palette: 19 },
  blue: { rgb: [0, 0, 127], palette: 45 },
  yellow: { rgb: [127, 127, 0], palette: 13 },
  white: { rgb: [127, 127, 127], palette: 3 },
  orange: { rgb: [127, 55, 0], palette: 9 },
  purple: { rgb: [90, 0, 127], palette: 49 },
  cyan: { rgb: [0, 127, 127], palette: 37 },
  pink: { rgb: [127, 0, 70], palette: 57 },
  lime: { rgb: [90, 127, 0], palette: 21 },
  teal: { rgb: [0, 90, 90], palette: 33 },
  gold: { rgb: [127, 90, 0], palette: 61 },
  indigo: { rgb: [45, 0, 127], palette: 50 },
  brown: { rgb: [70, 40, 10], palette: 65 },
  gray: { rgb: [60, 60, 60], palette: 1 },
  dark_red: { rgb: [50, 0, 0], palette: 7 },
  dark_green: { rgb: [0, 50, 0], palette: 23 },
  dark_blue: { rgb: [0, 0, 50], palette: 47 },
  magenta: { rgb: [127, 0, 127], palette: 53 },
};

function hexToRgb127(hex: string): [number, number, number] {
  const digits = hex.replace(/^#/, "");
  if (digits.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(digits)) {
    throw new Error(`Hex colour must be '#rrggbb', got ${JSON.stringify(hex)}`);
  }
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  return [r, g, b].map((v) => Math.round((v * 127) / 255)) as [number, number, number];
}

export function parseColor(color: string, mode: Mode = "static"): ColorEntry {
  if (color in COLORS) {
    return COLORS[color]!;
  }
  if (color.startsWith("#")) {
    if (mode !== "static") {
      throw new Error(
        `Custom hex colours only work with mode='static' (got mode=${JSON.stringify(mode)}); ` +
          "use a named colour for 'flash'/'pulse'.",
      );
    }
    return { rgb: hexToRgb127(color), palette: 0 };
  }
  throw new Error(`Unknown colour ${JSON.stringify(color)}. Available: ${Object.keys(COLORS).sort().join(", ")}, or '#rrggbb'`);
}

export function padNote(col: number, row: number): number {
  if (!(col >= 1 && col <= 8 && row >= 1 && row <= 8)) {
    throw new Error(`col/row must be 1-8, got col=${col} row=${row}`);
  }
  return row * 10 + col;
}

export function noteToCoord(note: number): { col: number; row: number } {
  const row = Math.floor(note / 10);
  const col = note % 10;
  return { col, row };
}

export type ColourSpec = [number, number, readonly number[]];

export function colourSpec(col: number, row: number, color: string, mode: Mode = "static"): ColourSpec {
  const index = padNote(col, row);
  if (mode !== "static" && mode !== "flash" && mode !== "pulse") {
    throw new Error(`mode must be 'static', 'flash' or 'pulse', got ${JSON.stringify(mode)}`);
  }
  const c = parseColor(color, mode);
  if (mode === "static") {
    return [RGB, index, c.rgb];
  }
  if (mode === "flash") {
    // Lighting data is (Colour B, Colour A) palette indices; flashes between them.
    return [FLASH, index, [c.palette, 0]];
  }
  return [PULSE, index, [c.palette]];
}

export type Cell = { col: number; row: number; color: string; mode: Mode };

export function columnCells(col: number, color: string, mode: Mode = "static"): Cell[] {
  return Array.from({ length: 8 }, (_, i) => ({ col, row: i + 1, color, mode }));
}

/** All 64 (col, row) pairs of the grid, column-major, with `colorAt` picking each
 * cell's color from its column/row/1-based-position - shared by every "whole grid"
 * cell builder below. */
function gridCells(mode: Mode, colorAt: (col: number, row: number, n: number) => string): Cell[] {
  const cells: Cell[] = [];
  let n = 0;
  for (let col = 1; col <= 8; col++) {
    for (let row = 1; row <= 8; row++) {
      n++;
      cells.push({ col, row, color: colorAt(col, row, n), mode });
    }
  }
  return cells;
}

export function progressBarCells(percent: number, color: string = "green"): Cell[] {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * 64);
  return gridCells("static", (_col, _row, n) => (n <= filled ? color : "off"));
}

export function fullGridCells(color: string, mode: Mode = "static"): Cell[] {
  return gridCells(mode, () => color);
}

export const RAINBOW_PALETTE = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "magenta"];

export function rainbowCells(offset: number = 0, palette: readonly string[] = RAINBOW_PALETTE): Cell[] {
  return gridCells("static", (col) => palette[(col - 1 + offset) % palette.length]!);
}

export function rectCells(
  col: number,
  row: number,
  colSpan: number = 1,
  rowSpan: number = 1,
): { col: number; row: number }[] {
  const cells: { col: number; row: number }[] = [];
  for (let c = col; c < col + colSpan && c <= 8; c++) {
    for (let r = row; r < row + rowSpan && r <= 8; r++) {
      cells.push({ col: c, row: r });
    }
  }
  return cells;
}

/** Windows 8 consecutive columns (starting at `offset`, which may run negative
 * or past the end) from a textColumns()-style column matrix onto the 8x8 grid.
 * Row 8 is always blank (the 5x7 font only fills rows 1-7); columns outside
 * the matrix's range are blank too - this is how the text scrolls on/off screen. */
export function textFrameCells(columns: readonly boolean[][], offset: number, color: string): Cell[] {
  return gridCells("static", (col, row) => {
    if (row === 8) return "off";
    const glyphCol = columns[offset + col - 1];
    return glyphCol?.[row - 1] ? color : "off";
  });
}

export function ledSysex(specs: readonly ColourSpec[]): number[] {
  const data: number[] = [0xf0, ...SYSEX_HEADER, 0x03];
  for (const [lightingType, index, payload] of specs) {
    data.push(lightingType, index, ...payload);
  }
  data.push(0xf7);
  return data;
}
