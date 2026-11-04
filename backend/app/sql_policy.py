"""Conservative policy for SQL sent to a customer database."""
import sqlglot
from sqlglot import expressions as exp

# Only reviewed, non-side-effecting analytics functions. Unknown functions fail closed.
SAFE_FUNCTIONS = frozenset('''abs avg count sum min max coalesce nullif round floor ceil ceiling
lower upper length char_length concat concat_ws substring trim ltrim rtrim replace split_part
cast try_cast extract date_trunc timestamp_trunc date_part current_date current_timestamp current_time
row_number rank dense_rank lag lead first_value last_value nth_value ntile
percent_rank cume_dist percentiles percentile_cont percentile_disc
stddev stddev_pop stddev_samp variance var_pop var_samp
 to_char to_date to_timestamp greatest least power sqrt mod sign
and or case if ifnull date timestamp interval'''.split())


def check_sql_policy(sql: str) -> None:
    statements = sqlglot.parse(sql, dialect='postgres')
    if len(statements) != 1 or not isinstance(statements[0], exp.Select):
        raise ValueError('Only one SELECT query is allowed.')
    statement = statements[0]
    forbidden = tuple(getattr(exp, name) for name in (
        'Insert', 'Update', 'Delete', 'Create', 'Drop', 'Alter', 'Command',
        'Transaction', 'Into', 'Lock', 'Copy', 'Merge', 'Set', 'Use', 'Grant',
    ) if hasattr(exp, name))
    for node in statement.walk():
        if isinstance(node, forbidden):
            raise ValueError('Writes, locking, and session commands are not allowed anywhere in a query.')
        if isinstance(node, exp.Table) and (node.catalog or node.db not in ('', 'public')):
            raise ValueError('Only tables in the public schema are allowed.')
        if isinstance(node, exp.Dot):
            raise ValueError('Qualified functions and object access are not allowed.')
        if isinstance(node, exp.Func):
            name = node.name if isinstance(node, exp.Anonymous) else node.sql_name()
            if name.lower() not in SAFE_FUNCTIONS:
                raise ValueError(f'Function {name} is not approved for analytics.')


def bounded_query(sql: str, row_cap: int) -> str:
    check_sql_policy(sql)
    statement = sqlglot.parse_one(sql, dialect='postgres')
    # Apply an outer limit without increasing an existing, smaller LIMIT.
    return f'SELECT * FROM ({statement.sql(dialect="postgres")}) AS cockpit_result LIMIT {int(row_cap)}'
