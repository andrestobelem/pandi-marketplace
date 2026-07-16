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
}


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
    c = COLORS[color]
    index = pad_note(col, row)
    if mode == "static":
        return (RGB, index, c["rgb"])
    if mode == "flash":
        # Lighting data is (Colour B, Colour A) palette indices; flashes between them.
        return (FLASH, index, (c["palette"], 0))
    if mode == "pulse":
        return (PULSE, index, (c["palette"],))
    raise ValueError(f"mode must be 'static', 'flash' or 'pulse', got {mode!r}")


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

    def __post_init__(self) -> None:
        self.output_name = _find_port(mido.get_output_names(), self.output_name)
        self.input_name = _find_port(mido.get_input_names(), self.input_name)
        self._out = mido.open_output(self.output_name)
        self._in = mido.open_input(self.input_name)
        self._out.send(programmer_mode_sysex(True))

    def show(self, specs: list[tuple[int, int, str, str]]) -> None:
        colourspecs = [colourspec(col, row, color, mode) for col, row, color, mode in specs]
        for start in range(0, len(colourspecs), _MAX_SPECS_PER_MESSAGE):
            self._out.send(led_sysex(colourspecs[start : start + _MAX_SPECS_PER_MESSAGE]))

    def set_pixel(self, col: int, row: int, color: str, mode: str = "static") -> None:
        self.show([(col, row, color, mode)])

    def clear(self) -> None:
        self.show([(col, row, "off", "static") for col in range(1, 9) for row in range(1, 9)])

    def poll_press(self, timeout: float, wanted_notes: set[int] | None = None) -> int | None:
        """Block until a matching pad is pressed (Note On, velocity > 0), or timeout. Returns the note number."""
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
            self._in.close()
