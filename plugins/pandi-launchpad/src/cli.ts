#!/usr/bin/env node
import { confirmOptions, countdownColor, type DoneOption, flashCells, multiSelectCells, type Option, optionCells, resultIcon } from "./ask.ts";
import { LaunchpadX } from "./device.ts";
import { resolveEvent } from "./hooks.ts";
import { iconCells } from "./icons.ts";
import { type Cell, type Mode, fullGridCells, noteToCoord, padNote, progressBarCells, timerBarCells } from "./protocol.ts";
import { riskyCommandReason } from "./risky-command.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrap(value: string | undefined): string | undefined {
  if (!value || (value.startsWith("${") && value.endsWith("}"))) return undefined;
  return value;
}

const INPUT_COMMANDS = new Set(["ask", "ask-multi", "confirm", "wait-for-press"]);

const COUNTDOWN_TICK_MS = 1000;
const TIMEOUT_FLASH_MS = 400;
const ICON_ECHO_MS = 800;

async function runAsk(lp: LaunchpadX, options: readonly Option[], timeoutSeconds: number): Promise<unknown> {
  const { cells, byNote } = optionCells(options);
  const wantedNotes = new Set(byNote.keys());
  const totalMs = timeoutSeconds * 1000;
  lp.clear();
  lp.show(cells);
  let pressedNote: number | null = null;
  try {
    let elapsedMs = 0;
    while (elapsedMs < totalMs && pressedNote === null) {
      const remainingMs = totalMs - elapsedMs;
      lp.show(timerBarCells(remainingMs / totalMs, countdownColor(remainingMs)));
      const waitMs = Math.min(COUNTDOWN_TICK_MS, remainingMs);
      pressedNote = await lp.pollPress(waitMs, wantedNotes);
      elapsedMs += waitMs;
    }
  } finally {
    if (pressedNote === null) {
      lp.show(flashCells(cells));
      await sleep(TIMEOUT_FLASH_MS);
    }
    lp.show(cells.map((c) => ({ ...c, color: "off" })));
    lp.show(timerBarCells(0));
  }
  if (pressedNote === null) return { label: null, timed_out: true };
  const label = byNote.get(pressedNote) ?? null;
  if (label !== null) {
    const icon = resultIcon(label, options);
    lp.show(iconCells(icon.name, icon.color));
    await sleep(ICON_ECHO_MS);
    lp.show(fullGridCells("off"));
  }
  return { label };
}

/** Like runAsk, but each press toggles that option's selection (redrawn as
 * pulse vs static) instead of resolving immediately; only the "done" block
 * (or a timeout) ends the loop. Returns the labels selected at that point. */
async function runAskMulti(
  lp: LaunchpadX,
  options: readonly Option[],
  timeoutSeconds: number,
  doneOption?: DoneOption,
): Promise<unknown> {
  const selected = new Set<string>();
  const { byNote, doneNotes } = multiSelectCells(options, selected, doneOption);
  const wantedNotes = new Set([...byNote.keys(), ...doneNotes]);
  const totalMs = timeoutSeconds * 1000;
  const redraw = () => lp.show(multiSelectCells(options, selected, doneOption).cells);
  lp.clear();
  redraw();
  let confirmed = false;
  try {
    let elapsedMs = 0;
    while (elapsedMs < totalMs && !confirmed) {
      const remainingMs = totalMs - elapsedMs;
      lp.show(timerBarCells(remainingMs / totalMs, countdownColor(remainingMs)));
      const waitMs = Math.min(COUNTDOWN_TICK_MS, remainingMs);
      const note = await lp.pollPress(waitMs, wantedNotes);
      elapsedMs += waitMs;
      if (note === null) continue;
      if (doneNotes.has(note)) {
        confirmed = true;
        continue;
      }
      const label = byNote.get(note);
      if (!label) continue;
      if (selected.has(label)) selected.delete(label);
      else selected.add(label);
      redraw();
    }
  } finally {
    if (!confirmed) {
      lp.show(flashCells(multiSelectCells(options, selected, doneOption).cells));
      await sleep(TIMEOUT_FLASH_MS);
    }
    lp.show(fullGridCells("off"));
    lp.show(timerBarCells(0));
  }
  if (confirmed) {
    lp.show(iconCells("check", "green"));
    await sleep(ICON_ECHO_MS);
    lp.show(fullGridCells("off"));
  }
  return confirmed ? { labels: [...selected] } : { labels: [...selected], timed_out: true };
}

