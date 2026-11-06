from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, load_settings
from .db import Database
from .routers import analyses, auth


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="FinGuard AI", version="2.0.0")
    app.state.settings = settings
    app.state.db = Database(settings.database_url)
    app.state.db.create_all()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(auth.router)
    app.include_router(analyses.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app

