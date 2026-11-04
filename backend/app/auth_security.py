"""Browser-origin checks and bounded, per-worker auth throttling.

Deploy a shared edge/Redis limiter before running multiple API workers.
Never trust client-supplied X-Forwarded-For here.
"""
from collections import OrderedDict
from time import monotonic
from fastapi import HTTPException, Request, Response
from .config import get_settings

_attempts: OrderedDict[tuple[str, str], tuple[float, int]] = OrderedDict()

async def protect_auth(request: Request, response: Response) -> None:
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Pragma'] = 'no-cache'
    if request.method == 'GET':
        return
    origin = request.headers.get('origin')
    if origin is not None and origin not in get_settings().allowed_origins_list:
        raise HTTPException(403, 'Untrusted request origin')
    # Browsers send Origin on these POST requests. Non-browser API clients may
    # omit it, but cookie-authenticated requests must include an allowed origin.
    if origin is None and ('refresh_token' in request.cookies or request.headers.get('sec-fetch-site') == 'cross-site'):
        raise HTTPException(403, 'An allowed Origin is required for cookie authentication')
    path = request.url.path
    if path not in {'/auth/login', '/auth/signup', '/auth/change-password', '/auth/refresh', '/auth/forgot-password', '/auth/resend-verification', '/auth/verify-email', '/auth/reset-password'}:
        return
    now = monotonic()
    key = (request.client.host if request.client else 'unknown', path)
    start, count = _attempts.get(key, (now, 0))
    if now - start >= 60:
        start, count = now, 0
    limit = 60 if path == '/auth/refresh' else 10
    if count >= limit:
        raise HTTPException(429, 'Too many attempts. Try again shortly.', headers={'Retry-After': str(max(1, int(60 - (now - start))))})
    _attempts[key] = (start, count + 1)
    _attempts.move_to_end(key)
    while len(_attempts) > 10000:
        _attempts.popitem(last=False)


def require_personal_account(user):
    if user.email.lower() == 'demo@chinook.dev':
        raise HTTPException(403, 'Create a personal account to change credentials or settings.')
