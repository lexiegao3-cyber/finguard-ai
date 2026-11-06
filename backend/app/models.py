"""Relational schema.

An Analysis is a named, user-owned investigation (e.g. "ACME FY24 revenue
ledger"). Each run of it is stored as an immutable AnalysisVersion that
records the method version, a hash of the exact input, the parameters and
the full result. Re-running with new data appends a version instead of
overwriting, so earlier conclusions stay reproducible and auditable.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    analyses: Mapped[list[Analysis]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    owner: Mapped[User] = relationship(back_populates="analyses")
    versions: Mapped[list[AnalysisVersion]] = relationship(
        back_populates="analysis",
        cascade="all, delete-orphan",
        order_by="AnalysisVersion.version",
    )


class AnalysisVersion(Base):
    __tablename__ = "analysis_versions"
    __table_args__ = (UniqueConstraint("analysis_id", "version", name="uq_analysis_version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    method_version: Mapped[str] = mapped_column(String(32))
    input_sha256: Mapped[str] = mapped_column(String(64), index=True)
    params: Mapped[dict] = mapped_column(JSON)
    input_excerpt: Mapped[str] = mapped_column(Text)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    analysis: Mapped[Analysis] = relationship(back_populates="versions")
