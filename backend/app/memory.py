from __future__ import annotations
"""
app/memory.py
Conversation persistence (long-term, cross-session).

Two memory layers:
  1. LangGraph PostgresSaver checkpointer — short-term, per thread_id
     (handled automatically by LangGraph when checkpointer is configured)
  2. app_db conversations + messages tables — long-term, surfaced in sidebar
     (this module manages that layer)
"""
from typing import Optional
from uuid import UUID

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import Conversation, Message


# ── Conversation CRUD ─────────────────────────────────────────────────────────

async def create_conversation(
    session: AsyncSession, user_id: UUID, title: str = "New Conversation"
) -> Conversation:
    convo = Conversation(user_id=user_id, title=title)
    session.add(convo)
    await session.flush()
    await session.refresh(convo)
    return convo


async def list_conversations(
    session: AsyncSession, user_id: UUID
) -> list[Conversation]:
    """Return all conversations for a user, newest first."""
    result = await session.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_conversation(
    session: AsyncSession, conversation_id: UUID, user_id: UUID
) -> Optional[Conversation]:
    """Get a conversation — returns None if not found OR belongs to another user."""
    result = await session.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .where(Conversation.user_id == user_id)  # Scope to authenticated user
    )
    return result.scalar_one_or_none()


async def rename_conversation(
    session: AsyncSession, conversation_id: UUID, user_id: UUID, new_title: str
) -> Optional[Conversation]:
    convo = await get_conversation(session, conversation_id, user_id)
    if convo is None:
        return None
    convo.title = new_title
    await session.flush()
    return convo


async def delete_conversation(
    session: AsyncSession, conversation_id: UUID, user_id: UUID
) -> bool:
    convo = await get_conversation(session, conversation_id, user_id)
    if convo is None:
        return False
    await session.execute(
        delete(Conversation).where(Conversation.id == conversation_id)
    )
    return True


# ── Message CRUD ──────────────────────────────────────────────────────────────

async def add_message(
    session: AsyncSession,
    conversation_id: UUID,
    role: str,
    content: str,
    generated_sql: Optional[str] = None,
    chart_base64: Optional[str] = None,
    retry_count: Optional[int] = None,
    node_path: Optional[list[str]] = None,
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        generated_sql=generated_sql,
        chart_base64=chart_base64,
        retry_count=retry_count,
        node_path=node_path,
    )
    session.add(msg)
    await session.flush()
    await session.refresh(msg)
    return msg


async def get_messages(
    session: AsyncSession, conversation_id: UUID, user_id: UUID
) -> list[Message]:
    """
    Get all messages for a conversation, verifying the conversation belongs
    to the authenticated user (prevents data leakage to other users).
    """
    # First verify ownership
    convo = await get_conversation(session, conversation_id, user_id)
    if convo is None:
        return []

    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    return list(result.scalars().all())


async def auto_title_conversation(
    session: AsyncSession, conversation_id: UUID, first_question: str
) -> None:
    """Set the conversation title from the first user message (truncated)."""
    title = first_question[:60].strip()
    if len(first_question) > 60:
        title += "..."
    await session.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(title=title)
    )
