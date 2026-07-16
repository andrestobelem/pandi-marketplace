#!/usr/bin/env node
import { LaunchpadX } from "./device.ts";
import { resolveEvent } from "./hooks.ts";
import { type Cell, type Mode, fullGridCells, parseColor, progressBarCells, rectCells } from "./protocol.ts";

function unwrap(value: string | undefined): string | undefined {
  if (!value || (value.startsWith("${") && value.endsWith("}"))) return undefined;
  return value;
}

function checkColor(color: string, mode: Mode = "static"): string {
  parseColor(color, mode);
  return color;
}

type Option = { label: string; col: number; row: number; color: string; colSpan?: number; rowSpan?: number };

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const openInput = command === "ask" || command === "wait-for-press";
  const lp = new LaunchpadX({
    outputName: unwrap(process.env.LAUNCHPAD_OUTPUT_PORT),
    inputName: unwrap(process.env.LAUNCHPAD_INPUT_PORT),
    openInput,
  });

  try {
    const result = await dispatch(lp, command, args);
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally {
    lp.close();
  }
}

async function dispatch(lp: LaunchpadX, command: string | undefined, args: string[]): Promise<unknown> {
  switch (command) {
    case "set": {
      const [col, row, color, mode] = args;
      checkColor(color!, (mode as Mode) ?? "static");
      lp.setPixel(Number(col), Number(row), color!, (mode as Mode) ?? "static");
      return { result: `pad (${col},${row}) set to ${color} (${mode ?? "static"})` };
    }
    case "show": {
      const cells = JSON.parse(args[0]!) as Cell[];
      for (const c of cells) checkColor(c.color, c.mode ?? "static");
      lp.show(cells.map((c) => ({ ...c, mode: c.mode ?? "static" })));
      return { result: `lit ${cells.length} pad(s)` };
    }
    case "clear": {
      lp.clear();
      return { result: "cleared" };
    }
    case "pulse-all": {
      const color = args[0] ?? "blue";
      checkColor(color, "pulse");
      lp.show(fullGridCells(color, "pulse"));
      return { result: `pulsing all pads ${color}` };
    }
    case "progress-bar": {
      const [percent, color] = args;
      checkColor(color ?? "green", "static");
      lp.show(progressBarCells(Number(percent), color ?? "green"));
      return { result: `progress bar at ${percent}% (${color ?? "green"})` };
    }
    case "sweep": {
      const [color, cycles] = args;
      checkColor(color ?? "cyan", "static");
      await lp.sweep(color ?? "cyan", cycles ? Number(cycles) : 1);
      return { result: `swept ${color ?? "cyan"} x${cycles ?? 1}` };
    }
    case "blink-all": {
      const [color, times] = args;
      checkColor(color ?? "yellow");
      await lp.blink(color ?? "yellow", times ? Number(times) : 3);
      return { result: `blinked ${color ?? "yellow"} x${times ?? 3}` };
    }
    case "notify": {
      const [kind] = args;
      const { color, mode } = resolveEvent(kind ?? "done");
      lp.show(fullGridCells(color, mode));
      return { result: `notified ${kind ?? "done"} (${color}/${mode})` };
    }
    case "rainbow-sweep": {
      const [cycles] = args;
      await lp.rainbowSweep(cycles ? Number(cycles) : 1);
      return { result: `rainbow swept x${cycles ?? 1}` };
    }
    case "ask": {
      const [timeoutSeconds, optionsJson] = args;
      const options = JSON.parse(optionsJson!) as Option[];
      const byNote = new Map<number, string>();
      const cells: Cell[] = [];
      for (const opt of options) {
        checkColor(opt.color);
        for (const { col, row } of rectCells(opt.col, opt.row, opt.colSpan ?? 2, opt.rowSpan ?? 2)) {
          byNote.set(row * 10 + col, opt.label);
          cells.push({ col, row, color: opt.color, mode: "static" });
        }
      }
      lp.show(cells);
      let pressedNote: number | null;
      try {
        pressedNote = await lp.pollPress(Number(timeoutSeconds) * 1000, new Set(byNote.keys()));
      } finally {
        lp.show(cells.map((c) => ({ ...c, color: "off" })));
      }
      if (pressedNote === null) return { label: null, timed_out: true };
      return { label: byNote.get(pressedNote) ?? null };
    }
    case "wait-for-press": {
      const [timeoutSeconds, padsJson] = args;
      const pads = padsJson ? (JSON.parse(padsJson) as { col: number; row: number }[]) : undefined;
      const wanted = pads ? new Set(pads.map((p) => p.row * 10 + p.col)) : undefined;
      const note = await lp.pollPress(Number(timeoutSeconds) * 1000, wanted);
      if (note === null) return { timed_out: true };
      const col = note % 10;
      const row = Math.floor(note / 10);
      return { col, row };
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
