from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError
from backend.app.account_recovery import (
    consume_link, issue_link, reset_password, verify_email, forgot_password,
    resend_verification, EmailRequest, TokenRequest, ResetRequest, GENERIC,
)
from backend.app.auth import create_access_token, get_current_user

TOKEN = 'x' * 86

@pytest.mark.asyncio
async def test_unknown_and_known_email_requests_have_same_response():
    for email in ['known@example.com', 'absent@example.com']:
        tasks = BackgroundTasks()
        assert await forgot_password(EmailRequest(email=email), tasks) == GENERIC
        assert await resend_verification(EmailRequest(email=email), tasks) == GENERIC
        assert len(tasks.tasks) == 2

@pytest.mark.asyncio
async def test_expired_or_used_token_rejected_before_user_mutation():
    session = AsyncMock()
    session.scalar.return_value = None
    with pytest.raises(HTTPException) as error:
        await consume_link(session, TOKEN, 'reset')
    assert error.value.status_code == 400
    query = str(session.scalar.call_args.args[0])
    assert 'expires_at >' in query and 'consumed_at IS NULL' in query and 'purpose =' in query
    session.commit.assert_not_awaited()

@pytest.mark.asyncio
async def test_concurrent_consumer_losing_atomic_update_is_rejected():
    session = AsyncMock()
    session.scalar.side_effect = [uuid4(), SimpleNamespace(email='user@example.com'), None]
    with pytest.raises(HTTPException) as error:
        await consume_link(session, TOKEN, 'verify')
    assert error.value.status_code == 400

@pytest.mark.asyncio
async def test_reset_revokes_sessions_without_verifying_email():
    session = AsyncMock()
    user = SimpleNamespace(id=uuid4(), session_version=2, email_verified=False, hashed_password='old')
    with patch('backend.app.account_recovery.consume_link', AsyncMock(return_value=user)), patch('backend.app.account_recovery.hash_password', return_value='new-hash'):
        await reset_password(ResetRequest(token=TOKEN, password='new-password'), session)
    assert user.session_version == 3 and user.hashed_password == 'new-hash'
    assert user.email_verified is False
    assert session.execute.await_count == 2
    session.commit.assert_awaited_once()

@pytest.mark.asyncio
async def test_verification_marks_email_without_creating_session():
    user = SimpleNamespace(email="user@example.com", email_verified=False)
    session = AsyncMock()
    with patch('backend.app.account_recovery.consume_link', AsyncMock(return_value=user)):
        result = await verify_email(TokenRequest(token=TOKEN), session)
    assert user.email_verified is True
    assert 'access_token' not in result

@pytest.mark.asyncio
async def test_tokens_are_hashed_and_resends_have_cooldown():
    session = AsyncMock()
    session.add = MagicMock()
    session.scalar.return_value = None
    user = SimpleNamespace(id=uuid4(), email='user@example.com')
    with patch('backend.app.account_recovery.send_account_email', AsyncMock()) as send:
        await issue_link(session, user, 'reset')
        record = session.add.call_args.args[0]
        raw = send.call_args.args[2]
        assert record.token_hash != raw and len(record.token_hash) == 64
        assert 1700 < (record.expires_at - datetime.now(timezone.utc)).total_seconds() <= 1800
        session.scalar.return_value = uuid4()
        await issue_link(session, user, 'reset')
        send.assert_awaited_once()

@pytest.mark.asyncio
async def test_old_access_token_rejected_after_password_reset():
    uid = uuid4()
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = SimpleNamespace(email="user@example.com", email_verified=True, session_version=1)
    session.execute.return_value = result
    credentials = SimpleNamespace(credentials=create_access_token(str(uid), 'user@example.com', 0))
    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials, session)
    assert error.value.status_code == 401

@pytest.mark.asyncio
async def test_unverified_user_cannot_access_workspace():
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = SimpleNamespace(email="user@example.com", email_verified=False, session_version=0)
    session.execute.return_value = result
    with pytest.raises(HTTPException) as error:
        await get_current_user(SimpleNamespace(credentials=create_access_token(str(uuid4()), 'user@example.com')), session)
    assert error.value.status_code == 403

@pytest.mark.parametrize('password', ['short', 'é'*37])
def test_reset_password_validation(password):
    with pytest.raises(ValidationError):
        ResetRequest(token=TOKEN, password=password)

@pytest.mark.asyncio
async def test_development_email_is_private_and_uses_fragment(tmp_path):
    from backend.app.account_email import send_account_email
    settings = SimpleNamespace(frontend_url='http://localhost:5173', mail_from='test@localhost', mail_transport='file', mail_preview_dir=str(tmp_path), environment='development')
    with patch('backend.app.account_email.get_settings', return_value=settings):
        await send_account_email('user@example.com', 'reset', TOKEN)
    files = list(tmp_path.glob('*.eml'))
    assert len(files) == 1
    assert files[0].stat().st_mode & 0o777 == 0o600
    # EmailMessage may wrap long lines using quoted-printable encoding.
    from email import message_from_string
    body = message_from_string(files[0].read_text()).get_payload(decode=True).decode()
    assert '/reset-password#token=' + TOKEN in body
