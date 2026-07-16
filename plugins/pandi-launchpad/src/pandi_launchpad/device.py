from __future__ import annotations

import time
from dataclasses import dataclass

import mido

# Novation Launchpad X SysEx header (F0/F7 are added by mido for 'sysex' messages).
# Source: Launchpad X Programmer's Reference Manual.
_SYSEX_HEADER = (0x00, 0x20, 0x29, 0x02, 0x0C)

STATIC, FLASH, PULSE, RGB = 0, 1, 2, 3

# name -> exact RGB (used for "static" pads) and nearest palette index
# (used for "flash"/"pulse", which the device only accepts as palette entries).
# Palette indices for red/green/blue are taken directly from the manual's own
# examples; the rest are eyeballed off the palette chart and safe to retune.
COLORS: dict[str, dict[str, object]] = {
    "off": {"rgb": (0, 0, 0), "palette": 0},
    "red": {"rgb": (127, 0, 0), "palette": 5},
    "green": {"rgb": (0, 127, 0), "palette": 19},
    "blue": {"rgb": (0, 0, 127), "palette": 45},
    "yellow": {"rgb": (127, 127, 0), "palette": 13},
    "white": {"rgb": (127, 127, 127), "palette": 3},
    "orange": {"rgb": (127, 55, 0), "palette": 9},
    "purple": {"rgb": (90, 0, 127), "palette": 49},
    "cyan": {"rgb": (0, 127, 127), "palette": 37},
    "pink": {"rgb": (127, 0, 70), "palette": 57},
    "lime": {"rgb": (90, 127, 0), "palette": 21},
    "teal": {"rgb": (0, 90, 90), "palette": 33},
    "gold": {"rgb": (127, 90, 0), "palette": 61},
    "indigo": {"rgb": (45, 0, 127), "palette": 50},
    "brown": {"rgb": (70, 40, 10), "palette": 65},
    "gray": {"rgb": (60, 60, 60), "palette": 1},
    "dark_red": {"rgb": (50, 0, 0), "palette": 7},
    "dark_green": {"rgb": (0, 50, 0), "palette": 23},
    "dark_blue": {"rgb": (0, 0, 50), "palette": 47},
    "magenta": {"rgb": (127, 0, 127), "palette": 53},
}


def _hex_to_rgb127(hex_color: str) -> tuple[int, int, int]:
    digits = hex_color.lstrip("#")
    if len(digits) != 6:
        raise ValueError(f"Hex colour must be '#rrggbb', got {hex_color!r}")
    try:
        r, g, b = (int(digits[i : i + 2], 16) for i in (0, 2, 4))
    except ValueError as exc:
        raise ValueError(f"Hex colour must be '#rrggbb', got {hex_color!r}") from exc
    return tuple(round(v * 127 / 255) for v in (r, g, b))


def parse_color(color: str, mode: str = "static") -> dict[str, object]:
    """Resolve a colour name or a '#rrggbb' hex string to a COLORS-shaped dict.

    Hex strings only carry an exact RGB, so they're only valid for mode='static';
    'flash'/'pulse' need a palette index, which only named colours have.
    """
    if color in COLORS:
        return COLORS[color]
    if color.startswith("#"):
        if mode != "static":
            raise ValueError(
                f"Custom hex colours only work with mode='static' (got mode={mode!r}); "
                "use a named colour for 'flash'/'pulse'."
            )
        return {"rgb": _hex_to_rgb127(color)}
    raise ValueError(f"Unknown colour {color!r}. Available: {', '.join(sorted(COLORS))}, or '#rrggbb'")


def pad_note(col: int, row: int) -> int:
    """Programmer-mode note number for a grid pad. col/row are 1-8, (1,1) is bottom-left."""
    if not (1 <= col <= 8 and 1 <= row <= 8):
        raise ValueError(f"col/row must be 1-8, got col={col} row={row}")
    return row * 10 + col


def note_to_coord(note: int) -> tuple[int, int]:
    row, col = divmod(note, 10)
    return col, row


def programmer_mode_sysex(enabled: bool) -> mido.Message:
    return mido.Message("sysex", data=_SYSEX_HEADER + (0x0E, 1 if enabled else 0))


