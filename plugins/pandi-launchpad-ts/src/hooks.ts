import type { Mode } from "./protocol.ts";

const EVENTS: Record<string, { color: string; mode: Mode }> = {
  done: { color: "green", mode: "static" },
  attention: { color: "red", mode: "pulse" },
};

export function resolveEvent(kind: string): { color: string; mode: Mode } {
  return EVENTS[kind] ?? { color: "white", mode: "flash" };
}
