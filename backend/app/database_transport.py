"""Driver-specific, certificate-verified transport for hosted application databases."""
import re
import ssl
from pathlib import Path

import certifi
from sqlalchemy.engine import make_url


# Public CA linked by the Supabase dashboard's production SSL settings.
# https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
_SUPABASE_CA = Path(__file__).resolve().parent / 'certs' / 'supabase-prod-ca-2021.crt'
_SUPABASE_POOLER = re.compile(r'aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com', re.IGNORECASE)
_SUPABASE_DIRECT = re.compile(r'db\.[a-z0-9]+\.supabase\.co', re.IGNORECASE)


def _default_ca(host: str | None) -> str:
    if host and (_SUPABASE_POOLER.fullmatch(host) or _SUPABASE_DIRECT.fullmatch(host)):
        return str(_SUPABASE_CA)
    return certifi.where()


def _uses_supabase_transaction_pooler(host: str | None, port: int | str | None) -> bool:
    return bool(host and _SUPABASE_POOLER.fullmatch(host) and str(port) == '6543')


def async_database_options(url: str, production: bool, ca_file: str | None = None):
    if not production:
        return url, {}
    parsed = make_url(url)
    if parsed.get_backend_name() not in {'postgresql', 'postgres'}:
        raise ValueError('A PostgreSQL database is required.')
    # Provider/libpq URLs contain options asyncpg does not accept. TLS is configured
    # explicitly here; a supplied sslmode cannot weaken certificate verification.
    ca_bundle = ca_file or parsed.query.get('sslrootcert') or _default_ca(parsed.host)
    query = {key: value for key, value in parsed.query.items()
             if key not in {'ssl', 'sslmode', 'sslrootcert', 'channel_binding'}}
    parsed = parsed.set(drivername='postgresql+asyncpg', query=query)
    # The shared transaction pooler cannot preserve prepared statements or
    # session-level locks. The same host and credentials work in session mode.
    if _uses_supabase_transaction_pooler(parsed.host, parsed.port):
        parsed = parsed.set(port=5432)
    return parsed, {'ssl': ssl.create_default_context(cafile=ca_bundle)}


def checkpoint_database_url(url: str, production: bool, ca_file: str | None = None) -> str:
    if not production:
        return url
    from psycopg.conninfo import make_conninfo, conninfo_to_dict
    url = url.replace('postgresql+psycopg://', 'postgresql://').replace('postgresql+asyncpg://', 'postgresql://')
    options = conninfo_to_dict(url)
    ca_bundle = ca_file or options.get('sslrootcert') or _default_ca(options.get('host'))
    if _uses_supabase_transaction_pooler(options.get('host'), options.get('port')):
        return make_conninfo(url, port=5432, sslmode='verify-full', sslrootcert=ca_bundle)
    return make_conninfo(url, sslmode='verify-full', sslrootcert=ca_bundle)


def migration_database_url(url: str, production: bool, ca_file: str | None = None):
    if not production:
        return url
    parsed = make_url(url).set(drivername='postgresql')
    ca_bundle = ca_file or parsed.query.get('sslrootcert') or _default_ca(parsed.host)
    if _uses_supabase_transaction_pooler(parsed.host, parsed.port):
        parsed = parsed.set(port=5432)
    return parsed.update_query_dict({'sslmode': 'verify-full', 'sslrootcert': ca_bundle}).render_as_string(hide_password=False)
