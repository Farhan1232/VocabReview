"""Lexis backend: FastAPI app serving /api and the built frontend on 127.0.0.1."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from .config import Config, frontend_dir, load_config
from .db import Database
from .migrate import upgrade
from .routers.api import router
from .services import backup
from .services.common import get_settings, reset_caches

VERSION = "1.0.4"
log = logging.getLogger("lexis")


class LocalOnlyMiddleware(BaseHTTPMiddleware):
    """Defence in depth for a localhost app:
    - only loopback clients are served;
    - the Host header must be localhost/127.0.0.1 (blocks DNS-rebinding attacks);
    - state-changing requests from another website's Origin are refused (blocks CSRF)."""

    LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]", "testserver"}

    async def dispatch(self, request: Request, call_next):
        """Refuse anything not from this computer, then add security headers to the response."""
        client = request.client.host if request.client else "127.0.0.1"
        if client not in ("127.0.0.1", "::1", "testclient", "localhost"):
            return JSONResponse({"detail": "Local access only"}, status_code=403)
        host_header = request.headers.get("host") or ""
        host = "[::1]" if host_header.startswith("[") else host_header.rsplit(":", 1)[0]
        if host not in self.LOCAL_HOSTS:
            return JSONResponse({"detail": "Invalid host"}, status_code=403)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin and origin != "null":
                origin_host = origin.split("://", 1)[-1].rsplit(":", 1)[0]
                if origin_host not in self.LOCAL_HOSTS:
                    return JSONResponse({"detail": "Cross-site request refused"}, status_code=403)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/api"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response


def create_app(cfg: Config | None = None, *, startup_backup: bool = True) -> FastAPI:
    """Build the FastAPI app. Tests call this with a temporary Config."""
    cfg = cfg or load_config()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """On startup: migrate, connect and back up. On shutdown: close the connections."""
        upgrade(cfg)
        db = Database(cfg.db_url)
        app.state.db = db
        reset_caches()
        if startup_backup:
            with db.session_factory() as session:
                keep = get_settings(session).auto_backup_keep
            backup.create_backup(cfg, "startup", keep)
        log.info("Lexis %s ready — data in %s", VERSION, cfg.data_dir)
        yield
        db.engine.dispose()

    app = FastAPI(
        title="Lexis",
        version=VERSION,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.state.cfg = cfg
    app.add_middleware(LocalOnlyMiddleware)
    app.include_router(router)

    @app.exception_handler(RequestValidationError)
    async def _validation(_req: Request, exc: RequestValidationError):
        """Turn a validation failure into one readable message for the UI."""
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(part) for part in first.get("loc", [])[1:])
        return JSONResponse(
            {
                "detail": f"Invalid input{f' ({where})' if where else ''}: {first.get('msg', '')}",
                "errors": exc.errors(),
            },
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def _unexpected(_req: Request, exc: Exception):
        """Log unexpected errors and give the UI a plain message instead of a stack trace."""
        if isinstance(exc, HTTPException):
            raise exc
        log.exception("Unexpected error")
        return JSONResponse(
            {"detail": "Unexpected error — nothing was saved. Details are in the log file."}, status_code=500
        )

    web = frontend_dir()
    if web:
        app.mount("/assets", StaticFiles(directory=web / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            """Serve a frontend file, or index.html so that page links keep working on reload."""
            if path.startswith("api/"):
                raise HTTPException(404)
            file_path = (web / path).resolve()
            if path and file_path.is_file() and web.resolve() in file_path.parents:
                return FileResponse(file_path)
            return FileResponse(web / "index.html", headers={"Cache-Control": "no-cache"})

    return app
