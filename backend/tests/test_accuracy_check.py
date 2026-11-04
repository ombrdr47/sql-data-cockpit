from decimal import Decimal
from backend.ops.check_accuracy import same_results


def test_comparison_ignores_aliases_but_preserves_values():
    assert same_results([{'count': 1}], [{'n': Decimal('1.0')}], False)
    assert not same_results([{'count': 2}], [{'n': 1}], False)


def test_order_and_duplicate_rows_are_checked():
    a, b = [{'x': 1}, {'x': 2}], [{'y': 2}, {'y': 1}]
    assert same_results(a, b, False)
    assert not same_results(a, b, True)
    assert not same_results([{'x': 1}, {'x': 1}], [{'x': 1}], False)


def test_empty_is_different_from_null():
    assert same_results([], [], True)
    assert not same_results([], [{'n': None}], False)
