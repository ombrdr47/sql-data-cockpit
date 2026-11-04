"""Save server-verified answers; never trust client SQL or result snapshots."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_appdb_session
from ..models import Conversation, Message, SavedAnalysis, User, UserConnection

router = APIRouter(prefix="/analyses", tags=["analyses"])


class AnalysisCreate(BaseModel):
    message_id: UUID
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value):
        if not value.strip():
            raise ValueError("Give the analysis a name.")
        return value.strip()


class AnalysisResponse(BaseModel):
    id: UUID
    name: str
    question: str
    sql: str
    connection_id: UUID | None
    is_demo: bool
    source_name: str
    snapshot: dict
    created_at: datetime
    last_run_at: datetime

    model_config = {"from_attributes": True}


async def get_owned_analysis(session: AsyncSession, analysis_id: UUID, user_id: UUID) -> SavedAnalysis:
    analysis = await session.scalar(select(SavedAnalysis).where(
        SavedAnalysis.id == analysis_id, SavedAnalysis.user_id == user_id,
    ))
    if analysis is None:
        raise HTTPException(404, "Analysis not found")
    return analysis


async def verify_analysis_source(session: AsyncSession, analysis: SavedAnalysis, user_id: UUID):
    """Deleted sources must never silently fall back to the demo database."""
    if analysis.is_demo:
        return
    connection = None
    if analysis.connection_id:
        connection = await session.scalar(select(UserConnection).where(
            UserConnection.id == analysis.connection_id, UserConnection.user_id == user_id,
        ))
    if connection is None:
        raise HTTPException(409, "The saved data source is no longer available. Save a new analysis from an active connection.")


@router.get("", response_model=list[AnalysisResponse])
async def list_analyses(current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_appdb_session)):
    result = await session.scalars(select(SavedAnalysis).where(
        SavedAnalysis.user_id == current_user.id,
    ).order_by(SavedAnalysis.created_at.desc()))
    return list(result.all())


@router.post("", response_model=AnalysisResponse, status_code=201)
async def save_analysis(body: AnalysisCreate, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_appdb_session)):
    message = await session.scalar(select(Message).join(Conversation).where(
        Message.id == body.message_id, Conversation.user_id == current_user.id,
        Message.role == "assistant",
    ))
    if message is None:
        raise HTTPException(404, "Answer not found")
    data = message.analysis_data or {}
    if data.get("succeeded") is not True or not message.generated_sql:
        raise HTTPException(422, "Run this question successfully before saving it.")
    connection_id = UUID(data["connection_id"]) if data.get("connection_id") else None
    analysis = SavedAnalysis(
        user_id=current_user.id, name=body.name, question=data["question"],
        sql=message.generated_sql, connection_id=connection_id,
        is_demo=connection_id is None, source_name=data.get("source_name") or "Chinook sample",
        snapshot={**data, "answer": message.content, "chart": message.chart_base64},
        last_run_at=datetime.fromisoformat(data["ran_at"]),
    )
    await verify_analysis_source(session, analysis, current_user.id)
    session.add(analysis)
    await session.commit()
    await session.refresh(analysis)
    return analysis
