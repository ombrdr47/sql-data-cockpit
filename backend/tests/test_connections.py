import pytest
from fastapi import HTTPException
from app.crypto import encrypt_field, decrypt_field, get_fernet
from app.routers.connections_router import _assert_not_internal, ConnectionCreate, _mask


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
