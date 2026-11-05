import ssl
import pytest
from psycopg.conninfo import conninfo_to_dict
from backend.app.database_transport import async_database_options, checkpoint_database_url


def test_production_async_url_preserves_credentials_and_verifies_tls():
    url, options = async_database_options('postgresql://user:p%40ss@db.example/db?sslmode=disable&channel_binding=require', True)
    assert url.drivername == 'postgresql+asyncpg'
    assert url.password == 'p@ss'
    assert 'sslmode' not in url.query
    assert 'channel_binding' not in url.query
    assert options['ssl'].verify_mode == ssl.CERT_REQUIRED
    assert options['ssl'].check_hostname


def test_checkpoint_tls_cannot_be_downgraded_by_input_url():
    result = checkpoint_database_url('postgresql://user:p%40ss@db.example/db?sslmode=disable', True)
    options = conninfo_to_dict(result)
    assert options['password'] == 'p@ss'
    assert options['sslmode'] == 'verify-full'
    assert options['sslrootcert']


def test_development_transport_is_unchanged():
    url = 'postgresql+asyncpg://user:pass@localhost/db'
    assert async_database_options(url, False) == (url, {})
    assert checkpoint_database_url(url, False) == url


def test_non_postgres_url_rejected_in_production():
    with pytest.raises(ValueError):
        async_database_options('sqlite:///file.db', True)


def test_migrations_verify_tls_with_url_encoded_password():
    from sqlalchemy.engine import make_url
    from backend.app.database_transport import migration_database_url
    result = make_url(migration_database_url('postgresql://u:p%40ss@db.example/db?sslmode=disable', True))
    assert result.password == 'p@ss'
    assert result.query['sslmode'] == 'verify-full'
    assert result.query['sslrootcert']


def test_operator_ca_bundle_is_used_for_async_connections():
    from unittest.mock import patch
    with patch('backend.app.database_transport.ssl.create_default_context') as context:
        async_database_options('postgresql://u:p@db.example/db', True, '/etc/secrets/app-db-ca.crt')
    context.assert_called_once_with(cafile='/etc/secrets/app-db-ca.crt')


def test_provider_ca_from_url_is_preserved_for_checkpoint_and_migration():
    from backend.app.database_transport import migration_database_url
    from sqlalchemy.engine import make_url
    url = 'postgresql://u:p@db.example/db?sslmode=disable&sslrootcert=/etc/secrets/provider.crt'
    assert conninfo_to_dict(checkpoint_database_url(url, True))['sslrootcert'] == '/etc/secrets/provider.crt'
    result = make_url(migration_database_url(url, True))
    assert result.query['sslrootcert'] == '/etc/secrets/provider.crt'
    assert result.query['sslmode'] == 'verify-full'


def test_missing_operator_ca_fails_closed():
    with pytest.raises(OSError):
        async_database_options('postgresql://u:p@db.example/db', True, '/nonexistent/provider-ca.crt')


@pytest.mark.parametrize('host', ['aws-0-ap-southeast-1.pooler.supabase.com', 'db.example.supabase.co'])
def test_supabase_transport_uses_bundled_ca_for_all_drivers(host):
    from sqlalchemy.engine import make_url
    from backend.app.database_transport import migration_database_url

    url = f'postgresql://u:p@{host}/db'
    _, options = async_database_options(url, True)
    assert options['ssl'].check_hostname
    assert any(
        ('commonName', 'Supabase Root 2021 CA') in group
        for cert in options['ssl'].get_ca_certs()
        for group in cert['subject']
    )
    migration = make_url(migration_database_url(url, True))
    checkpoint = conninfo_to_dict(checkpoint_database_url(url, True))
    assert migration.query['sslrootcert'] == checkpoint['sslrootcert']
    assert checkpoint['sslrootcert'].endswith('/supabase-prod-ca-2021.crt')
    assert migration.query['sslmode'] == checkpoint['sslmode'] == 'verify-full'


def test_unrelated_host_does_not_use_supabase_ca():
    import certifi
    url = 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com.example.org/db'
    assert conninfo_to_dict(checkpoint_database_url(url, True))['sslrootcert'] == certifi.where()


@pytest.mark.parametrize(('host', 'port', 'expected_port'), [
    ('aws-0-ap-southeast-1.pooler.supabase.com', 6543, 5432),
    ('aws-0-ap-southeast-1.pooler.supabase.com', 5432, 5432),
    ('db.example.supabase.co', 6543, 6543),
    ('other.example.com', 6543, 6543),
])
def test_only_shared_supabase_transaction_port_switches_to_session(host, port, expected_port):
    from sqlalchemy.engine import make_url
    from backend.app.database_transport import migration_database_url

    url = f'postgresql://user.project:p%40ss@{host}:{port}/db'
    runtime, _ = async_database_options(url, True)
    migration = make_url(migration_database_url(url, True))
    checkpoint = conninfo_to_dict(checkpoint_database_url(url, True))
    assert runtime.port == migration.port == int(checkpoint['port']) == expected_port
    assert runtime.host == migration.host == checkpoint['host'] == host
    assert runtime.password == migration.password == checkpoint['password'] == 'p@ss'
