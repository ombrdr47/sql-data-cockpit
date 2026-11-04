"""Owner-run OAuth setup; creates a private file, never prints credentials.

Install backend/ops/gmail-requirements.txt in a private local environment first.
Create a Google OAuth Web application with redirect URI http://localhost:8765/.
Download its client JSON outside Git, then run this module locally.
"""
import argparse
import json
import logging
import os
from pathlib import Path

SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'


def authorize(client_file: str, sender: str, output_file: str):
    from google_auth_oauthlib.flow import InstalledAppFlow
    output = Path(output_file)
    if output.exists():
        raise SystemExit('Output already exists. Choose a new private output file; existing credentials were not overwritten.')
    # Suppress the library's INFO-level callback URL log (contains an auth code).
    logging.getLogger('google_auth_oauthlib.flow').setLevel(logging.WARNING)
    flow = InstalledAppFlow.from_client_secrets_file(client_file, scopes=[SEND_SCOPE], autogenerate_code_verifier=True)
    credentials = flow.run_local_server(host='localhost', port=8765, timeout_seconds=300,
        access_type='offline', prompt='consent', login_hint=sender,
        authorization_prompt_message='Authorize the sender in the browser window opened on this computer.',
        success_message='Authorization completed. You can close this window.')
    if not credentials.refresh_token:
        raise SystemExit('No refresh token returned. Re-authorize with offline consent.')
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    data = {'MAIL_TRANSPORT': 'gmail_api', 'MAIL_FROM': f'SQL Cockpit <{sender}>',
            'GMAIL_CLIENT_ID': credentials.client_id, 'GMAIL_CLIENT_SECRET': credentials.client_secret,
            'GMAIL_REFRESH_TOKEN': credentials.refresh_token}
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(data, stream, indent=2)
    print('Authorization saved to the private output file. Enter its values directly in Render; do not paste them in chat.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-file', required=True)
    parser.add_argument('--sender', required=True)
    parser.add_argument('--output', default='backend/.local/gmail-render-secrets.json')
    args = parser.parse_args()
    authorize(args.client_file, args.sender, args.output)