type PermissionDecision = "allow" | "deny" | "ask";

function hookDecision(decision: PermissionDecision, reason?: string): unknown {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      ...(reason ? { permissionDecisionReason: reason } : {}),
    },
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** PreToolUse hook: gates risky Bash commands (force-push, reset --hard, rm
 * -rf, ...) behind a physical confirm press. Never opens the device for the
 * common case (non-risky command, or no device connected) so it stays out
 * of the way of every other Bash call. */
async function runSafetyGate(): Promise<unknown> {
  let input: { tool_name?: string; tool_input?: { command?: string } };
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return hookDecision("ask");
  }
  if (input.tool_name !== "Bash") return hookDecision("ask");
  const reason = riskyCommandReason(input.tool_input?.command ?? "");
  if (!reason) return hookDecision("ask");

  let lp: LaunchpadX;
  try {
    lp = new LaunchpadX({
      outputName: unwrap(process.env.LAUNCHPAD_OUTPUT_PORT),
      inputName: unwrap(process.env.LAUNCHPAD_INPUT_PORT),
      openInput: true,
    });
  } catch {
    return hookDecision("ask"); // no Launchpad connected: fall back to the normal permission prompt
  }
  try {
    const { label } = (await runAsk(lp, confirmOptions("permitir", "bloquear"), 30)) as { label: string | null };
    if (label === "permitir") return hookDecision("allow", `Confirmado en el Launchpad (motivo: ${reason}).`);
    return hookDecision("deny", `Bloqueado en el Launchpad (motivo: ${reason}, sin respuesta a tiempo cuenta como bloqueo).`);
  } finally {
    lp.close();
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "safety-gate") {
    process.stdout.write(JSON.stringify(await runSafetyGate()) + "\n");
    return;
  }

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
    case "icon": {
      const [name, color, durationMs] = args;
      lp.show(iconCells(name!, color ?? "white"));
      await sleep(durationMs ? Number(durationMs) : 1500);
      lp.show(fullGridCells("off"));
      return { result: `showed icon ${JSON.stringify(name)} (${color ?? "white"})` };
    }
    case "focus-timer": {
      const [minutes] = args;
      const totalMs = Number(minutes) * 60_000;
      let elapsedMs = 0;
      while (elapsedMs < totalMs) {
        const remainingMs = totalMs - elapsedMs;
        lp.show(timerBarCells(remainingMs / totalMs, countdownColor(remainingMs)));
        const waitMs = Math.min(COUNTDOWN_TICK_MS, remainingMs);
        await sleep(waitMs);
        elapsedMs += waitMs;
      }
      lp.show(timerBarCells(0));
      return { result: `focus timer for ${minutes} minute(s) done` };
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
      await lp.scrollText(text ?? "", color ?? "white", speedMs ? Number(speedMs) : 180);
      return { result: `scrolled ${JSON.stringify(text ?? "")} (${color ?? "white"})` };
    }
    case "rainbow-text": {
      const [text, speedMs] = args;
      await lp.scrollRainbowText(text ?? "", speedMs ? Number(speedMs) : 180);
      return { result: `rainbow-scrolled ${JSON.stringify(text ?? "")}` };
    }
    case "notify-text": {
      const [message, kind] = args;
      const { color } = resolveEvent(kind ?? "done");
      await lp.scrollText(message ?? "", color, 180);
      return { result: `notified-text ${JSON.stringify(message ?? "")} (${color})` };
    }
    case "ask": {
      const [timeoutSeconds, optionsJson] = args;
      const options = JSON.parse(optionsJson!) as Option[];
      return runAsk(lp, options, Number(timeoutSeconds));
    }
    case "ask-multi": {
      const [timeoutSeconds, optionsJson, doneOptionJson] = args;
      const options = JSON.parse(optionsJson!) as Option[];
      const doneOption = doneOptionJson ? (JSON.parse(doneOptionJson) as DoneOption) : undefined;
      return runAskMulti(lp, options, Number(timeoutSeconds), doneOption);
    }
    case "confirm": {
      const [yesLabel, noLabel, timeoutSeconds] = args;
      return runAsk(lp, confirmOptions(yesLabel, noLabel), timeoutSeconds ? Number(timeoutSeconds) : 30);
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
