import midi from "@julusian/midi";
import { textColumns } from "./font.ts";
import {
  type Cell,
  type ColourSpec,
  colourSpec,
  columnCells,
  fullGridCells,
  ledSysex,
  parseColor,
  RAINBOW_PALETTE,
  rainbowCells,
  SYSEX_HEADER,
  textFrameCells,
} from "./protocol.ts";

const MAX_SPECS_PER_MESSAGE = 81;

function findPortIndex(portCount: number, getName: (i: number) => string, override: string | undefined): number {
  const names = Array.from({ length: portCount }, (_, i) => getName(i));
  if (override) {
    const i = names.findIndex((n) => n === override);
    if (i === -1) {
      throw new Error(`No MIDI port named ${JSON.stringify(override)}. Available: ${names.join(", ") || "(none)"}`);
    }
    return i;
  }
  let candidates = names
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.toLowerCase().includes("launchpad") && !n.toLowerCase().includes("daw"));
  if (candidates.length === 0) {
    candidates = names.map((n, i) => ({ n, i })).filter(({ n }) => n.toLowerCase().includes("launchpad"));
  }
  if (candidates.length === 0) {
    throw new Error(
      `No Novation Launchpad X MIDI port found. Available ports: ${names.join(", ") || "(none)"}. ` +
        "Connect the device, or set LAUNCHPAD_OUTPUT_PORT / LAUNCHPAD_INPUT_PORT to the exact port name.",
    );
  }
  return candidates[0]!.i;
}

function programmerModeSysex(enabled: boolean): number[] {
  return [0xf0, ...SYSEX_HEADER, 0x0e, enabled ? 1 : 0, 0xf7];
}

export class LaunchpadX {
  private out = new midi.Output();
  private in_?: InstanceType<typeof midi.Input>;

  constructor(opts: { outputName?: string; inputName?: string; openInput?: boolean } = {}) {
    const outIndex = findPortIndex(this.out.getPortCount(), (i) => this.out.getPortName(i), opts.outputName);
    this.out.openPort(outIndex);
    this.out.sendMessage(programmerModeSysex(true));

    if (opts.openInput !== false) {
      const probe = new midi.Input();
      const inIndex = findPortIndex(probe.getPortCount(), (i) => probe.getPortName(i), opts.inputName);
      probe.openPort(inIndex);
      probe.ignoreTypes(false, false, false);
      this.in_ = probe;
    }
  }

  show(cells: readonly Cell[]): void {
    const specs: ColourSpec[] = cells.map((c) => colourSpec(c.col, c.row, c.color, c.mode));
    for (let start = 0; start < specs.length; start += MAX_SPECS_PER_MESSAGE) {
      this.out.sendMessage(ledSysex(specs.slice(start, start + MAX_SPECS_PER_MESSAGE)));
    }
  }

  setPixel(col: number, row: number, color: string, mode: Cell["mode"] = "static"): void {
    this.show([{ col, row, color, mode }]);
  }

  clear(): void {
    this.show(fullGridCells("off"));
  }

  async sweep(color: string, cycles: number = 1, speedMs: number = 60): Promise<void> {
    parseColor(color); // fail before animating rather than partway through it
    for (let c = 0; c < cycles; c++) {
      for (let col = 1; col <= 8; col++) {
        this.show(columnCells(col, color));
        await sleep(speedMs);
        this.show(columnCells(col, "off"));
      }
    }
  }

  async blink(color: string, times: number = 3, speedMs: number = 200): Promise<void> {
    parseColor(color); // fail before animating rather than partway through it
    for (let i = 0; i < times; i++) {
      this.show(fullGridCells(color));
      await sleep(speedMs);
      this.show(fullGridCells("off"));
      await sleep(speedMs);
    }
  }

  async rainbowSweep(cycles: number = 1, speedMs: number = 150): Promise<void> {
    for (let c = 0; c < cycles; c++) {
      for (let offset = 0; offset < RAINBOW_PALETTE.length; offset++) {
        this.show(rainbowCells(offset));
        await sleep(speedMs);
      }
    }
  }

  async scrollText(text: string, color: string = "white", speedMs: number = 180): Promise<void> {
    parseColor(color); // fail before animating rather than partway through it
    const columns = textColumns(text);
    for (let offset = -8; offset <= columns.length; offset++) {
      this.show(textFrameCells(columns, offset, color));
      await sleep(speedMs);
    }
    this.show(fullGridCells("off"));
  }

  pollPress(timeoutMs: number, wantedNotes?: ReadonlySet<number>): Promise<number | null> {
    if (!this.in_) {
      throw new Error("pollPress requires the device to be opened with openInput !== false");
    }
    const input = this.in_;
    return new Promise((resolve) => {
      let done = false;
      const finish = (value: number | null) => {
        if (done) return;
        done = true;
        input.removeAllListeners("message");
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      input.on("message", (_deltaTime: number, message: number[]) => {
        const [status, note, velocity] = message;
        const isNoteOn = status !== undefined && (status & 0xf0) === 0x90 && (velocity ?? 0) > 0;
        if (isNoteOn && note !== undefined && (!wantedNotes || wantedNotes.has(note))) {
          finish(note);
        }
      });
    });
  }

  /** Release the MIDI ports. Deliberately does NOT exit programmer mode:
   * each CLI invocation opens a fresh connection, and programmer mode is a
   * device-side persistent setting - turning it off here would immediately
   * undo whatever this command just drew, as soon as the process exits. */
  close(): void {
    this.out.closePort();
    this.in_?.closePort();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
