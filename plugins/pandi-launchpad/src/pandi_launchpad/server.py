from __future__ import annotations

import atexit
import os
from typing import Any

from mcp.server.fastmcp import FastMCP

from .device import LaunchpadX, full_grid_cells, note_to_coord, parse_color, progress_bar_cells

mcp = FastMCP("pandi-launchpad")

_device: LaunchpadX | None = None


def _unwrap(value: str | None) -> str | None:
    """Claude Code leaves unresolved ${VAR} placeholders in env when the var isn't set."""
    if not value or (value.startswith("${") and value.endswith("}")):
        return None
    return value


def _get_device() -> LaunchpadX:
    global _device
    if _device is None:
        _device = LaunchpadX(
            output_name=_unwrap(os.getenv("LAUNCHPAD_OUTPUT_PORT")),
            input_name=_unwrap(os.getenv("LAUNCHPAD_INPUT_PORT")),
        )
        atexit.register(_device.close)
    return _device


def _check_color(color: str, mode: str = "static") -> str:
    parse_color(color, mode)  # raises ValueError with a clear message if invalid
    return color


@mcp.tool()
def lp_set(col: int, row: int, color: str, mode: str = "static") -> str:
    """Light a single Launchpad X pad. col/row are 1-8, with (1,1) the bottom-left pad.
    color is a name (see lp_colors) or, for mode='static' only, a '#rrggbb' hex string.
    mode is 'static' (exact colour), 'flash' or 'pulse' (named colour only, approximate)."""
    _check_color(color, mode)
    _get_device().set_pixel(col, row, color, mode)
    return f"pad ({col},{row}) set to {color} ({mode})"


@mcp.tool()
def lp_show(cells: list[dict[str, Any]]) -> str:
    """Light multiple pads in a single batch.
    Each cell: {"col": 1-8, "row": 1-8, "color": str, "mode": "static"|"flash"|"pulse"}."""
    specs = [
        (cell["col"], cell["row"], _check_color(cell["color"], cell.get("mode", "static")), cell.get("mode", "static"))
        for cell in cells
    ]
    _get_device().show(specs)
    return f"lit {len(specs)} pad(s)"


@mcp.tool()
def lp_pulse_all(color: str = "blue") -> str:
    """Pulse every pad the same named colour - a 'thinking' / heartbeat indicator."""
    _check_color(color, "pulse")
    _get_device().show(full_grid_cells(color, "pulse"))
    return f"pulsing all pads {color}"


@mcp.tool()
def lp_progress_bar(percent: float, color: str = "green") -> str:
    """Fill the grid proportionally to `percent` (0-100), column by column, as a progress indicator."""
    _check_color(color, "static")
    _get_device().show(progress_bar_cells(percent, color))
    return f"progress bar at {percent}% ({color})"


@mcp.tool()
def lp_sweep(color: str = "cyan", cycles: int = 1) -> str:
    """Animate a single-column highlight sweeping left-to-right across the grid. Blocks for the duration."""
    _check_color(color, "static")
    _get_device().sweep(color, cycles=cycles)
    return f"swept {color} x{cycles}"


@mcp.tool()
def lp_blink_all(color: str = "yellow", times: int = 3) -> str:
    """Flash the whole grid on/off `times` times. Blocks for the duration."""
    _check_color(color)
    _get_device().blink(color, times=times)
    return f"blinked {color} x{times}"


@mcp.tool()
def lp_rainbow_sweep(cycles: int = 1) -> str:
    """Animate a rainbow rotating across the grid, one column per frame. Blocks for the duration."""
    _get_device().rainbow_sweep(cycles=cycles)
    return f"rainbow swept x{cycles}"


@mcp.tool()
def lp_clear() -> str:
    """Turn off every pad on the Launchpad X."""
    _get_device().clear()
    return "cleared"


@mcp.tool()
def lp_ask(prompt: str, options: list[dict[str, Any]], timeout: float = 60.0) -> dict[str, Any]:
    """Ask the user a question by lighting up labelled pads and blocking until one is pressed.

    prompt is shown to you only for your own bookkeeping (the device has no screen) -
    make sure the option colours/positions make the choice obvious on their own, and
    consider saying the prompt out loud in your own reply too.
    Each option: {"label": str, "col": 1-8, "row": 1-8, "color": str}.
    Returns {"label": <pressed label>} or {"label": None, "timed_out": True}.
    """
    device = _get_device()
    by_note = {}
    specs = []
    for opt in options:
        color = _check_color(opt["color"])
        by_note[opt["row"] * 10 + opt["col"]] = opt["label"]
        specs.append((opt["col"], opt["row"], color, "static"))
    device.show(specs)
    try:
        pressed_note = device.poll_press(timeout, wanted_notes=set(by_note))
    finally:
        device.show([(opt["col"], opt["row"], "off", "static") for opt in options])
    if pressed_note is None:
        return {"label": None, "timed_out": True}
    return {"label": by_note[pressed_note]}


@mcp.tool()
def lp_wait_for_press(pads: list[dict[str, int]] | None = None, timeout: float = 60.0) -> dict[str, Any]:
    """Block until a pad is pressed. If pads (list of {"col","row"}) is given, only those count.
    Returns {"col": int, "row": int} or {"timed_out": True}."""
    wanted = {p["row"] * 10 + p["col"] for p in pads} if pads else None
    note = _get_device().poll_press(timeout, wanted_notes=wanted)
    if note is None:
        return {"timed_out": True}
    col, row = note_to_coord(note)
    return {"col": col, "row": row}


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
