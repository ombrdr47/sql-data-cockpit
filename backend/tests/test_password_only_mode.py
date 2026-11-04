"""Password-only release mode preserves sessions without claiming email ownership."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, Response, FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app.config import Settings
from backend.app import auth
from backend.app.routers import auth_router
from backend.app.account_recovery import router as recovery_router


def settings():
    return Settings(_env_file=None, groq_api_key='test', mail_transport='disabled',
                    email_verification_required=False, environment='production',
                    jwt_secret_key='x' * 40, frontend_url='https://app.example.com',
                    allowed_origins='https://app.example.com')


def user():
    return SimpleNamespace(id=uuid4(), email='owner@example.com', username='owner',
                           hashed_password='hash', email_verified=False,
                           session_version=3, created_at=None)


def test_disabled_email_requires_explicit_password_only_mode():
    assert settings().email_verification_required is False
    with pytest.raises(ValidationError):
        Settings(_env_file=None, groq_api_key='test', mail_transport='disabled')


@pytest.mark.asyncio
async def test_signup_creates_session_without_email_or_verification():
    session = AsyncMock()
    session.add = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute.return_value = result

    async def refresh(record):
        record.id = uuid4()
        record.session_version = 0
    session.refresh.side_effect = refresh
    response = Response()
    with patch.object(auth_router, 'get_settings', return_value=settings()), \
         patch.object(auth_router, 'store_refresh_token', AsyncMock()) as store, \
         patch('backend.app.account_recovery.issue_link', AsyncMock()) as send:
        result = await auth_router.signup(auth_router.SignupRequest(
            email='new@example.com', username='newuser', password='password-123'), response, session)
    assert result.access_token and result.email == 'new@example.com'
    assert not session.add.call_args.args[0].email_verified
    store.assert_awaited_once()
    send.assert_not_awaited()
    session.commit.assert_awaited_once()
    assert 'HttpOnly' in response.headers.getlist('set-cookie')[-1]


@pytest.mark.asyncio
async def test_unverified_existing_user_can_login_and_access_workspace():
    account = user()
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = account
    session.execute.return_value = result
    with patch.object(auth_router, 'get_settings', return_value=settings()), \
         patch.object(auth, 'get_settings', return_value=settings()), \
         patch.object(auth_router, 'verify_password', return_value=True), \
         patch.object(auth_router, 'store_refresh_token', AsyncMock()):
        tokens = await auth_router.login(auth_router.LoginRequest(email=account.email, password='password'), Response(), session)
        assert await auth.get_current_user(SimpleNamespace(credentials=tokens.access_token), session) is account
    assert account.email_verified is False


@pytest.mark.asyncio
async def test_unverified_user_refresh_still_rotates_and_checks_session_version():
    account = user()
    session = AsyncMock()
    rt = MagicMock()
    rt.scalar_one_or_none.return_value = SimpleNamespace(id=uuid4(), user_id=account.id)
    loaded = MagicMock()
    loaded.scalar_one.return_value = account
    session.execute.side_effect = [rt, MagicMock(), loaded]
    with patch.object(auth, 'get_settings', return_value=settings()), \
         patch.object(auth, 'store_refresh_token', AsyncMock()) as store:
        actual, token = await auth.rotate_refresh_token(session, 'old-token')
    assert actual is account and token != 'old-token'
    store.assert_awaited_once()
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = account
    session.execute.return_value = result
    with patch.object(auth, 'get_settings', return_value=settings()):
        stale = auth.create_access_token(str(account.id), account.email, 2)
        with pytest.raises(HTTPException) as error:
            await auth.get_current_user(SimpleNamespace(credentials=stale), session)
    assert error.value.status_code == 401


def test_disabled_email_endpoints_reject_before_lookup_or_delivery():
    app = FastAPI()
    app.include_router(recovery_router)
    with patch('backend.app.account_recovery.get_settings', return_value=settings()), TestClient(app) as client:
        for path, body in [('/forgot-password', {'email': 'owner@example.com'}),
                           ('/resend-verification', {'email': 'owner@example.com'}),
                           ('/verify-email', {'token': 'x' * 86}),
                           ('/reset-password', {'token': 'x' * 86, 'password': 'password-123'})]:
            assert client.post('/auth' + path, json=body).status_code == 503

@pytest.mark.asyncio
async def test_password_only_account_can_resolve_its_own_model_key():
    from backend.app.llm import resolve_api_key
    from backend.app.crypto import encrypt_field, get_fernet
    account = user()
    account.groq_api_key_enc = encrypt_field('private-model-key', get_fernet(settings().jwt_secret_key))
    session = AsyncMock()
    session.get.return_value = account
    cm = AsyncMock()
    cm.__aenter__.return_value = session
    with patch('backend.app.db.get_appdb_session_factory', return_value=lambda: cm), \
         patch('backend.app.llm.get_settings', return_value=settings()):
        assert await resolve_api_key(str(account.id)) == 'private-model-key'


@pytest.mark.asyncio
async def test_options_hide_unavailable_email_and_demo_actions():
    with patch.object(auth_router, 'get_settings', return_value=settings()):
        assert await auth_router.auth_options() == {
            'email_verification_required': False,
            'password_reset_available': False,
            'demo_available': False,
        }
