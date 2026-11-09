"""Start Lexis:  python -m app   (the Windows package runs exactly this).

- Binds to 127.0.0.1 only.
- If Lexis is already running, just opens the browser instead of starting twice.
- If another program holds port 8000, uses the next free port instead of failing.
- Logs to <data dir>/logs/lexis.log (rotating).
"""

from __future__ import annotations

import argparse
import json
import logging
import logging.handlers
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from dataclasses import replace

import uvicorn

from .config import load_config
from .main import create_app


def _already_running(url: str) -> bool:
    """True if a Lexis server answers at this address."""
    try:
        with urllib.request.urlopen(f"{url}/api/system", timeout=1.5) as row:
            return "fsrsVersion" in json.loads(row.read())
    except Exception:
        return False


def _open_when_ready(url: str) -> None:
    """Open the browser as soon as the server answers (gives up after about 10 seconds)."""
    for _ in range(100):
        if _already_running(url):
            webbrowser.open(url)
            return
        time.sleep(0.1)


def _port_free(port: int) -> bool:
    """True if nothing is listening on this port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        # A port just released by a restart may still be cooling down. The server can reuse it on
        # Linux and macOS, so this check must too. On Windows the option would allow stealing a port.
        if sys.platform != "win32":
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def choose_port(start: int, attempts: int = 10) -> tuple[int, bool]:
    """Returns (port, already_running): a running Lexis if there is one, otherwise the first free port."""
    free: int | None = None
    for port in range(start, start + attempts):
        if _already_running(f"http://127.0.0.1:{port}"):
            return port, True
        if free is None and _port_free(port):
            free = port
    if free is None:
        raise RuntimeError(f"Ports {start}-{start + attempts - 1} are all in use by other programs.")
    return free, False


def main() -> None:
    """Start the server, or just open the browser if Lexis is already running."""
    parser = argparse.ArgumentParser(prog="lexis")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    parser.add_argument("--port", type=int, help="port (default 8000)")
    args = parser.parse_args()

    cfg = load_config()
    if args.port:
        cfg = replace(cfg, port=args.port)

    (cfg.data_dir / "logs").mkdir(exist_ok=True)
    handlers: list[logging.Handler] = [
        logging.handlers.RotatingFileHandler(
            cfg.data_dir / "logs" / "lexis.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"
        )
    ]
    if sys.stderr:
        handlers.append(logging.StreamHandler())
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", handlers=handlers)

    port, running = choose_port(cfg.port, attempts=1 if args.port else 10)
    if port != cfg.port:
        if not running:
            logging.info("Port %s is used by another program; using %s", cfg.port, port)
        cfg = replace(cfg, port=port)
    url = f"http://127.0.0.1:{cfg.port}"

    if running:
        logging.info("Lexis is already running — opening the browser")
        webbrowser.open(url)
        return

    if not args.no_browser:
        threading.Thread(target=_open_when_ready, args=(url,), daemon=True).start()
    print(
        f"\n  Lexis is running at {url}\n  Data: {cfg.data_dir}\n  Close this window (or press Ctrl+C) to stop.\n",
        flush=True,
    )
    uvicorn.run(create_app(cfg), host="127.0.0.1", port=cfg.port, log_config=None, access_log=False)


if __name__ == "__main__":
    main()
