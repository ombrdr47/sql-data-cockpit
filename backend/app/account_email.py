"""Transactional email; file previews are development-only and never API-readable."""
import asyncio
import os
import smtplib
import ssl
import uuid
from email.message import EmailMessage
from pathlib import Path
from .config import get_settings

async def send_account_email(recipient: str, purpose: str, token: str):
    settings = get_settings()
    route = 'verify-email' if purpose == 'verify' else 'reset-password'
    duration = '24 hours' if purpose == 'verify' else '30 minutes'
    # Fixed configured origin, never a request Host header; fragment avoids server/referrer logs.
    link = f"{settings.frontend_url.rstrip('/')}/{route}#token={token}"
    message = EmailMessage()
    message['From'] = settings.mail_from
    message['To'] = recipient
    message['Subject'] = 'Verify your SQL Cockpit email' if purpose == 'verify' else 'Reset your SQL Cockpit password'
    message.set_content(f"{message['Subject']}\n\nOpen this link and confirm the action:\n{link}\n\nThis link expires in {duration} and works once. If you did not request it, ignore this email.\n")
    if settings.mail_transport == 'gmail_api':
        from .gmail_delivery import send_gmail_message
        await send_gmail_message(message, settings)
        return

    def deliver():
        if settings.mail_transport == 'file':
            if settings.environment.lower() == 'production':
                raise RuntimeError('File email delivery is disabled in production')
            folder = Path(settings.mail_preview_dir)
            folder.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd = os.open(folder / f'{uuid.uuid4()}.eml', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as stream:
                stream.write(message.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                if settings.smtp_starttls:
                    smtp.starttls(context=ssl.create_default_context())
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
    await asyncio.to_thread(deliver)
