"""Glue between validated API params and the analytics core, plus the
versioning rules for stored analyses."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import anomalies, benford, mdna_diff
from .analytics.parsing import extract_numbers
from .models import Analysis, AnalysisVersion
from .schemas import AnalysisParams, AnomalyParams, BenfordParams, MdnaParams

EXCERPT_CHARS = 2000


class AnalysisError(ValueError):
    """Input passed schema validation but cannot be analysed (e.g. too few values)."""


def _values(params: BenfordParams | AnomalyParams) -> list[float]:
    return params.values if params.values is not None else extract_numbers(params.text or "")


def run(params: AnalysisParams) -> tuple[str, dict]:
    """Execute an analysis. Returns (method_version, result_dict)."""
    try:
        if isinstance(params, BenfordParams):
            res = benford.analyze(_values(params), digits=params.digits)
            return res.method_version, res.to_dict()
        if isinstance(params, AnomalyParams):
            rep = anomalies.screen(_values(params), z_threshold=params.z_threshold)
            return rep.method_version, rep.to_dict()
        if isinstance(params, MdnaParams):
            diff = mdna_diff.compare(params.before, params.after, params.similarity_threshold)
            return diff.method_version, diff.to_dict()
    except ValueError as exc:
        raise AnalysisError(str(exc)) from exc
    raise AnalysisError(f"Unsupported analysis kind: {params.kind}")


def input_fingerprint(params: AnalysisParams) -> str:
    canonical = json.dumps(params.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _excerpt(params: AnalysisParams) -> str:
    if isinstance(params, MdnaParams):
        raw = params.after
    elif params.text is not None:
        raw = params.text
    else:
        raw = ", ".join(f"{v:g}" for v in (params.values or [])[:300])
    return raw[:EXCERPT_CHARS]


def _stored_params(params: AnalysisParams) -> dict:
    """Parameters without the (potentially large) raw input."""
    return params.model_dump(mode="json", exclude={"values", "text", "before", "after"})


def create_analysis(db: Session, owner_id: int, title: str, params: AnalysisParams) -> Analysis:
    method_version, result = run(params)
    analysis = Analysis(owner_id=owner_id, kind=params.kind, title=title.strip())
    analysis.versions.append(
        AnalysisVersion(
            version=1,
            method_version=method_version,
            input_sha256=input_fingerprint(params),
            params=_stored_params(params),
            input_excerpt=_excerpt(params),
            result=result,
        )
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


def add_version(db: Session, analysis: Analysis, params: AnalysisParams) -> tuple[AnalysisVersion, bool]:
    """Append a version. Idempotent: identical input + method returns the
    existing version and created=False instead of storing a duplicate."""
    if params.kind != analysis.kind:
        raise AnalysisError(f"Analysis {analysis.id} is of kind '{analysis.kind}', not '{params.kind}'.")

    fingerprint = input_fingerprint(params)
    method_version, result = run(params)
    existing = db.scalar(
        select(AnalysisVersion).where(
            AnalysisVersion.analysis_id == analysis.id,
            AnalysisVersion.input_sha256 == fingerprint,
            AnalysisVersion.method_version == method_version,
        )
    )
    if existing:
        return existing, False

    next_version = (
        db.scalar(select(func.max(AnalysisVersion.version)).where(AnalysisVersion.analysis_id == analysis.id)) or 0
    ) + 1
    version = AnalysisVersion(
        analysis_id=analysis.id,
        version=next_version,
        method_version=method_version,
        input_sha256=fingerprint,
        params=_stored_params(params),
        input_excerpt=_excerpt(params),
        result=result,
    )
    db.add(version)
    analysis.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(version)
    db.refresh(analysis)
    return version, True
