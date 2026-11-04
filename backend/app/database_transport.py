"""Driver-specific, certificate-verified transport for hosted application databases."""
import ssl
import certifi
from sqlalchemy.engine import make_url


def async_database_options(url: str, production: bool, ca_file: str | None = None):
    if not production:
        return url, {}
    parsed = make_url(url)
    if parsed.get_backend_name() not in {'postgresql', 'postgres'}:
        raise ValueError('A PostgreSQL database is required.')
    # Provider/libpq URLs contain options asyncpg does not accept. TLS is configured
    # explicitly here; a supplied sslmode cannot weaken certificate verification.
    ca_bundle = ca_file or parsed.query.get('sslrootcert') or certifi.where()
    query = {key: value for key, value in parsed.query.items()
             if key not in {'ssl', 'sslmode', 'sslrootcert', 'channel_binding'}}
    parsed = parsed.set(drivername='postgresql+asyncpg', query=query)
    return parsed, {'ssl': ssl.create_default_context(cafile=ca_bundle)}


def checkpoint_database_url(url: str, production: bool, ca_file: str | None = None) -> str:
    if not production:
        return url
    from psycopg.conninfo import make_conninfo, conninfo_to_dict
    url = url.replace('postgresql+psycopg://', 'postgresql://').replace('postgresql+asyncpg://', 'postgresql://')
    ca_bundle = ca_file or conninfo_to_dict(url).get('sslrootcert') or certifi.where()
    return make_conninfo(url, sslmode='verify-full', sslrootcert=ca_bundle)


def migration_database_url(url: str, production: bool, ca_file: str | None = None):
    if not production:
        return url
    parsed = make_url(url).set(drivername='postgresql')
    ca_bundle = ca_file or parsed.query.get('sslrootcert') or certifi.where()
    return parsed.update_query_dict({'sslmode': 'verify-full', 'sslrootcert': ca_bundle}).render_as_string(hide_password=False)
