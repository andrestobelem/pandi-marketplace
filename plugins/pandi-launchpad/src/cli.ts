#!/usr/bin/env node
import { spawn } from "node:child_process";
import { confirmOptions, countdownColor, type DoneOption, flashCells, multiSelectCells, type Option, optionCells, resultIcon } from "./ask.ts";
import { LaunchpadX } from "./device.ts";
import { resolveEvent } from "./hooks.ts";
import { iconCells } from "./icons.ts";
import { classifyMenuNote, DEFAULT_EXIT_ITEM, DEFAULT_MENU_ITEMS, type ExitItem, type MenuItem, menuCells } from "./menu.ts";
import { type Cell, type Mode, fullGridCells, noteToCoord, padNote, progressBarCells, timerBarCells } from "./protocol.ts";
import { riskyCommandReason } from "./risky-command.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrap(value: string | undefined): string | undefined {
  if (!value || (value.startsWith("${") && value.endsWith("}"))) return undefined;
  return value;
}

const INPUT_COMMANDS = new Set(["ask", "ask-multi", "confirm", "wait-for-press", "menu"]);

const COUNTDOWN_TICK_MS = 1000;
const TIMEOUT_FLASH_MS = 400;
const ICON_ECHO_MS = 800;

/** Shared timeout feedback for runAsk/runAskMulti: flash `cells` red briefly
 * before the caller turns the grid off. */
async function flashTimeout(lp: LaunchpadX, cells: readonly Cell[]): Promise<void> {
  lp.show(flashCells(cells));
  await sleep(TIMEOUT_FLASH_MS);
}

/** Shared success feedback for runAsk/runAskMulti: show an icon briefly, then
 * clear the grid. */
async function echoIcon(lp: LaunchpadX, name: string, color: string): Promise<void> {
  lp.show(iconCells(name, color));
  await sleep(ICON_ECHO_MS);
  lp.show(fullGridCells("off"));
}

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
    if (pressedNote === null) await flashTimeout(lp, cells);
    lp.show(cells.map((c) => ({ ...c, color: "off" })));
    lp.show(timerBarCells(0));
  }
  if (pressedNote === null) return { label: null, timed_out: true };
  const label = byNote.get(pressedNote) ?? null;
  if (label !== null) {
    const icon = resultIcon(label, options);
    await echoIcon(lp, icon.name, icon.color);
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
    if (!confirmed) await flashTimeout(lp, multiSelectCells(options, selected, doneOption).cells);
    lp.show(fullGridCells("off"));
    lp.show(timerBarCells(0));
  }
  if (confirmed) await echoIcon(lp, "check", "green");
  return confirmed ? { labels: [...selected] } : { labels: [...selected], timed_out: true };
}

const MENU_POLL_MS = 24 * 60 * 60 * 1000; // re-poll once a day; menu otherwise waits forever for a press
const MENU_UNHANDLED_FLASH_MS = 300;

/** Copies `text` to the macOS clipboard via `pbcopy`, so a canned phrase picked
 * on the Launchpad can be pasted straight into a Claude Code prompt. */
function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const pbcopy = spawn("pbcopy");
    pbcopy.once("error", reject);
    pbcopy.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`pbcopy exited with code ${code}`))));
    pbcopy.stdin.end(text);
  });
}

/** Brief white flash on a single pad - acknowledges a press that isn't a menu
 * item or the exit block, so every press does *something* instead of nothing. */
async function flashPad(lp: LaunchpadX, col: number, row: number): Promise<void> {
  lp.show([{ col, row, color: "white", mode: "flash" }]);
  await sleep(MENU_UNHANDLED_FLASH_MS);
  lp.show([{ col, row, color: "off", mode: "static" }]);
}

/** Standalone loop (not driven by Claude): each item press copies its `text`
 * to the clipboard and keeps the menu up for the next pick, so starting or
 * continuing a conversation needs a paste instead of typing. Listens for any
 * pad (not just the defined items/exit) so a stray press always gets some
 * feedback instead of doing nothing. Runs until the exit block is pressed or
 * the process is interrupted (Ctrl+C). */
async function runMenu(lp: LaunchpadX, items: readonly MenuItem[], exitItem: ExitItem): Promise<unknown> {
  const { cells, byNote, exitNotes } = menuCells(items, exitItem);
  lp.clear();
  lp.show(cells);
  let copied = 0;
  for (;;) {
    const note = await lp.pollPress(MENU_POLL_MS);
    if (note === null) continue;
    const kind = classifyMenuNote(note, byNote, exitNotes);
    if (kind === "exit") break;
    if (kind === "unhandled") {
      const { col, row } = noteToCoord(note);
      await flashPad(lp, col, row);
      continue;
    }
    const label = byNote.get(note);
    const item = items.find((i) => i.label === label);
    if (!item) continue;
    await copyToClipboard(item.text);
    copied++;
    await echoIcon(lp, "check", item.color);
    lp.show(cells);
  }
  lp.show(fullGridCells("off"));
  return { result: "menu closed", copied };
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

/** PreToolUse hook: gates every Bash permission decision behind a physical
 * confirm press, not just risky commands (force-push, reset --hard, rm -rf,
 * ...) - so answering "sí"/"no" to run a command never needs the keyboard.
 * Falls back to the normal permission prompt when there's no device (or a
 * malformed hook payload); a risky command that times out fails closed
 * (deny), a non-risky one falls back to the normal prompt instead. */
async function runSafetyGate(): Promise<unknown> {
  let input: { tool_name?: string; tool_input?: { command?: string } };
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return hookDecision("ask");
  }
  if (input.tool_name !== "Bash") return hookDecision("ask");
  const reason = riskyCommandReason(input.tool_input?.command ?? "");
  const isRisky = reason !== null;
  const label = reason ?? "comando de Bash";

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
    const { label: pressed } = (await runAsk(lp, confirmOptions("permitir", "bloquear"), 30)) as { label: string | null };
    if (pressed === "permitir") return hookDecision("allow", `Confirmado en el Launchpad (motivo: ${label}).`);
    if (pressed === "bloquear") return hookDecision("deny", `Bloqueado en el Launchpad (motivo: ${label}).`);
    // Timed out with nobody pressing anything: fail closed for a genuinely
    // risky command, but fall back to the normal prompt for everything else -
    // an unanswered "should this ls run" shouldn't hard-block like an
    // unanswered "should this rm -rf run" does.
    if (isRisky) return hookDecision("deny", `Bloqueado en el Launchpad (motivo: ${label}, sin respuesta a tiempo cuenta como bloqueo).`);
    return hookDecision("ask");
  } catch {
    // Mid-flow MIDI error (device disconnected after opening, etc.): fail safe
    // to the normal permission prompt - never silently allow a risky command.
    return hookDecision("ask");
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

  if (command === "menu") {
    // The loop otherwise runs until the exit pad is pressed; Ctrl+C should
    // still turn the grid off instead of leaving it lit when node exits.
    process.once("SIGINT", () => {
      lp.show(fullGridCells("off"));
      lp.close();
      process.exit(0);
    });
  }

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
    case "menu": {
      const [itemsJson, exitItemJson] = args;
      const items = itemsJson ? (JSON.parse(itemsJson) as MenuItem[]) : DEFAULT_MENU_ITEMS;
      const exitItem = exitItemJson ? (JSON.parse(exitItemJson) as ExitItem) : DEFAULT_EXIT_ITEM;
      return runMenu(lp, items, exitItem);
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
