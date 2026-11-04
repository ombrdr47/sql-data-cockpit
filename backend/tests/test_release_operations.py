from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError
from backend.app.config import Settings
from backend.ops import legacy_checkpoints


def production_settings(**overrides):
    values = dict(_env_file=None, groq_api_key='', environment='production',
                  jwt_secret_key='test-only-production-secret-long-enough',
                  mail_transport='smtp', smtp_host='smtp.example.com', smtp_starttls=True,
                  mail_from='Cockpit <hello@example.com>', frontend_url='https://app.example.com',
                  allowed_origins='https://app.example.com')
    return Settings(**(values | overrides))


def test_production_config_accepts_explicit_origin_and_sender():
    assert production_settings().environment == 'production'


@pytest.mark.parametrize('value', ['https://', 'https://user:pass@example.com',
                                  'https://example.com/path', 'https://example.com#fragment',
                                  'https://*.example.com', 'https://example.com:99999'])
def test_production_origin_must_be_real_origin(value):
    with pytest.raises(ValidationError):
        production_settings(allowed_origins=value)
    with pytest.raises(ValidationError):
        production_settings(frontend_url=value)


def test_production_rejects_local_email_sender():
    with pytest.raises(ValidationError):
        production_settings(mail_from='SQL Cockpit <no-reply@localhost>')


@pytest.mark.asyncio
async def test_cleanup_apply_needs_explicit_confirmation():
    with pytest.raises(ValueError, match='requires'):
        await legacy_checkpoints.run(apply=True)


@pytest.mark.asyncio
async def test_cleanup_preview_never_deletes_or_prints_thread_ids(capsys):
    session = AsyncMock()
    session.begin = MagicMock(return_value=AsyncMock())
    session.execute.return_value = [('private-thread-id',)]
    session.scalar.side_effect = [4, 5, 2]
    cm = AsyncMock()
    cm.__aenter__.return_value = session
    with patch.object(legacy_checkpoints, 'get_appdb_session_factory', return_value=lambda: cm), \
         patch.object(legacy_checkpoints, 'get_appdb_engine', return_value=SimpleNamespace(dispose=AsyncMock())):
        await legacy_checkpoints.run()
    output = capsys.readouterr().out
    assert 'private-thread-id' not in output
    assert '"applied": false' in output
    assert not any('DELETE' in str(call.args[0]) for call in session.execute.call_args_list)


@pytest.mark.asyncio
async def test_cleanup_refuses_stale_plan():
    session = AsyncMock()
    session.begin = MagicMock(return_value=AsyncMock())
    cm = AsyncMock()
    cm.__aenter__.return_value = session
    with patch.object(legacy_checkpoints, 'plan', AsyncMock(return_value=(['id'], {'plan_sha256': 'new'}))), \
         patch.object(legacy_checkpoints, 'get_appdb_session_factory', return_value=lambda: cm), \
         patch.object(legacy_checkpoints, 'get_appdb_engine', return_value=SimpleNamespace(dispose=AsyncMock())):
        with pytest.raises(ValueError, match='Plan changed'):
            await legacy_checkpoints.run(apply=True, expected='old', stopped=True)
    session.execute.assert_not_awaited()
