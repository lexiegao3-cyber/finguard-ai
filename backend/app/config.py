from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    jwt_ttl_minutes: int
    cors_origins: list[str]


def load_settings() -> Settings:
    secret = os.getenv("FINGUARD_JWT_SECRET", "")
    env = os.getenv("FINGUARD_ENV", "development")
    if not secret:
        if env == "production":
            raise RuntimeError("FINGUARD_JWT_SECRET must be set in production")
        secret = "dev-only-insecure-secret-change-me-0123456789"
    return Settings(
        database_url=os.getenv("FINGUARD_DATABASE_URL", "sqlite:///./finguard.db"),
        jwt_secret=secret,
        jwt_ttl_minutes=int(os.getenv("FINGUARD_JWT_TTL_MINUTES", "120")),
        cors_origins=os.getenv("FINGUARD_CORS_ORIGINS", "http://localhost:5173").split(","),
    )
