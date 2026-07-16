import { describe, expect, it } from "vitest";
import {
  COLORS,
  colourSpec,
  columnCells,
  FLASH,
  fullGridCells,
  ledSysex,
  noteToCoord,
  padNote,
  parseColor,
  progressBarCells,
  PULSE,
  rainbowCells,
  rectCells,
  RGB,
  textFrameCells,
  timerBarCells,
} from "../src/protocol.ts";

describe("padNote", () => {
  it("maps the four corners", () => {
    expect(padNote(1, 1)).toBe(11);
    expect(padNote(8, 1)).toBe(18);
    expect(padNote(1, 8)).toBe(81);
    expect(padNote(8, 8)).toBe(88);
  });

  it.each([
    [0, 1],
    [9, 1],
    [1, 0],
    [1, 9],
  ])("rejects out-of-range col=%d row=%d", (col, row) => {
    expect(() => padNote(col, row)).toThrow();
  });
});

describe("noteToCoord", () => {
  it("round-trips every pad through padNote", () => {
    for (let col = 1; col <= 8; col++) {
      for (let row = 1; row <= 8; row++) {
        expect(noteToCoord(padNote(col, row))).toEqual({ col, row });
      }
    }
  });
});

describe("parseColor", () => {
  it("returns the COLORS entry for a named colour", () => {
    expect(parseColor("red", "static")).toEqual(COLORS.red);
  });

  it.each([
    ["#ff0000", [127, 0, 0]],
    ["#00ff00", [0, 127, 0]],
    ["#0000ff", [0, 0, 127]],
    ["#ffffff", [127, 127, 127]],
    ["#000000", [0, 0, 0]],
  ] as const)("scales hex %s to 0-127 rgb", (hex, expectedRgb) => {
    expect(parseColor(hex, "static").rgb).toEqual(expectedRgb);
  });

  it.each(["flash", "pulse"] as const)("rejects hex colours for mode=%s", (mode) => {
    expect(() => parseColor("#ff0000", mode)).toThrow();
  });

  it("rejects malformed hex", () => {
    expect(() => parseColor("#fff", "static")).toThrow();
  });

  it("rejects unknown colour names", () => {
    expect(() => parseColor("chartreuse", "static")).toThrow();
  });
});

describe("colourSpec", () => {
  it("static uses exact rgb", () => {
    const [lightingType, index, payload] = colourSpec(1, 1, "red", "static");
    expect(lightingType).toBe(RGB);
    expect(index).toBe(11);
    expect(payload).toEqual(COLORS.red.rgb);
  });

  it("flash uses a palette pair", () => {
    const [lightingType, index, payload] = colourSpec(8, 8, "green", "flash");
    expect(lightingType).toBe(FLASH);
    expect(index).toBe(88);
    expect(payload).toEqual([COLORS.green.palette, 0]);
  });

  it("pulse uses a single palette value", () => {
    const [lightingType, , payload] = colourSpec(1, 1, "blue", "pulse");
    expect(lightingType).toBe(PULSE);
    expect(payload).toEqual([COLORS.blue.palette]);
  });

  it("rejects an unknown mode", () => {
    // @ts-expect-error testing runtime validation of an invalid mode
    expect(() => colourSpec(1, 1, "red", "sparkle")).toThrow();
  });
});

describe("columnCells", () => {
  it("lists all 8 rows of one column", () => {
    const cells = columnCells(3, "red");
    expect(cells).toHaveLength(8);
    for (let row = 1; row <= 8; row++) {
      expect(cells[row - 1]).toEqual({ col: 3, row, color: "red", mode: "static" });
    }
  });
});

describe("progressBarCells", () => {
  it("covers all 64 pads", () => {
    expect(progressBarCells(50, "red")).toHaveLength(64);
  });

  it("is all off at 0%", () => {
    expect(progressBarCells(0, "red").every((c) => c.color === "off")).toBe(true);
  });

  it("is all filled at 100%", () => {
    expect(progressBarCells(100, "red").every((c) => c.color === "red")).toBe(true);
  });

  it("fills exactly half at 50%", () => {
    expect(progressBarCells(50, "red").filter((c) => c.color === "red")).toHaveLength(32);
  });

  it("clamps out-of-range percent", () => {
    expect(progressBarCells(-10, "red")).toEqual(progressBarCells(0, "red"));
    expect(progressBarCells(150, "red")).toEqual(progressBarCells(100, "red"));
  });
});

describe("fullGridCells", () => {
  it("covers every pad once with the given color and mode", () => {
    const cells = fullGridCells("blue", "pulse");
    expect(cells).toHaveLength(64);
    const coords = new Set(cells.map((c) => `${c.col},${c.row}`));
    expect(coords.size).toBe(64);
    expect(cells.every((c) => c.color === "blue" && c.mode === "pulse")).toBe(true);
  });

  it("defaults to static mode", () => {
    expect(fullGridCells("red").every((c) => c.mode === "static")).toBe(true);
  });
});

