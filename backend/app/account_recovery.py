"""Purpose-bound, hashed, expiring single-use account links."""
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select, update
from .auth import hash_token, create_refresh_token, hash_password
from .auth_security import protect_auth
from .db import get_appdb_session, get_appdb_session_factory
from .models import User, AccountToken, RefreshToken
from .account_email import send_account_email

router = APIRouter(prefix='/auth', tags=['auth'], dependencies=[Depends(protect_auth)])
GENERIC = {'message': 'If this account is eligible, an email with the next steps will arrive shortly.'}

class EmailRequest(BaseModel):
    email: EmailStr

class TokenRequest(BaseModel):
    token: str = Field(min_length=40, max_length=200)

class ResetRequest(TokenRequest):
    password: str
    @field_validator('password')
    @classmethod
    def valid_password(cls, value):
        if len(value) < 8 or len(value.encode('utf-8')) > 72:
            raise ValueError('Use at least 8 characters and no more than 72 UTF-8 bytes.')
        return value

async def issue_link(session, user, purpose):
    now = datetime.now(timezone.utc)
    recent = await session.scalar(select(AccountToken.id).where(AccountToken.user_id == user.id, AccountToken.purpose == purpose, AccountToken.created_at > now - timedelta(seconds=60)).limit(1))
    if recent:
        return
    await session.execute(update(AccountToken).where(AccountToken.user_id == user.id, AccountToken.purpose == purpose, AccountToken.consumed_at.is_(None)).values(consumed_at=now))
    token = create_refresh_token()
    session.add(AccountToken(user_id=user.id, token_hash=hash_token(token), purpose=purpose, expires_at=now + (timedelta(hours=24) if purpose == 'verify' else timedelta(minutes=30))))
    await session.flush()
    await send_account_email(user.email, purpose, token)

async def deliver_requested_link(email, purpose):
    # A background task gives the same HTTP response before any account lookup or SMTP work.
    try:
        async with get_appdb_session_factory()() as session:
            user = await session.scalar(select(User).where(User.email == email).with_for_update())
            if not user or user.email == 'demo@chinook.dev' or (purpose == 'verify' and user.email_verified):
                return
            await issue_link(session, user, purpose)
            await session.commit()
    except Exception:
        # Do not log credentials, action links, or recipient addresses.
        logging.getLogger(__name__).error('Account email delivery failed; check mail configuration')

@router.post('/forgot-password')
async def forgot_password(body: EmailRequest, tasks: BackgroundTasks):
    tasks.add_task(deliver_requested_link, str(body.email), 'reset')
    return GENERIC

@router.post('/resend-verification')
async def resend_verification(body: EmailRequest, tasks: BackgroundTasks):
    tasks.add_task(deliver_requested_link, str(body.email), 'verify')
    return GENERIC

async def consume_link(session, token, purpose):
    now = datetime.now(timezone.utc)
    uid = await session.scalar(select(AccountToken.user_id).where(AccountToken.token_hash == hash_token(token), AccountToken.purpose == purpose, AccountToken.consumed_at.is_(None), AccountToken.expires_at > now))
    if not uid:
        raise HTTPException(400, 'This link is invalid, expired, or already used. Request a new one.')
    # Lock the user first, consistently with issuing links and other password changes.
    user = await session.scalar(select(User).where(User.id == uid).with_for_update())
    used = await session.scalar(update(AccountToken).where(AccountToken.token_hash == hash_token(token), AccountToken.purpose == purpose, AccountToken.consumed_at.is_(None), AccountToken.expires_at > datetime.now(timezone.utc)).values(consumed_at=now).returning(AccountToken.id))
    if not used or not user or user.email == 'demo@chinook.dev':
        raise HTTPException(400, 'This link is invalid, expired, or already used. Request a new one.')
    return user

@router.post('/verify-email')
async def verify_email(body: TokenRequest, session=Depends(get_appdb_session)):
    user = await consume_link(session, body.token, 'verify')
    user.email_verified = True
    await session.commit()
    return {'message': 'Email verified. You can now sign in.'}

@router.post('/reset-password')
async def reset_password(body: ResetRequest, session=Depends(get_appdb_session)):
    user = await consume_link(session, body.token, 'reset')
    user.hashed_password = hash_password(body.password)
    user.session_version += 1
    await session.execute(update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True))
    await session.execute(update(AccountToken).where(AccountToken.user_id == user.id, AccountToken.purpose == 'reset', AccountToken.consumed_at.is_(None)).values(consumed_at=datetime.now(timezone.utc)))
    await session.commit()
    return {'message': 'Password reset. Sign in with your new password. If your email is not verified yet, verify it first.'}
