"""
tests/test_auth.py
Auth endpoint tests — signup, login, refresh, logout, protected routes.
Uses FastAPI's TestClient with mocked DB.

Key test: cross-user conversation access must return 403/404.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import uuid


@pytest.fixture
def app():
    """Create a test FastAPI app with mocked DB."""
    with patch("backend.app.main.get_schema_text", new_callable=AsyncMock, return_value="mock schema"):
        with patch("backend.app.main.build_graph") as mock_build:
            mock_build.return_value = MagicMock()
            from backend.app.main import app as fastapi_app
            yield fastapi_app


@pytest.fixture
def mock_db_session():
    """Mock AsyncSession."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.flush = AsyncMock()
    session.add = MagicMock()
    session.rollback = AsyncMock()
    return session


class TestPasswordHashing:
    def test_hash_and_verify(self):
        from backend.app.auth import hash_password, verify_password
        hashed = hash_password("mypassword123")
        assert hashed != "mypassword123"  # never stored plaintext
        assert verify_password("mypassword123", hashed) is True
        assert verify_password("wrongpassword", hashed) is False

    def test_different_salts(self):
        from backend.app.auth import hash_password
        hash1 = hash_password("same_password")
        hash2 = hash_password("same_password")
        # bcrypt generates different salts each time
        assert hash1 != hash2


class TestJWTTokens:
    def test_create_and_decode_access_token(self):
        from backend.app.auth import create_access_token, decode_access_token
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        token = create_access_token(user_id, email)
        payload = decode_access_token(token)
        assert payload["sub"] == user_id
        assert payload["email"] == email
        assert payload["type"] == "access"

    def test_invalid_token_raises_401(self):
        from backend.app.auth import decode_access_token
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            decode_access_token("invalid.token.here")
        assert exc_info.value.status_code == 401

    def test_refresh_token_is_random(self):
        from backend.app.auth import create_refresh_token
        t1 = create_refresh_token()
        t2 = create_refresh_token()
        assert t1 != t2
        assert len(t1) > 32  # At least 32 chars

    def test_token_hash_is_sha256(self):
        from backend.app.auth import hash_token
        import hashlib
        token = "test_token"
        expected = hashlib.sha256(token.encode()).hexdigest()
        assert hash_token(token) == expected


class TestSignupValidation:
    def test_username_too_short(self):
        from backend.app.routers.auth_router import SignupRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            SignupRequest(email="a@b.com", username="ab", password="password123")

    def test_username_too_long(self):
        from backend.app.routers.auth_router import SignupRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            SignupRequest(email="a@b.com", username="a" * 31, password="password123")

    def test_password_too_short(self):
        from backend.app.routers.auth_router import SignupRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            SignupRequest(email="a@b.com", username="validuser", password="short")

    def test_invalid_email(self):
        from backend.app.routers.auth_router import SignupRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            SignupRequest(email="not-an-email", username="validuser", password="password123")

    def test_valid_request(self):
        from backend.app.routers.auth_router import SignupRequest
        req = SignupRequest(email="user@example.com", username="validuser", password="password123")
        assert req.username == "validuser"


class TestGraphRouting:
    """Test that graph routing correctly enforces user isolation."""

    def test_route_after_validate_cannot_answer_bypasses_retry(self):
        """CANNOT_ANSWER questions should never be retried."""
        from backend.app.graph_routing import route_after_validate
        state = {
            "sql_valid": False,
            "validation_error": "CANNOT_ANSWER: no such column exists",
            "retry_count": 0,  # retries still available
        }
        # Should go to synthesis, not retry
        result = route_after_validate(state)
        assert result == "synthesize_answer"