describe("rainbowCells", () => {
  it("colors each column from the palette in order", () => {
    const cells = rainbowCells(0, ["red", "green", "blue"]);
    const byCol = new Map(cells.map((c) => [c.col, c.color]));
    expect(byCol.get(1)).toBe("red");
    expect(byCol.get(2)).toBe("green");
    expect(byCol.get(3)).toBe("blue");
    expect(byCol.get(4)).toBe("red"); // wraps around the 3-colour palette
  });

  it("rotates which colour starts at column 1 via offset", () => {
    const cells = rainbowCells(1, ["red", "green", "blue"]);
    const byCol = new Map(cells.map((c) => [c.col, c.color]));
    expect(byCol.get(1)).toBe("green");
    expect(byCol.get(2)).toBe("blue");
    expect(byCol.get(3)).toBe("red");
  });

  it("covers all 64 pads", () => {
    expect(rainbowCells()).toHaveLength(64);
  });

  it("keeps the same colour across all rows of a column", () => {
    const cells = rainbowCells(0, ["red", "green", "blue"]);
    for (let col = 1; col <= 8; col++) {
      const colorsInCol = new Set(cells.filter((c) => c.col === col).map((c) => c.color));
      expect(colorsInCol.size).toBe(1);
    }
  });
});

describe("rectCells", () => {
  it("lists every pad in a colSpan x rowSpan block anchored at (col,row)", () => {
    const cells = rectCells(2, 2, 2, 2);
    expect(new Set(cells)).toEqual(
      new Set([
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 2, row: 3 },
        { col: 3, row: 3 },
      ]),
    );
  });

  it("defaults to a single pad", () => {
    expect(rectCells(4, 4)).toEqual([{ col: 4, row: 4 }]);
  });

  it("clamps the block to the 8x8 board", () => {
    const cells = rectCells(8, 8, 2, 2);
    expect(cells).toEqual([{ col: 8, row: 8 }]);
  });
});

describe("textFrameCells", () => {
  const onBottomRowOnly: boolean[][] = [[true, false, false, false, false, false, false]];

  it("always returns the full 64-pad grid", () => {
    expect(textFrameCells(onBottomRowOnly, 0, "red")).toHaveLength(64);
  });

  it("row 8 is always off, regardless of the glyph data", () => {
    const allOn: boolean[][] = [[true, true, true, true, true, true, true]];
    const cells = textFrameCells(allOn, 0, "red");
    expect(cells.filter((c) => c.row === 8).every((c) => c.color === "off")).toBe(true);
  });

  it("maps a column's bits onto rows 1-7 of the matching device column, at offset 0", () => {
    const cells = textFrameCells(onBottomRowOnly, 0, "red");
    const byCoord = new Map(cells.map((c) => [`${c.col},${c.row}`, c.color]));
    expect(byCoord.get("1,1")).toBe("red");
    for (let row = 2; row <= 8; row++) {
      expect(byCoord.get(`1,${row}`)).toBe("off");
    }
    for (let col = 2; col <= 8; col++) {
      expect(byCoord.get(`${col},1`)).toBe("off");
    }
  });

  it("shifts the pattern by offset, leaving out-of-range device columns blank", () => {
    const cells = textFrameCells(onBottomRowOnly, -1, "red");
    const byCoord = new Map(cells.map((c) => [`${c.col},${c.row}`, c.color]));
    expect(byCoord.get("1,1")).toBe("off");
    expect(byCoord.get("2,1")).toBe("red");
  });

  it("accepts a per-column color array instead of a single color", () => {
    const twoCols: boolean[][] = [
      [true, false, false, false, false, false, false],
      [true, false, false, false, false, false, false],
    ];
    const cells = textFrameCells(twoCols, 0, ["red", "blue"]);
    const byCoord = new Map(cells.map((c) => [`${c.col},${c.row}`, c.color]));
    expect(byCoord.get("1,1")).toBe("red");
    expect(byCoord.get("2,1")).toBe("blue");
  });
});

describe("timerBarCells", () => {
  it("returns all 8 pads of row 8, cols 1-8", () => {
    const cells = timerBarCells(1, "white");
    expect(cells).toHaveLength(8);
    expect(cells.every((c) => c.row === 8)).toBe(true);
    expect(new Set(cells.map((c) => c.col))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it("lights all 8 at fraction 1", () => {
    expect(timerBarCells(1, "white").filter((c) => c.color === "white")).toHaveLength(8);
  });

  it("lights none at fraction 0", () => {
    expect(timerBarCells(0, "white").every((c) => c.color === "off")).toBe(true);
  });

  it("lights proportionally at fraction 0.5", () => {
    expect(timerBarCells(0.5, "white").filter((c) => c.color === "white")).toHaveLength(4);
  });

  it("fills from column 1 upward", () => {
    const byCol = new Map(timerBarCells(0.5, "white").map((c) => [c.col, c.color]));
    expect(byCol.get(1)).toBe("white");
    expect(byCol.get(4)).toBe("white");
    expect(byCol.get(5)).toBe("off");
    expect(byCol.get(8)).toBe("off");
  });

  it("clamps out-of-range fractions", () => {
    expect(timerBarCells(-1, "white")).toEqual(timerBarCells(0, "white"));
    expect(timerBarCells(2, "white")).toEqual(timerBarCells(1, "white"));
  });
});

describe("ledSysex", () => {
  it("batches all specs into one F0..F7 message", () => {
    const specs = [colourSpec(1, 1, "red", "static"), colourSpec(2, 1, "green", "pulse")];
    const bytes = ledSysex(specs);
    expect(bytes[0]).toBe(0xf0);
    expect(bytes[bytes.length - 1]).toBe(0xf7);
    // F0/F7(2) + header(5) + command(1) + spec1(2+3) + spec2(2+1)
    expect(bytes.length).toBe(2 + 5 + 1 + 5 + 3);
  });
});
