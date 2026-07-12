from __future__ import annotations
"""
app/routers/conversations_router.py
Conversation and message management endpoints.

All endpoints are scoped to the authenticated user_id from the JWT.
Attempting to access another user's conversation returns 404 (not 403)
to avoid leaking conversation existence.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_appdb_session
from ..memory import (
    create_conversation,
    delete_conversation,
    get_conversation,
    get_messages,
    list_conversations,
    rename_conversation,
)
from ..models import User

router = APIRouter(prefix="/conversations", tags=["conversations"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConversationResponse(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    generated_sql: Optional[str]
    chart_base64: Optional[str]
    retry_count: Optional[int]
    node_path: Optional[list[str]]
    created_at: str

    class Config:
        from_attributes = True


class CreateConversationRequest(BaseModel):
    title: str = "New Conversation"


class RenameConversationRequest(BaseModel):
    title: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ConversationResponse])
async def list_convos(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    convos = await list_conversations(session, current_user.id)
    return [
        ConversationResponse(
            id=str(c.id),
            title=c.title,
            created_at=c.created_at.isoformat(),
            updated_at=c.updated_at.isoformat(),
        )
        for c in convos
    ]


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_convo(
    body: CreateConversationRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    convo = await create_conversation(session, current_user.id, body.title)
    await session.commit()
    return ConversationResponse(
        id=str(convo.id),
        title=convo.title,
        created_at=convo.created_at.isoformat(),
        updated_at=convo.updated_at.isoformat(),
    )


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_convo_messages(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    # Ownership check is inside get_messages
    msgs = await get_messages(session, conversation_id, current_user.id)
    if msgs == [] and not await get_conversation(session, conversation_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return [
        MessageResponse(
            id=str(m.id),
            role=m.role,
            content=m.content,
            generated_sql=m.generated_sql,
            chart_base64=m.chart_base64,
            retry_count=m.retry_count,
            node_path=m.node_path,
            created_at=m.created_at.isoformat(),
        )
        for m in msgs
    ]


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def rename_convo(
    conversation_id: UUID,
    body: RenameConversationRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    convo = await rename_conversation(session, conversation_id, current_user.id, body.title)
    if convo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    await session.commit()
    return ConversationResponse(
        id=str(convo.id),
        title=convo.title,
        created_at=convo.created_at.isoformat(),
        updated_at=convo.updated_at.isoformat(),
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_convo(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    deleted = await delete_conversation(session, conversation_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    await session.commit()
