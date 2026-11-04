"""Small, repeatable live-model evaluation against public Chinook sample data.

Runs the real schema selection, SQL generation, validation and execution nodes.
Only this explicit evaluation harness executes validated proposals automatically;
production approval is unchanged. No customer sources or checkpoint records used.
"""
import argparse
import asyncio
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
import time

from sqlalchemy import select, delete
from uuid import uuid4
from backend.app.config import get_settings
from backend.app.db import get_appdb_session_factory, get_appdb_engine, get_chinook_engine, execute_chinook_query
from backend.app.models import User
from backend.app.nodes.table_selector import table_selector_node
from backend.app.nodes.generate_sql import generate_sql_node
from backend.app.nodes.validate_sql import validate_sql_node
from backend.app.nodes.execute_sql import execute_sql_node

CASES = [
    ('count', 'How many artists are there? Return only the count.', 'SELECT COUNT(*) FROM artist', False, ''),
    ('grouping', 'Return billing country and total invoice revenue for each country, sorted by country.', 'SELECT billing_country, SUM(total) FROM invoice GROUP BY billing_country ORDER BY billing_country', True, ''),
    ('join', 'For each artist who has albums, return the artist name and number of albums, sorted by name.', 'SELECT a.name, COUNT(*) FROM artist a JOIN album b ON a.artist_id=b.artist_id GROUP BY a.artist_id,a.name ORDER BY a.name', True, ''),
    ('top_n', 'Return the five tracks with the greatest duration: track name and milliseconds, sorted by milliseconds descending and track ID ascending to break ties.', 'SELECT name,milliseconds FROM track ORDER BY milliseconds DESC,track_id ASC LIMIT 5', True, ''),
    ('null', 'How many customers have no company (company IS NULL)? Return only the count.', 'SELECT COUNT(*) FROM customer WHERE company IS NULL', False, ''),
    ('empty', "Return customer ID and country for customers whose country is exactly 'Atlantis'.", "SELECT customer_id,country FROM customer WHERE country='Atlantis'", False, ''),
    ('follow_up', 'And how many of those customers are there? Return only the count.', "SELECT COUNT(*) FROM customer WHERE country='France'", False, 'user: Show customers in France.\nassistant: Here are customers whose country is France.'),
    ('date_range', 'Return total invoice revenue for calendar year 2010 only. Return one total.', "SELECT SUM(total) FROM invoice WHERE invoice_date >= '2010-01-01' AND invoice_date < '2011-01-01'", False, ''),
]


def normalize(value):
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        return str(Decimal(str(value)).quantize(Decimal('0.000001')))
    return value.isoformat() if hasattr(value, 'isoformat') else value


def comparable(rows):
    return [tuple(normalize(v) for v in row.values()) for row in rows]


def same_results(actual, expected, ordered):
    a, b = comparable(actual), comparable(expected)
    return a == b if ordered else Counter(a) == Counter(b)


async def run(ci=False):
    settings = get_settings()
    if settings.environment.lower() == 'production':
        raise SystemExit('Run this sample-data evaluation in development/staging only.')
    temporary_user_id = None
    async with get_appdb_session_factory()() as session:
        if ci:
            from backend.app.crypto import encrypt_field, get_fernet
            if not settings.groq_api_key:
                raise SystemExit('CI accuracy evaluation requires a configured model key.')
            temporary_user_id = uuid4()
            user = User(id=temporary_user_id, email=f'eval-{temporary_user_id}@example.com',
                        username=f'eval_{temporary_user_id.hex[:12]}', hashed_password='not-a-login-hash',
                        email_verified=True, groq_api_key_enc=encrypt_field(settings.groq_api_key, get_fernet(settings.jwt_secret_key)))
            session.add(user)
            await session.commit()
        else:
            user = await session.scalar(select(User).where(User.email == 'demo@chinook.dev'))
            if user is None:
                raise SystemExit('A development demo account is required.')
        user_id = str(user.id)
    report = {'run_at': datetime.now(timezone.utc).isoformat(), 'model': settings.groq_model,
              'scope': '8 fixed Chinook sample-data cases; no customer-schema accuracy claim', 'cases': []}
    try:
        for name, question, expected_sql, ordered, context in CASES:
            start = time.monotonic()
            state = {'user_id': user_id, 'question': question, 'conversation_context': context,
                     'node_path': [], 'retry_count': 0, 'connection_id': None}
            record = {'name': name, 'passed': False}
            try:
                # Validate reference SQL before spending a model request.
                expected = await execute_chinook_query(expected_sql, row_cap=settings.sql_row_cap)
                state = await table_selector_node(state)
                first_pass = False
                for attempt in range(settings.max_retries + 1):
                    state['retry_count'] = attempt
                    state = await generate_sql_node(state)
                    state = await validate_sql_node(state)
                    if not state['sql_valid']:
                        if str(state.get('validation_error', '')).startswith('CANNOT_ANSWER'):
                            break
                        continue
                    state = await execute_sql_node(state)
                    if not state.get('execution_error'):
                        first_pass = attempt == 0
                        break
                actual = state.get('sql_results')
                record.update(sql=state.get('generated_sql'), attempts=state['retry_count'] + 1,
                              passed=actual is not None and not state.get('execution_error') and same_results(actual, expected, ordered),
                              first_attempt_executed=first_pass,
                              expected_rows=len(expected), actual_rows=len(actual) if actual is not None else None)
                if not record['passed']:
                    record['failure'] = 'validation_or_execution' if actual is None else 'result_mismatch'
            except Exception as exc:
                # Never print raw provider/connection errors, which can contain secrets.
                record['failure'] = type(exc).__name__
            record['seconds'] = round(time.monotonic() - start, 2)
            report['cases'].append(record)
            output = Path("backend/.local/accuracy-report.json")
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(report, indent=2))
            print(f"{name}: {'PASS' if record['passed'] else 'FAIL'} ({record['seconds']}s)", flush=True)
    finally:
        if temporary_user_id:
            async with get_appdb_session_factory()() as session:
                await session.execute(delete(User).where(User.id == temporary_user_id))
                await session.commit()
        await get_appdb_engine().dispose()
        await get_chinook_engine().dispose()
    report['passed'] = sum(case['passed'] for case in report['cases'])
    report['total'] = len(CASES)
    output = Path('backend/.local/accuracy-report.json')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2))
    print(f"Accuracy: {report['passed']}/{report['total']}; report: {output}")
    if report['passed'] != report['total']:
        raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ci', action='store_true', help='Create and clean up a disposable evaluation identity.')
    args = parser.parse_args()
    asyncio.run(run(ci=args.ci))
