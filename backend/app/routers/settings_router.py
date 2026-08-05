"""
app/routers/settings_router.py
Per-user settings — currently: Groq API key management.

Endpoints:
  GET  /settings/api-key  → {"has_key": bool, "masked": str | null}
  PUT  /settings/api-key  → validate key against Groq API, then encrypt + save
  DELETE /settings/api-key → remove stored key

The key is stored Fernet-encrypted in users.groq_api_key_enc.
The plaintext key is NEVER returned to the frontend after being saved.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

import httpx

from ..auth import get_current_user
from ..crypto import get_fernet, encrypt_field, decrypt_field
from ..config import get_settings
from ..db import get_appdb_session
from ..models import User

router = APIRouter(prefix="/settings", tags=["settings"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class ApiKeyRequest(BaseModel):
    api_key: str


class ApiKeyResponse(BaseModel):
    has_key: bool
    masked: str | None = None  # e.g. "gsk_••••••••••••••••••1234"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    """Return a masked display version: keep first 8 + last 4 chars."""
    if len(key) <= 12:
        return "••••••••"
    return key[:8] + "•" * (len(key) - 12) + key[-4:]


async def _validate_groq_key(api_key: str) -> bool:
    """
    Quick validation: call GET /openai/v1/models with the key.
    Returns True if the key is valid, False otherwise.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
        return resp.status_code == 200
    except Exception:
        return False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/api-key", response_model=ApiKeyResponse)
async def get_api_key_status(
    current_user: User = Depends(get_current_user),
):
    """Return whether the user has a Groq API key saved, and its masked form."""
    if not current_user.groq_api_key_enc:
        return ApiKeyResponse(has_key=False, masked=None)

    try:
        fernet = get_fernet(get_settings().jwt_secret_key)
        plaintext = decrypt_field(current_user.groq_api_key_enc, fernet)
        return ApiKeyResponse(has_key=True, masked=_mask_key(plaintext))
    except Exception:
        # If decryption fails (e.g. key rotation), treat as no key
        return ApiKeyResponse(has_key=False, masked=None)


@router.put("/api-key", response_model=ApiKeyResponse)
async def save_api_key(
    body: ApiKeyRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    """
    Validate the provided Groq API key, then encrypt and save it.
    Returns 422 if the key is rejected by Groq.
    """
    api_key = body.api_key.strip()

    if not api_key.startswith("gsk_"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid key format. Groq API keys start with 'gsk_'.",
        )

    is_valid = await _validate_groq_key(api_key)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid Groq API key — please check the key and try again.",
        )

    fernet = get_fernet(get_settings().jwt_secret_key)
    encrypted = encrypt_field(api_key, fernet)

    await session.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(groq_api_key_enc=encrypted)
    )
    await session.commit()

    return ApiKeyResponse(has_key=True, masked=_mask_key(api_key))


@router.delete("/api-key", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    """Remove the stored Groq API key for the current user."""
    await session.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(groq_api_key_enc=None)
    )
    await session.commit()
