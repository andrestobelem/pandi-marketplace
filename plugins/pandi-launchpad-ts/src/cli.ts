#!/usr/bin/env node
import { LaunchpadX } from "./device.ts";
import { resolveEvent } from "./hooks.ts";
import { type Cell, type Mode, fullGridCells, noteToCoord, padNote, progressBarCells, rectCells } from "./protocol.ts";

function unwrap(value: string | undefined): string | undefined {
  if (!value || (value.startsWith("${") && value.endsWith("}"))) return undefined;
  return value;
}

type Option = { label: string; col: number; row: number; color: string; colSpan?: number; rowSpan?: number };

const INPUT_COMMANDS = new Set(["ask", "wait-for-press"]);

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const openInput = INPUT_COMMANDS.has(command ?? "");
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
      lp.setPixel(Number(col), Number(row), color!, (mode as Mode) ?? "static");
      return { result: `pad (${col},${row}) set to ${color} (${mode ?? "static"})` };
    }
    case "show": {
      const cells = JSON.parse(args[0]!) as Cell[];
      lp.show(cells.map((c) => ({ ...c, mode: c.mode ?? "static" })));
      return { result: `lit ${cells.length} pad(s)` };
    }
    case "clear": {
      lp.clear();
      return { result: "cleared" };
    }
    case "pulse-all": {
      const color = args[0] ?? "blue";
      lp.show(fullGridCells(color, "pulse"));
      return { result: `pulsing all pads ${color}` };
    }
    case "progress-bar": {
      const [percent, color] = args;
      lp.show(progressBarCells(Number(percent), color ?? "green"));
      return { result: `progress bar at ${percent}% (${color ?? "green"})` };
    }
    case "sweep": {
      const [color, cycles] = args;
      await lp.sweep(color ?? "cyan", cycles ? Number(cycles) : 1);
      return { result: `swept ${color ?? "cyan"} x${cycles ?? 1}` };
    }
    case "blink-all": {
      const [color, times] = args;
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
    case "scroll-text": {
      const [text, color, speedMs] = args;
      await lp.scrollText(text ?? "", color ?? "white", speedMs ? Number(speedMs) : 120);
      return { result: `scrolled ${JSON.stringify(text ?? "")} (${color ?? "white"})` };
    }
    case "ask": {
      const [timeoutSeconds, optionsJson] = args;
      const options = JSON.parse(optionsJson!) as Option[];
      const byNote = new Map<number, string>();
      const cells: Cell[] = [];
      for (const opt of options) {
        for (const { col, row } of rectCells(opt.col, opt.row, opt.colSpan ?? 2, opt.rowSpan ?? 2)) {
          byNote.set(padNote(col, row), opt.label);
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
      const wanted = pads ? new Set(pads.map((p) => padNote(p.col, p.row))) : undefined;
      const note = await lp.pollPress(Number(timeoutSeconds) * 1000, wanted);
      if (note === null) return { timed_out: true };
      return noteToCoord(note);
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
