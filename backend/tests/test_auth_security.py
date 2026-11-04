"""Security regressions, without external services or production credentials."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import FastAPI, HTTPException, Response
from fastapi.testclient import TestClient
from starlette.requests import Request
from pydantic import ValidationError
from backend.app.auth_security import protect_auth, _attempts, require_personal_account
from backend.app.routers.auth_router import router, _set_refresh_cookie, SignupRequest, ChangePasswordRequest
from backend.app.auth import get_current_user, create_access_token, rotate_refresh_token
from backend.app.config import Settings


def request(path='/auth/login', origin='http://localhost:5173', cookie=False):
    headers = []
    if origin is not None:
        headers.append((b'origin', origin.encode()))
    if cookie:
        headers.append((b'cookie', b'refresh_token=example'))
    return Request({'type': 'http', 'method': 'POST', 'path': path, 'headers': headers, 'client': ('test-ip', 100), 'scheme': 'http', 'server': ('test', 80), 'query_string': b''})


@pytest.fixture(autouse=True)
def reset_limiter():
    _attempts.clear()
    yield
    _attempts.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize('origin,cookie', [('https://evil.example', False), ('null', True), (None, True)])
async def test_untrusted_auth_requests_rejected(origin, cookie):
    with pytest.raises(HTTPException) as error:
        await protect_auth(request(origin=origin, cookie=cookie), Response())
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_throttling_and_cache_headers():
    response = Response()
    for _ in range(10):
        await protect_auth(request(), response)
    assert response.headers['cache-control'] == 'no-store'
    with pytest.raises(HTTPException) as error:
        await protect_auth(request(), response)
    assert error.value.status_code == 429
    assert int(error.value.headers['Retry-After']) > 0


def test_cookie_reaches_logout_and_removes_legacy_cookie():
    response = Response()
    _set_refresh_cookie(response, 'opaque-test-token')
    cookies = response.headers.getlist('set-cookie')
    assert any('Path=/auth/refresh' in c and 'Max-Age=0' in c for c in cookies)
    assert any('Path=/auth;' in c and 'HttpOnly' in c and 'opaque-test-token' in c for c in cookies)


@pytest.mark.asyncio
async def test_logout_revokes_token_and_clears_both_paths():
    from backend.app.routers.auth_router import logout
    session = AsyncMock()
    response = Response()
    await logout(response=response, refresh_token='opaque-test-token', session=session)
    session.execute.assert_awaited_once()
    session.commit.assert_awaited_once()
    cookies = response.headers.getlist('set-cookie')
    assert len(cookies) == 2
    assert all('Max-Age=0' in c for c in cookies)


@pytest.mark.asyncio
async def test_unknown_login_still_checks_password_hash():
    from backend.app.routers.auth_router import login, LoginRequest, DUMMY_PASSWORD_HASH
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute.return_value = result
    with patch('backend.app.routers.auth_router.verify_password', return_value=False) as verify:
        with pytest.raises(HTTPException) as error:
            await login(LoginRequest(email='missing@example.com', password='wrong-pass'), Response(), session)
        verify.assert_called_once_with('wrong-pass', DUMMY_PASSWORD_HASH)
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_invalid_uuid_is_401_not_server_error():
    credentials = SimpleNamespace(credentials=create_access_token('not-a-uuid', 'test@example.com'))
    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials=credentials, session=AsyncMock())
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_refresh_locks_row_and_rejects_spent_token():
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute.return_value = result
    with pytest.raises(HTTPException) as error:
        await rotate_refresh_token(session, 'spent-token')
    assert error.value.status_code == 401
    statement = session.execute.call_args.args[0]
    assert 'FOR UPDATE' in str(statement)


@pytest.mark.parametrize('password', ['x' * 73, 'é' * 37])
def test_bcrypt_byte_limit(password):
    with pytest.raises(ValidationError):
        SignupRequest(email='person@example.com', username='person', password=password)
    with pytest.raises(ValidationError):
        ChangePasswordRequest(current_password='current-password', new_password=password)


def test_production_rejects_insecure_settings():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, groq_api_key='test', environment='production', jwt_secret_key='CHANGE_ME_IN_PRODUCTION')
    with pytest.raises(ValidationError):
        Settings(_env_file=None, groq_api_key='test', environment='production', jwt_secret_key='x'*40, allowed_origins='https://*.example.com')


def test_demo_cannot_mutate_credentials():
    with pytest.raises(HTTPException) as error:
        require_personal_account(SimpleNamespace(email='demo@chinook.dev'))
    assert error.value.status_code == 403
    require_personal_account(SimpleNamespace(email='personal@example.com'))


def test_auth_origin_guard_runs_before_handler():
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        response = client.post('/auth/login', headers={'Origin': 'https://evil.example'}, json={'email': 'test@example.com', 'password': 'password'})
    assert response.status_code == 403
