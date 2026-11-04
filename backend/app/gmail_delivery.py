"""Gmail delivery over HTTPS for hosts without outbound SMTP.

The one-time account authorization is an operator action. Only a refresh token
from the send-only OAuth scope is needed; credentials never enter graph state.
"""
import base64
from email.message import EmailMessage
import httpx

TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'


async def send_gmail_message(message: EmailMessage, settings) -> None:
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            response = await client.post(TOKEN_ENDPOINT, data={
                'client_id': settings.gmail_client_id,
                'client_secret': settings.gmail_client_secret,
                'refresh_token': settings.gmail_refresh_token,
                'grant_type': 'refresh_token',
            })
            response.raise_for_status()
            token_data = response.json()
            access_token = token_data.get('access_token') if isinstance(token_data, dict) else None
            if not isinstance(access_token, str) or not access_token:
                raise ValueError('Missing access token')
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode('ascii')
            response = await client.post(SEND_ENDPOINT,
                headers={'Authorization': f'Bearer {access_token}'}, json={'raw': raw})
            response.raise_for_status()
    except (httpx.HTTPError, ValueError, TypeError):
        # Do not leak Google response bodies, account addresses or credentials.
        raise RuntimeError('Gmail delivery failed. Check the configured account authorization.') from None
