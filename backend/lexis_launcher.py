"""Entry point for the packaged Windows app (PyInstaller) — same as `python -m app`.

The console window closes as soon as the program ends, so a failed start stays on screen until the
teacher has read the message.
"""

import logging
import sys

from app.__main__ import main


def _hold_window(message: str) -> None:
    """Keep the console window open until the teacher has read the message."""
    print(f"\n  Lexis could not start: {message}\n", flush=True)
    if sys.stdin and sys.stdin.isatty():
        input("  Press Enter to close this window.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except SystemExit as e:
        if e.code not in (None, 0):
            _hold_window("see the log in the Lexis data folder (logs\\lexis.log).")
        raise
    except Exception as e:
        logging.exception("Startup failed")
        _hold_window(str(e))
        sys.exit(1)
