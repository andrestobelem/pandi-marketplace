import { describe, expect, it } from "vitest";
import { resolveEvent } from "../src/hooks.ts";

describe("resolveEvent", () => {
  it("maps done to a static green grid", () => {
    expect(resolveEvent("done")).toEqual({ color: "green", mode: "static" });
  });

  it("maps attention to a pulsing red grid", () => {
    expect(resolveEvent("attention")).toEqual({ color: "red", mode: "pulse" });
  });

  it("falls back to a flashing white grid for unknown kinds", () => {
    expect(resolveEvent("whatever")).toEqual({ color: "white", mode: "flash" });
  });
});
