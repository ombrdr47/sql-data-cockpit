"""Check a disposable public database via the actual customer connector.

Provide CHECK_DB_HOST, CHECK_DB_NAME, CHECK_DB_USER, CHECK_DB_PASSWORD and optional
CHECK_DB_PORT as environment variables. No credentials or raw errors are printed.
Runs SELECT/SHOW only; never reads customer tables.
"""
import asyncio
import os
from unittest.mock import AsyncMock, patch
from sqlalchemy import text
from backend.app.connection_security import resolve_public_addresses
from backend.app.engine_pool import _secure_engine


async def probe():
    required = ['CHECK_DB_HOST', 'CHECK_DB_NAME', 'CHECK_DB_USER', 'CHECK_DB_PASSWORD']
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise SystemExit('Missing environment variables: ' + ', '.join(missing))
    host, db, user, password = (os.environ[key] for key in required)
    port = int(os.environ.get('CHECK_DB_PORT', '5432'))
    addresses = await resolve_public_addresses(host, port)
    engine = _secure_engine(host, port, db, user, password, pool_size=1, max_overflow=0)
    try:
        async with engine.connect() as conn:
            assert await conn.scalar(text('SELECT 1')) == 1
            assert await conn.scalar(text('SHOW transaction_read_only')) == 'on'
            assert await conn.scalar(text('SHOW statement_timeout')) == '5s'
        print('PASS: public endpoint, verified TLS, read-only session and statement timeout')
    except Exception:
        raise SystemExit('FAIL: connection or session policy check failed. Credentials and server details withheld.') from None
    finally:
        await engine.dispose()
    # Same validated IP and credentials, deliberately wrong TLS server name.
    # The connector must reject this instead of retrying without TLS.
    with patch('backend.app.connection_security.resolve_public_addresses', AsyncMock(return_value=addresses)):
        wrong = _secure_engine('certificate-mismatch.invalid', port, db, user, password, pool_size=1, max_overflow=0)
        try:
            async with wrong.connect():
                raise AssertionError('Mismatched hostname was accepted')
        except AssertionError:
            raise SystemExit('FAIL: mismatched certificate hostname was accepted.') from None
        except Exception as exc:
            # A connection refusal does not demonstrate certificate verification.
            message = str(exc).lower()
            if not any(word in message for word in ('certificate', 'does not match', 'hostname mismatch')):
                raise SystemExit('INCONCLUSIVE: negative check failed for a reason other than certificate verification.') from None
            print('PASS: mismatched certificate hostname rejected')
        finally:
            await wrong.dispose()


if __name__ == '__main__':
    asyncio.run(probe())
