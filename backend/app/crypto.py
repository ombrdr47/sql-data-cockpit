"""
app/crypto.py
Fernet-based symmetric encryption for BYODB credential fields.

Key derivation: HKDF-SHA256 from JWT_SECRET_KEY + a fixed salt.
This means no extra env var is needed, but rotating JWT_SECRET_KEY
will invalidate all stored credentials (users must reconnect).

Usage:
    from .crypto import get_fernet, encrypt_field, decrypt_field
    from .config import get_settings

    f = get_fernet(get_settings().jwt_secret_key)
    enc = encrypt_field("my-password", f)
    raw = decrypt_field(enc, f)
"""
import base64

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def get_fernet(jwt_secret_key: str) -> Fernet:
    """
    Derive a 32-byte Fernet key from JWT_SECRET_KEY using HKDF-SHA256.

    The salt and info bytes are fixed constants so the same key is always
    derived from the same secret, regardless of call order.
    """
    kdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"byodb-credential-v1",
        info=b"sql-data-cockpit-fernet",
    )
    raw_key = kdf.derive(jwt_secret_key.encode())
    # Fernet requires URL-safe base64-encoded 32-byte key
    b64_key = base64.urlsafe_b64encode(raw_key)
    return Fernet(b64_key)


def encrypt_field(value: str, fernet: Fernet) -> str:
    """Encrypt a plaintext string and return a base64 token (str)."""
    return fernet.encrypt(value.encode()).decode()


def decrypt_field(token: str, fernet: Fernet) -> str:
    """Decrypt a Fernet token back to the original plaintext string."""
    return fernet.decrypt(token.encode()).decode()
