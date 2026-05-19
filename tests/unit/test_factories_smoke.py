"""Smoke test: factories importables sin DB."""
def test_user_factory_importable():
    from tests.factories import UserFactory
    assert UserFactory is not None


def test_work_order_factory_importable():
    from tests.factories import WorkOrderFactory
    assert WorkOrderFactory is not None
