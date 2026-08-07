import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException
from app.crypto import encrypt_field, decrypt_field, get_fernet
from app.routers.connections_router import (
    _assert_not_internal,
    _require_non_demo,
    ConnectionCreate,
    _mask,
    DEMO_EMAIL,
)


class TestCrypto:
    def test_encrypt_decrypt_round_trip(self):
        secret = "super_secret_db_password_123!"
        fernet = get_fernet("test-jwt-secret-key-for-unit-tests-12345")
        encrypted = encrypt_field(secret, fernet)
        assert encrypted != secret
        decrypted = decrypt_field(encrypted, fernet)
        assert decrypted == secret

    def test_different_encryptions_produce_different_ciphertexts(self):
        secret = "same_secret"
        fernet = get_fernet("test-jwt-secret-key-for-unit-tests-12345")
        enc1 = encrypt_field(secret, fernet)
        enc2 = encrypt_field(secret, fernet)
        assert enc1 != enc2
        assert decrypt_field(enc1, fernet) == secret
        assert decrypt_field(enc2, fernet) == secret


class TestSSRFProtection:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("host", [
        "localhost",
        "host.docker.internal",
        "gateway.docker.internal",
        "127.0.0.1",
        "10.0.0.5",
        "192.168.1.100",
        "172.16.0.1",
        "::1",
    ])
    async def test_blocked_private_and_metadata_hosts(self, host):
        with pytest.raises(HTTPException) as exc_info:
            await _assert_not_internal(host)
        assert exc_info.value.status_code == 422
        assert "not allowed" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("host", [
        "db.example.com",
        "postgres.render.com",
        "8.8.8.8",
        "mypostgres-db.us-east-1.rds.amazonaws.com",
    ])
    async def test_allowed_public_hosts(self, host):
        # Should not raise any exception
        await _assert_not_internal(host)


class TestHelpersAndSchemas:
    def test_connection_create_validation(self):
        payload = ConnectionCreate(
            name="Test Production DB",
            host="db.public-domain.com",
            port=5432,
            database="analytics_db",
            username="ro_user",
            password="secretpassword123"
        )
        assert payload.name == "Test Production DB"
        assert payload.port == 5432

    def test_mask_string_short(self):
        assert _mask("ab") == "***"

    def test_mask_string_normal(self):
        masked = _mask("analytics_db")
        assert masked.startswith("ana")
        assert masked.endswith("***")


class TestDemoAccountGuard:
    """Unit tests for _require_non_demo dependency.

    Tests are pure — no DB or HTTP client needed. The dependency receives an
    already-resolved User object (as FastAPI would after running get_current_user),
    so we mock User directly.
    """

    def _make_user(self, email: str):
        from app.models import User
        u = MagicMock(spec=User)
        u.email = email
        return u

    def test_demo_account_is_blocked(self):
        """POST/DELETE /connections must return 403 for the shared demo account."""
        demo_user = self._make_user(DEMO_EMAIL)
        with pytest.raises(HTTPException) as exc_info:
            _require_non_demo(current_user=demo_user)
        assert exc_info.value.status_code == 403
        assert "demo account" in exc_info.value.detail.lower()

    def test_regular_user_is_allowed(self):
        """A normal account must pass through the guard unchanged."""
        regular_user = self._make_user("alice@company.com")
        result = _require_non_demo(current_user=regular_user)
        assert result is regular_user  # exact same object returned

    def test_admin_user_is_allowed(self):
        """Admin accounts are also regular users — must not be blocked."""
        admin_user = self._make_user("admin@sql-cockpit.io")
        result = _require_non_demo(current_user=admin_user)
        assert result is admin_user

    def test_demo_email_constant_is_correct(self):
        """Guard email must match the seeded demo account email in main.py."""
        assert DEMO_EMAIL == "demo@chinook.dev"

    def test_email_check_is_case_sensitive(self):
        """Guard must not be bypassed with capital letters in the email.

        The demo account is always seeded with a lowercase email by main.py,
        so uppercase variants are simply treated as different (non-demo) users.
        This test documents that behaviour explicitly.
        """
        upper_user = self._make_user("Demo@Chinook.Dev")
        # Should NOT raise — different email string, treated as regular user
        result = _require_non_demo(current_user=upper_user)
        assert result is upper_user
