import { describe, expect, it } from "vitest";
import { glyphColumns, textColumns } from "../src/font.ts";

describe("glyphColumns", () => {
  it("renders 'A' as a symmetric 5x7 glyph (columns bottom-to-top)", () => {
    // Hand-transposed from the reference glyph (top-to-bottom):
    //   .###.
    //   #...#
    //   #...#
    //   #####
    //   #...#
    //   #...#
    //   #...#
    const columns = glyphColumns("A");
    expect(columns).toEqual([
      [true, true, true, true, true, true, false],
      [false, false, false, true, false, false, true],
      [false, false, false, true, false, false, true],
      [false, false, false, true, false, false, true],
      [true, true, true, true, true, true, false],
    ]);
  });

  it("renders space as 5 blank columns", () => {
    const columns = glyphColumns(" ");
    expect(columns).toHaveLength(5);
    expect(columns.every((col) => col.every((on) => on === false))).toBe(true);
  });

  it.each(["$", "@"])("rejects unsupported character %s", (char) => {
    expect(() => glyphColumns(char)).toThrow();
  });

  it("is case-insensitive", () => {
    expect(glyphColumns("a")).toEqual(glyphColumns("A"));
  });

  it("renders 'Ñ' as an N with a wavy tilde row on top", () => {
    // Hand-transposed from the reference glyph (top-to-bottom):
    //   .#.#.
    //   #...#
    //   ##..#
    //   #.#.#
    //   #..##
    //   #...#
    //   #...#
    const columns = glyphColumns("Ñ");
    expect(columns).toEqual([
      [true, true, true, true, true, true, false],
      [false, false, false, false, true, false, true],
      [false, false, false, true, false, false, false],
      [false, false, true, false, false, false, true],
      [true, true, true, true, true, true, false],
    ]);
  });

  it("renders 'Á' as an A with an acute accent dot on top", () => {
    // Hand-transposed from the reference glyph (top-to-bottom):
    //   ..#..
    //   .###.
    //   #...#
    //   #####
    //   #...#
    //   #...#
    //   #...#
    const columns = glyphColumns("Á");
    expect(columns).toEqual([
      [true, true, true, true, true, false, false],
      [false, false, false, true, false, true, false],
      [false, false, false, true, false, true, true],
      [false, false, false, true, false, true, false],
      [true, true, true, true, true, false, false],
    ]);
  });

  it("is case-insensitive for accented characters", () => {
    expect(glyphColumns("ñ")).toEqual(glyphColumns("Ñ"));
    expect(glyphColumns("á")).toEqual(glyphColumns("Á"));
  });
});

describe("textColumns", () => {
  it("returns just the glyph for a single character (no trailing spacer)", () => {
    expect(textColumns("A")).toEqual(glyphColumns("A"));
  });

  it("inserts one blank spacer column between characters", () => {
    const columns = textColumns("AA");
    const blank = Array(7).fill(false);
    expect(columns).toHaveLength(5 + 1 + 5);
    expect(columns.slice(0, 5)).toEqual(glyphColumns("A"));
    expect(columns[5]).toEqual(blank);
    expect(columns.slice(6, 11)).toEqual(glyphColumns("A"));
  });
});
