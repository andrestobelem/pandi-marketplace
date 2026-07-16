import { describe, expect, it } from "vitest";
import { ICON_NAMES, iconCells } from "../src/icons.ts";

function litCoords(name: string, color: string = "red"): Set<string> {
  return new Set(iconCells(name, color).filter((c) => c.color === color).map((c) => `${c.col},${c.row}`));
}

describe("iconCells", () => {
  it("covers all 64 pads for every icon", () => {
    for (const name of ICON_NAMES) {
      expect(iconCells(name, "red")).toHaveLength(64);
    }
  });

  it("uses only the given color or 'off', all static mode", () => {
    const cells = iconCells("check", "red");
    expect(cells.every((c) => (c.color === "red" || c.color === "off") && c.mode === "static")).toBe(true);
  });

  it("rejects an unknown icon name", () => {
    expect(() => iconCells("sparkle", "red")).toThrow();
  });

  it("renders 'check' as a checkmark: short left arm, long right arm, meeting near the bottom", () => {
    const lit = litCoords("check");
    // Right arm: top-right corner down to the bottom-middle.
    expect(lit.has("8,6")).toBe(true);
    expect(lit.has("5,3")).toBe(true);
    // Left arm: bottom-left up toward the meeting point.
    expect(lit.has("1,4")).toBe(true);
    // Top-left area stays blank (no stroke there).
    expect(lit.has("1,8")).toBe(false);
  });

  it("renders 'x' as a symmetric X touching all four corners", () => {
    const lit = litCoords("x");
    expect(lit.has("1,1")).toBe(true);
    expect(lit.has("8,1")).toBe(true);
    expect(lit.has("1,8")).toBe(true);
    expect(lit.has("8,8")).toBe(true);
    // Center columns lit on the middle two rows.
    expect(lit.has("4,4")).toBe(true);
    expect(lit.has("5,5")).toBe(true);
  });

  it("renders 'hourglass' as symmetric top/bottom bars narrowing to a middle waist", () => {
    const cells = iconCells("hourglass", "red");
    const topRow = cells.filter((c) => c.row === 8);
    const bottomRow = cells.filter((c) => c.row === 1);
    const middleRows = cells.filter((c) => c.row === 4 || c.row === 5);
    expect(topRow.every((c) => c.color === "red")).toBe(true);
    expect(bottomRow.every((c) => c.color === "red")).toBe(true);
    expect(middleRows.filter((c) => c.color === "red")).toHaveLength(4); // 2 lit cols x 2 rows
  });

  it.each(["arrow-up", "arrow-down"])("renders '%s' as a vertical shaft with an arrowhead", (name) => {
    const cells = iconCells(name, "red");
    const shaftRows = cells.filter((c) => c.col === 4 || c.col === 5);
    expect(shaftRows.every((c) => c.color === "red")).toBe(true);
  });

  it("arrow-up points up: widest row is near the top", () => {
    const cells = iconCells("arrow-up", "red");
    const litByRow = new Map<number, number>();
    for (const c of cells) if (c.color === "red") litByRow.set(c.row, (litByRow.get(c.row) ?? 0) + 1);
    const widestRow = [...litByRow.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(widestRow).toBeGreaterThanOrEqual(6);
  });

  it("arrow-down points down: widest row is near the bottom", () => {
    const cells = iconCells("arrow-down", "red");
    const litByRow = new Map<number, number>();
    for (const c of cells) if (c.color === "red") litByRow.set(c.row, (litByRow.get(c.row) ?? 0) + 1);
    const widestRow = [...litByRow.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(widestRow).toBeLessThanOrEqual(3);
  });
});
