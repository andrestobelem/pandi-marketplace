#!/usr/bin/env python3
"""Claude Code hook: light up the Launchpad X to signal Stop / Notification events.

Best-effort only - any error here is swallowed so a MIDI hiccup can never block
a Stop or Notification event.
"""

from __future__ import annotations

import sys

from pandi_launchpad.hooks import resolve_event


def main() -> None:
    kind = sys.argv[1] if len(sys.argv) > 1 else "done"
    color, mode = resolve_event(kind)
    try:
        from pandi_launchpad.device import LaunchpadX

        lp = LaunchpadX(open_input=False)
        lp.show([(col, row, color, mode) for col in range(1, 9) for row in range(1, 9)])
    except Exception as exc:  # pragma: no cover - best-effort hardware notification
        print(f"pandi-launchpad hook: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
