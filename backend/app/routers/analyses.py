from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .. import services
from ..deps import current_user, get_db
from ..models import Analysis, AnalysisVersion, User
from ..schemas import AnalysisCreate, AnalysisListItem, AnalysisOut, Page, VersionCreate, VersionOut

router = APIRouter(prefix="/api/analyses", tags=["analyses"])


def _owned(db: Session, user: User, analysis_id: int) -> Analysis:
    analysis = db.scalar(
        select(Analysis)
        .options(selectinload(Analysis.versions))
        .where(Analysis.id == analysis_id, Analysis.owner_id == user.id)
    )
    if analysis is None:
        # 404 rather than 403 so ids of other users' analyses are not disclosed.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    return analysis


def _out(analysis: Analysis) -> AnalysisOut:
    latest = analysis.versions[-1]
    return AnalysisOut(
        id=analysis.id,
        kind=analysis.kind,
        title=analysis.title,
        created_at=analysis.created_at,
        updated_at=analysis.updated_at,
        versions=analysis.versions,
        latest=latest,
    )


@router.post("", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED)
def create(body: AnalysisCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        analysis = services.create_analysis(db, user.id, body.title, body.params)
    except services.AnalysisError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None
    return _out(_owned(db, user, analysis.id))


@router.get("", response_model=Page)
def list_analyses(
    kind: Literal["benford", "anomalies", "mdna_diff"] | None = None,
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    latest = (
        select(AnalysisVersion.analysis_id, func.max(AnalysisVersion.version).label("latest"))
        .group_by(AnalysisVersion.analysis_id)
        .subquery()
    )
    stmt = select(Analysis, latest.c.latest).join(latest, latest.c.analysis_id == Analysis.id)
    stmt = stmt.where(Analysis.owner_id == user.id)
    if kind:
        stmt = stmt.where(Analysis.kind == kind)
    if q:
        stmt = stmt.where(Analysis.title.ilike(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(Analysis.updated_at.desc(), Analysis.id.desc()).limit(limit).offset(offset))
    items = [
        AnalysisListItem(id=a.id, kind=a.kind, title=a.title, updated_at=a.updated_at, latest_version=v)
        for a, v in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/export")
def export(db: Session = Depends(get_db), user: User = Depends(current_user)):
    analyses = db.scalars(
        select(Analysis).options(selectinload(Analysis.versions)).where(Analysis.owner_id == user.id).order_by(Analysis.id)
    ).all()
    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "analyses": [
            {
                "id": a.id,
                "kind": a.kind,
                "title": a.title,
                "versions": [VersionOut.model_validate(v).model_dump(mode="json") for v in a.versions],
            }
            for a in analyses
        ],
    }
    return payload


@router.get("/{analysis_id}", response_model=AnalysisOut)
def get(analysis_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return _out(_owned(db, user, analysis_id))


@router.post("/{analysis_id}/versions", response_model=VersionOut)
def add_version(
    analysis_id: int,
    body: VersionCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    analysis = _owned(db, user, analysis_id)
    try:
        version, created = services.add_version(db, analysis, body.params)
    except services.AnalysisError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return version


@router.get("/{analysis_id}/versions/{version}", response_model=VersionOut)
def get_version(analysis_id: int, version: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    analysis = _owned(db, user, analysis_id)
    for v in analysis.versions:
        if v.version == version:
            return v
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(analysis_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(_owned(db, user, analysis_id))
    db.commit()
