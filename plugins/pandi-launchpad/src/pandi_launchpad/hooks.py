from __future__ import annotations

_EVENTS: dict[str, tuple[str, str]] = {
    "done": ("green", "static"),
    "attention": ("red", "pulse"),
}


def resolve_event(kind: str) -> tuple[str, str]:
    """Map a hook event kind to a (colour, mode) pair for lighting the whole grid."""
    return _EVENTS.get(kind, ("white", "flash"))