def colourspec(col: int, row: int, color: str, mode: str = "static") -> tuple[int, int, tuple[int, ...]]:
    index = pad_note(col, row)
    if mode not in ("static", "flash", "pulse"):
        raise ValueError(f"mode must be 'static', 'flash' or 'pulse', got {mode!r}")
    c = parse_color(color, mode)
    if mode == "static":
        return (RGB, index, c["rgb"])
    if mode == "flash":
        # Lighting data is (Colour B, Colour A) palette indices; flashes between them.
        return (FLASH, index, (c["palette"], 0))
    return (PULSE, index, (c["palette"],))


def column_cells(col: int, color: str, mode: str = "static") -> list[tuple[int, int, str, str]]:
    """All 8 pads of one column, as (col, row, color, mode) cells ready for `show`."""
    return [(col, row, color, mode) for row in range(1, 9)]


def progress_bar_cells(percent: float, color: str = "green") -> list[tuple[int, int, str, str]]:
    """Column-major fill of the whole 8x8 grid representing 0-100%.

    Returns all 64 (col, row, color, mode) cells (filled ones in `color`, the rest
    'off'), ready to pass straight to `show` so unfilled pads get cleared too.
    """
    percent = max(0.0, min(100.0, percent))
    filled = round(percent / 100 * 64)
    cells = []
    n = 0
    for col in range(1, 9):
        for row in range(1, 9):
            n += 1
            cells.append((col, row, color if n <= filled else "off", "static"))
    return cells


def led_sysex(specs: list[tuple[int, int, tuple[int, ...]]]) -> mido.Message:
    data: list[int] = list(_SYSEX_HEADER) + [0x03]
    for lighting_type, index, payload in specs:
        data.extend([lighting_type, index, *payload])
    return mido.Message("sysex", data=data)


# The LED lighting SysEx message accepts at most 81 <colourspec> entries per message.
_MAX_SPECS_PER_MESSAGE = 81


def _find_port(names: list[str], override: str | None) -> str:
    if override:
        return override
    candidates = [n for n in names if "launchpad" in n.lower() and "daw" not in n.lower()]
    if not candidates:
        candidates = [n for n in names if "launchpad" in n.lower()]
    if not candidates:
        raise RuntimeError(
            "No Novation Launchpad X MIDI port found. Available ports: "
            f"{names or '(none)'}. Connect the device, or set LAUNCHPAD_OUTPUT_PORT / "
            "LAUNCHPAD_INPUT_PORT to the exact port name."
        )
    return candidates[0]


@dataclass
class LaunchpadX:
    output_name: str | None = None
    input_name: str | None = None
    open_input: bool = True

    def __post_init__(self) -> None:
        self.output_name = _find_port(mido.get_output_names(), self.output_name)
        self._out = mido.open_output(self.output_name)
        self._out.send(programmer_mode_sysex(True))
        self._in = None
        if self.open_input:
            self.input_name = _find_port(mido.get_input_names(), self.input_name)
            self._in = mido.open_input(self.input_name)

    def show(self, specs: list[tuple[int, int, str, str]]) -> None:
        colourspecs = [colourspec(col, row, color, mode) for col, row, color, mode in specs]
        for start in range(0, len(colourspecs), _MAX_SPECS_PER_MESSAGE):
            self._out.send(led_sysex(colourspecs[start : start + _MAX_SPECS_PER_MESSAGE]))

    def set_pixel(self, col: int, row: int, color: str, mode: str = "static") -> None:
        self.show([(col, row, color, mode)])

    def clear(self) -> None:
        self.show([(col, row, "off", "static") for col in range(1, 9) for row in range(1, 9)])

    def sweep(self, color: str, cycles: int = 1, speed: float = 0.06) -> None:
        """Animate a single-column highlight sweeping left-to-right across the grid."""
        for _ in range(cycles):
            for col in range(1, 9):
                self.show(column_cells(col, color))
                time.sleep(speed)
                self.show(column_cells(col, "off"))

    def poll_press(self, timeout: float, wanted_notes: set[int] | None = None) -> int | None:
        """Block until a matching pad is pressed (Note On, velocity > 0), or timeout. Returns the note number."""
        if self._in is None:
            raise RuntimeError("poll_press requires the device to be opened with open_input=True")
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            msg = self._in.poll()
            if msg is not None and msg.type == "note_on" and msg.velocity > 0:
                if wanted_notes is None or msg.note in wanted_notes:
                    return msg.note
            time.sleep(0.01)
        return None

    def close(self) -> None:
        try:
            self._out.send(programmer_mode_sysex(False))
        finally:
            self._out.close()
            if self._in is not None:
                self._in.close()
