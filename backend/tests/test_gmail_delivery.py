import base64
from email.message import EmailMessage
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs

import httpx
import pytest
from pydantic import ValidationError

from backend.app.config import Settings
from backend.app.gmail_delivery import send_gmail_message, TOKEN_ENDPOINT, SEND_ENDPOINT


def settings():
    return SimpleNamespace(gmail_client_id='test-client', gmail_client_secret='test-secret', gmail_refresh_token='test-refresh')


def message():
    msg = EmailMessage()
    msg['From'] = 'sender@example.com'
    msg['To'] = 'recipient@example.com'
    msg['Subject'] = 'Verify account'
    msg.set_content('https://app.example.com/verify-email#token=test-only-token')
    return msg


@pytest.mark.asyncio
async def test_gmail_refresh_then_send_uses_https_and_encodes_message():
    calls = []
    def handler(request):
        calls.append(request)
        if str(request.url) == TOKEN_ENDPOINT:
            assert parse_qs(request.content.decode())['grant_type'] == ['refresh_token']
            return httpx.Response(200, json={'access_token': 'ephemeral-access'})
        assert str(request.url) == SEND_ENDPOINT
        assert request.headers['authorization'] == 'Bearer ephemeral-access'
        import json
        decoded = base64.urlsafe_b64decode(json.loads(request.content)['raw'])
        assert b'From: sender@example.com' in decoded
        assert b'#token=test-only-token' in decoded
        return httpx.Response(200, json={'id': 'message-id'})
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with patch('backend.app.gmail_delivery.httpx.AsyncClient', return_value=client):
        await send_gmail_message(message(), settings())
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_revoked_authorization_is_sanitized_and_does_not_send():
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(400, json={'error': 'invalid_grant', 'details': 'test-secret test-refresh'})
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with patch('backend.app.gmail_delivery.httpx.AsyncClient', return_value=client):
        with pytest.raises(RuntimeError) as error:
            await send_gmail_message(message(), settings())
    assert len(calls) == 1
    assert 'test-secret' not in str(error.value)
    assert 'test-refresh' not in str(error.value)


@pytest.mark.asyncio
async def test_ambiguous_send_failure_is_not_retried():
    calls = []
    def handler(request):
        calls.append(request)
        if str(request.url) == TOKEN_ENDPOINT:
            return httpx.Response(200, json={'access_token': 'access'})
        raise httpx.ReadTimeout('upstream timed out', request=request)
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with patch('backend.app.gmail_delivery.httpx.AsyncClient', return_value=client):
        with pytest.raises(RuntimeError):
            await send_gmail_message(message(), settings())
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_account_email_routes_to_gmail_without_smtp():
    from backend.app.account_email import send_account_email
    config = SimpleNamespace(mail_transport='gmail_api', frontend_url='https://app.example.com', mail_from='sender@example.com')
    with patch('backend.app.account_email.get_settings', return_value=config), \
         patch('backend.app.gmail_delivery.send_gmail_message', AsyncMock()) as send, \
         patch('backend.app.account_email.smtplib.SMTP') as smtp:
        await send_account_email('recipient@example.com', 'verify', 'test-token')
    send.assert_awaited_once()
    smtp.assert_not_called()
    assert send.call_args.args[0]['To'] == 'recipient@example.com'


def test_production_gmail_requires_all_oauth_credentials():
    values = dict(_env_file=None, groq_api_key='', environment='production',
                  jwt_secret_key='test-secret-with-at-least-32-characters',
                  frontend_url='https://app.example.com', allowed_origins='https://app.example.com',
                  mail_transport='gmail_api', mail_from='sender@gmail.com')
    with pytest.raises(ValidationError):
        Settings(**values)
    configured = Settings(**values, gmail_client_id='client', gmail_client_secret='secret', gmail_refresh_token='refresh')
    assert configured.mail_transport == 'gmail_api'


@pytest.mark.asyncio
async def test_malformed_token_response_does_not_send_mail():
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=[])
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with patch('backend.app.gmail_delivery.httpx.AsyncClient', return_value=client):
        with pytest.raises(RuntimeError):
            await send_gmail_message(message(), settings())
    assert len(calls) == 1
