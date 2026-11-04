import json
import stat
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from backend.ops.authorize_gmail import authorize


def oauth_module():
    flow = MagicMock()
    flow.run_local_server.return_value = SimpleNamespace(refresh_token='test-private-refresh',
                                                        client_id='test-client', client_secret='test-private-secret')
    cls = MagicMock()
    cls.from_client_secrets_file.return_value = flow
    package, module = ModuleType('google_auth_oauthlib'), ModuleType('google_auth_oauthlib.flow')
    module.InstalledAppFlow = cls
    return {'google_auth_oauthlib': package, 'google_auth_oauthlib.flow': module}, flow


def test_authorization_output_is_private_and_credentials_not_printed(tmp_path, capsys):
    modules, flow = oauth_module()
    output = tmp_path / 'private' / 'secrets.json'
    with patch.dict(sys.modules, modules):
        authorize('client.json', 'owner@example.com', str(output))
    assert stat.S_IMODE(output.stat().st_mode) == 0o600
    assert json.loads(output.read_text())['GMAIL_REFRESH_TOKEN'] == 'test-private-refresh'
    text = capsys.readouterr().out
    assert 'test-private-refresh' not in text
    assert 'test-private-secret' not in text
    assert flow.run_local_server.call_args.kwargs['timeout_seconds'] == 300


def test_authorization_does_not_overwrite_existing_credentials(tmp_path):
    modules, flow = oauth_module()
    output = tmp_path / 'secrets.json'
    output.write_text('keep-existing')
    with patch.dict(sys.modules, modules):
        with pytest.raises(SystemExit, match='already exists'):
            authorize('client.json', 'owner@example.com', str(output))
    assert output.read_text() == 'keep-existing'
    flow.run_local_server.assert_not_called()
